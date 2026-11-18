import { button, element } from "./dom.js";

const steps = {
  repo: [[0, "Queue"], [12, "Fetch source"], [38, "Index files"], [65, "Check claims"]],
  website: [[0, "Queue"], [21, "Desktop scan"], [56, "Mobile scan"], [82, "Review evidence"]],
};

export function createAuditProgress(label) {
  const card = element("div", "active-card card");
  const header = element("div", "audit-status-header");
  const badge = element("span", "audit-badge", "Starting");
  const title = element("h1", "", label || "Opening audit");
  title.tabIndex = -1;
  const stage = element("p", "audit-stage", "Connecting to DeSpecto…");
  stage.setAttribute("role", "status");
  const meter = element("div", "audit-meter");
  const progress = element("progress");
  progress.max = 100;
  progress.setAttribute("aria-label", "Audit progress");
  const percent = element("span", "audit-percent");
  percent.setAttribute("aria-hidden", "true");
  const timeline = element("ol", "audit-steps");
  const actions = element("div", "audit-actions");
  header.append(badge);
  meter.append(progress, percent);
  card.append(header, title, stage, meter, timeline, actions);

  let activeSource;
  let markers = [];

  return {
    card,
    focus: () => title.focus({ preventScroll: true }),
    update(job) {
      if (title.textContent !== job.target.label) title.textContent = job.target.label;
      const queued = job.status === "queued";
      badge.textContent = queued ? "Queued" : "In progress";
      badge.dataset.state = job.status;
      if (stage.textContent !== job.stage) stage.textContent = job.stage;
      progress.value = job.progress;
      percent.textContent = `${job.progress}%`;
      if (job.target.source !== activeSource) {
        activeSource = job.target.source;
        markers = steps[activeSource].map(([threshold, name]) => [threshold, element("li", "", name)]);
        timeline.replaceChildren(...markers.map(([, marker]) => marker));
      }
      const current = markers.findLastIndex(([threshold]) => threshold <= job.progress);
      for (const [index, [, marker]] of markers.entries()) {
        marker.dataset.state = index < current ? "done" : index === current ? "active" : "waiting";
        if (index === current) marker.setAttribute("aria-current", "step");
        else marker.removeAttribute("aria-current");
      }
    },
    reconnect(attempt) {
      badge.textContent = "Reconnecting";
      badge.dataset.state = "reconnecting";
      stage.textContent = `Lost connection to the audit server. Reconnecting (${attempt}/3)…`;
    },
    fail(heading, explanation, buttons) {
      badge.textContent = "Needs attention";
      badge.dataset.state = "failed";
      title.textContent = heading;
      stage.textContent = explanation;
      meter.hidden = true;
      timeline.hidden = true;
      actions.replaceChildren(...buttons.map(([text, onClick], index) =>
        button(text, index === 0 ? "button primary" : "button", onClick)));
    },
  };
}
