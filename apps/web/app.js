import { button, element, request } from "./dom.js";
import { showReport } from "./report.js";

const sections = {
  home: document.querySelector("#home"),
  active: document.querySelector("#active"),
  report: document.querySelector("#report"),
};
const form = document.querySelector("#audit-form");
const target = document.querySelector("#target");
const formError = document.querySelector("#form-error");
const historyList = document.querySelector("#history-list");
const storageKey = "despecto.recent";
let generation = 0;
let disposeReport;
let recent = readRecent();

for (const example of document.querySelectorAll("[data-example]")) {
  example.addEventListener("click", () => {
    target.value = example.dataset.example;
    formError.hidden = true;
    target.focus();
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  formError.hidden = true;
  const requestGeneration = generation;
  try {
    const job = await request("/api/audits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: target.value }),
    });
    if (requestGeneration === generation) openAudit(job.id);
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

window.addEventListener("popstate", route);
route();

function route() {
  const id = /^#audit\/([a-f\d-]+)$/.exec(location.hash)?.[1];
  if (id) void follow(id);
  else showHome();
}

function openAudit(id) {
  history.pushState(null, "", `#audit/${id}`);
  route();
}

function newAudit() {
  history.pushState(null, "", location.pathname);
  showHome();
  target.focus();
}

function showHome() {
  generation += 1;
  disposeReport?.();
  disposeReport = undefined;
  show("home");
  renderHistory();
}

function show(name) {
  for (const [key, node] of Object.entries(sections)) node.hidden = key !== name;
  window.scrollTo(0, 0);
}

async function follow(id) {
  const current = ++generation;
  disposeReport?.();
  disposeReport = undefined;
  const card = element("div", "card active-card");
  const kicker = element("span", "eyebrow", "AUDIT IN PROGRESS");
  const title = element("h1", "", "Loading audit");
  const status = element("p", "", "Connecting to the audit queue.");
  const progress = element("progress");
  progress.max = 100;
  progress.value = 0;
  progress.setAttribute("aria-label", "Audit progress");
  card.append(kicker, title, status, progress);
  sections.active.replaceChildren(card);
  show("active");

  try {
    while (current === generation) {
      const job = await request(`/api/audits/${id}`);
      if (current !== generation) return;
      if (job.status === "complete") {
        remember(job);
        show("report");
        disposeReport = showReport(sections.report, job, newAudit);
        return;
      }
      if (job.status === "failed") throw new Error(job.error);
      if (title.textContent !== job.target.label) title.textContent = job.target.label;
      if (status.textContent !== job.stage) status.textContent = job.stage;
      progress.value = job.progress;
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
  } catch (error) {
    if (current !== generation) return;
    if (error.status === 404) {
      recent = recent.filter((audit) => audit.id !== id);
      saveRecent();
    }
    kicker.textContent = "AUDIT UNAVAILABLE";
    title.textContent = "Couldn’t open this audit";
    status.textContent = error.status === 404 ? "This report has expired. Run a new audit to check the target again." : error.message;
    progress.remove();
    card.append(button("Back to workspace", "button", newAudit));
  }
}

function renderHistory() {
  historyList.replaceChildren();
  if (!recent.length) {
    historyList.append(element("p", "", "Completed audits will appear here."));
    return;
  }
  for (const audit of recent) {
    const row = button("", "history-row", () => openAudit(audit.id));
    const arrow = element("span", "", "↗");
    arrow.setAttribute("aria-hidden", "true");
    row.append(element("span", "category", audit.source === "repo" ? "Repo" : "Site"), element("strong", "", audit.label), arrow);
    historyList.append(row);
  }
}

function remember(job) {
  recent = [{ id: job.id, ...job.target }, ...recent.filter(({ id }) => id !== job.id)].slice(0, 6);
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
