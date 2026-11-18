import { button, element, request } from "./dom.js";
import { showReport } from "./report.js";
import { createAuditProgress } from "./audit-progress.js";

const sections = {
  home: document.querySelector("#home"),
  active: document.querySelector("#active"),
  report: document.querySelector("#report"),
};
const form = document.querySelector("#audit-form");
const target = document.querySelector("#target");
const historyList = document.querySelector("#history-list");
const storageKey = "despecto.recent";
const statuses = { queued: "Queued", running: "In progress", complete: "Complete", failed: "Failed", unavailable: "Unavailable" };
let navigation;
let disposeReport;
let recent = readRecent();

for (const example of document.querySelectorAll("[data-example]")) {
  example.addEventListener("click", () => {
    target.value = example.dataset.example;
    void startAudit(target.value);
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void startAudit(target.value.trim());
});

window.addEventListener("popstate", route);
route();

async function startAudit(url) {
  const signal = beginNavigation();
  const panel = showProgress(url);
  try {
    const job = await request("/api/audits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    });
    if (signal.aborted) return;
    remember(job);
    openAudit(job.id, job, panel);
  } catch (error) {
    if (signal.aborted) return;
    panel.fail("Audit couldn’t start", isConnectionError(error)
      ? "DeSpecto did not respond. Check that npm start is still running, then try again."
      : error.message, [["Edit URL", () => newAudit(url)], ["Retry audit", () => startAudit(url)]]);
  }
}

function route() {
  const id = /^#audit\/([a-f\d-]+)$/.exec(location.hash)?.[1];
  if (id) void follow(id);
  else showHome();
}

function openAudit(id, job, panel) {
  history.pushState(null, "", `#audit/${id}`);
  void follow(id, job, panel);
}

function newAudit(url = "") {
  history.pushState(null, "", location.pathname);
  target.value = url;
  showHome();
  target.focus();
}

function beginNavigation() {
  navigation?.abort();
  navigation = new AbortController();
  disposeReport?.();
  disposeReport = undefined;
  return navigation.signal;
}

function showHome() {
  beginNavigation();
  show("home");
  renderHistory();
}

function show(name) {
  for (const [key, node] of Object.entries(sections)) node.hidden = key !== name;
  window.scrollTo(0, 0);
}

function showProgress(label) {
  const panel = createAuditProgress(label);
  sections.active.replaceChildren(panel.card);
  show("active");
  panel.focus();
  return panel;
}

async function follow(id, job, visiblePanel) {
  const signal = beginNavigation();
  const saved = recent.find((audit) => audit.id === id);
  const panel = visiblePanel ?? showProgress(saved?.label);
  let missed = 0;

  while (!signal.aborted) {
    try {
      job ??= await request(`/api/audits/${id}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
      if (signal.aborted) return;
    } catch (error) {
      if (signal.aborted) return;
      if (isConnectionError(error) && missed < 3) {
        missed += 1;
        panel.reconnect(missed);
        await pause(1000 * missed);
        continue;
      }
      if (error.status === 404) {
        const interrupted = saved && ["queued", "running"].includes(saved.status);
        if (saved) saveAudit({ ...saved, status: "unavailable" });
        panel.fail(interrupted ? "Audit interrupted" : "Audit unavailable",
          interrupted ? "The server no longer has this run. Start a new audit for the same URL."
            : "This report could not be found on the current server.",
          saved?.url ? [["Run again", () => startAudit(saved.url)], ["Back to workspace", () => newAudit()]]
            : [["Back to workspace", () => newAudit()]]);
      } else {
        panel.fail("Connection to audit lost", "Check that DeSpecto is running, then reconnect to this audit.",
          [["Reconnect", () => follow(id)], ["Back to workspace", () => newAudit()]]);
      }
      return;
    }
    missed = 0;
    remember(job);
    if (job.status === "complete") {
      show("report");
      disposeReport = showReport(sections.report, job, () => newAudit());
      return;
    }
    if (job.status === "failed") {
      const url = job.target.url;
      panel.fail(`Audit failed for ${job.target.label}`, job.error,
        [["Retry audit", () => startAudit(url)], ["Edit URL", () => newAudit(url)]]);
      return;
    }
    panel.update(job);
    job = undefined;
    await pause(550);
  }
}

function isConnectionError(error) {
  return error instanceof TypeError || error.name === "TimeoutError" || error.status >= 500;
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderHistory() {
  historyList.replaceChildren();
  if (!recent.length) {
    historyList.append(element("p", "", "Your audits will appear here after you run one."));
    return;
  }
  for (const audit of recent) {
    const row = button("", "history-row", () => openAudit(audit.id));
    const arrow = element("span", "", "↗");
    arrow.setAttribute("aria-hidden", "true");
    const status = element("span", "history-status", statuses[audit.status] ?? statuses.complete);
    status.dataset.state = audit.status ?? "complete";
    row.append(element("span", "category", audit.source === "repo" ? "Repo" : "Site"), element("strong", "", audit.label), status, arrow);
    historyList.append(row);
  }
}

function remember(job) {
  saveAudit({ id: job.id, status: job.status, ...job.target });
}

function saveAudit(audit) {
  const existing = recent.find((item) => item.id === audit.id);
  if (existing?.status === audit.status) return;
  recent = [audit, ...recent.filter(({ id }) => id !== audit.id)].slice(0, 6);
  saveRecent();
}

function readRecent() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(saved) ? saved.filter((item) => item?.id && item?.label).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecent() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(recent));
  } catch {
    // Reports remain available in the current tab if browser storage is disabled.
  }
}
