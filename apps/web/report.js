import { button, element, request, screenshot, showEvidence } from "./dom.js";
import { createWalkthrough } from "./walkthrough.js";

const severities = ["high", "medium", "low"];

export function showReport(container, job, onNewAudit) {
  const { target, result } = job;
  const heading = element("header", "report-heading");
  const text = element("div");
  const title = element("h1", "", target.label);
  title.tabIndex = -1;
  const link = element("a", "target-link", target.url);
  link.href = target.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  text.append(element("span", "eyebrow", target.source === "repo" ? "REPOSITORY AUDIT" : "WEBSITE AUDIT"), title, link);
  for (const note of result.notes ?? []) text.append(element("p", "report-notes", note));
  heading.append(text, button("New audit", "button", onNewAudit));

  const tabs = element("nav", "report-tabs");
  tabs.setAttribute("aria-label", "Audit sections");
  const contents = element("div");
  let disposeWalkthrough;
  const reportTab = button(`Findings (${result.findings.length})`, "", () => switchTo("findings"));
  const walkthroughTab = button("Walkthrough", "", () => switchTo("walkthrough"));
  tabs.append(reportTab, walkthroughTab);
  container.replaceChildren(heading, tabs, contents);

  function switchTo(view) {
    const findingsVisible = view === "findings";
    if (reportTab.getAttribute("aria-pressed") === String(findingsVisible)) return;
    reportTab.setAttribute("aria-pressed", String(findingsVisible));
    walkthroughTab.setAttribute("aria-pressed", String(!findingsVisible));
    disposeWalkthrough?.();
    disposeWalkthrough = undefined;
    if (findingsVisible) renderFindings(contents, job);
    else disposeWalkthrough = createWalkthrough(contents, job);
  }

  switchTo("findings");
  title.focus({ preventScroll: true });
  return () => disposeWalkthrough?.();
}

function renderFindings(container, job) {
  const findings = [...job.result.findings].sort((left, right) =>
    severities.indexOf(left.severity) - severities.indexOf(right.severity));
  const layout = element("div", "report-grid");
  const sidebar = element("section", "card");
  const detail = element("section", "card detail");
  const heading = element("div", "card-header");
  const filters = element("div", "filters");
  const list = element("div", "finding-list");
  heading.append(element("h2", "", "Findings"), filters);
  sidebar.append(heading, list);
  layout.append(sidebar, detail);
  container.replaceChildren(layout);
  let selection = findings[0];
  let filter = "all";
  const labels = { all: "All", high: "High", medium: "Medium", low: "Low" };
  const filterButtons = Object.keys(labels).map((name) => {
    const count = name === "all" ? findings.length : findings.filter((item) => item.severity === name).length;
    return [name, button(`${labels[name]} ${count}`, "", () => {
      filter = name;
      update();
    })];
  });
  filters.append(...filterButtons.map(([, control]) => control));
  update();

  function update() {
    for (const [name, control] of filterButtons) control.setAttribute("aria-pressed", String(name === filter));
    const visible = filter === "all" ? findings : findings.filter((item) => item.severity === filter);
    if (!visible.includes(selection)) selection = visible[0];
    list.replaceChildren();
    if (!visible.length) list.append(element("p", "empty-text", findings.length ? "No findings at this severity." : "No issues found by the audit checks."));
    const rows = visible.map((item) => {
      const row = button("", "finding-button", () => {
        selection = item;
        showSelection();
      });
      row.append(element("span", `severity ${item.severity}`, item.severity), element("strong", "", item.title));
      list.append(row);
      return [item, row];
    });
    showSelection();

    function showSelection() {
      for (const [item, row] of rows) row.setAttribute("aria-pressed", String(item === selection));
      renderDetail(detail, job, selection);
    }
  }
}

function renderDetail(detail, job, item) {
  detail.replaceChildren();
  if (!item) {
    const captures = job.result.screenshots ?? [];
    detail.append(element("h2", "", captures.length ? "Screenshots" : "Audit evidence"));
    if (!captures.length) {
      detail.append(element("p", "detail-copy", "Evidence appears here when a check records a finding."));
      return;
    }
    const controls = element("div", "filters");
    const current = element("div", "fix-section");
    const buttons = captures.map((capture) => button(capture.view === "desktop" ? "Desktop" : "Mobile", "", () => select(capture)));
    controls.append(...buttons);
    detail.append(controls, current);
    select(captures[0]);
    return;

    function select(capture) {
      for (const [index, control] of buttons.entries()) control.setAttribute("aria-pressed", String(captures[index] === capture));
      current.replaceChildren();
      showEvidence(current, { ...capture, screenshot: capture.url });
    }
  }

  detail.append(
    element("span", `severity ${item.severity}`, item.severity),
    element("h2", "", item.title),
    element("p", "detail-copy", item.explanation),
  );
  showEvidence(detail, item.evidence, { repository: job.target.url, revision: job.result.revision });
  if (item.fixAvailable) renderFix(detail, job.id, item);
}

function renderFix(detail, id, item) {
  const section = element("section", "fix-section");
  const preview = element("div");
  const action = button("Show fix", "button", async () => {
    if (item.fix) {
      preview.hidden = !preview.hidden;
      action.textContent = preview.hidden ? "Show fix" : "Hide fix";
      return;
    }
    action.disabled = true;
    action.textContent = "Preparing fix…";
    try {
      item.fix = await request(`/api/audits/${id}/findings/${item.id}/fix`, { method: "POST" });
      fillPreview();
    } catch (error) {
      const message = element("p", "report-error", error.message);
      message.setAttribute("role", "alert");
      preview.replaceChildren(message);
      action.textContent = "Retry fix";
    } finally {
      action.disabled = false;
    }
  });
  section.append(action, preview);
  detail.append(section);
  if (item.fix) fillPreview();

  function fillPreview() {
    const fix = item.fix;
    const summary = element("p", "fix-summary");
    summary.append(element("strong", "", fix.verified ? "Recheck passed. " : "Recheck inconclusive. "), fix.summary);
    preview.replaceChildren(summary);
    action.textContent = "Hide fix";
    if (fix.kind === "diff") {
      const patch = element("pre", "patch", fix.patch);
      patch.tabIndex = 0;
      const download = element("a", "button", "Download patch");
      download.href = `/api/audits/${id}/findings/${item.id}/patch`;
      download.download = "despecto-fix.patch";
      const actions = element("div", "fix-download");
      actions.append(download);
      preview.append(patch, actions);
    } else {
      const comparison = element("div", "comparison");
      for (const [label, url] of [["Before", fix.before], ["After", fix.after]]) {
        const card = element("figure");
        card.append(element("figcaption", "", label), screenshot({
          ...item.evidence, ...(label === "Before" ? fix.beforeSize : fix.afterSize),
          screenshot: url, box: label === "Before" ? fix.beforeBox : null,
        }, `${label} applying the proposed change`));
        comparison.append(card);
      }
      preview.append(comparison);
    }
  }
}
