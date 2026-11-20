import { renderSource } from "./design-preview.ts";
import { designConcept, designDirection, type DesignPresets, type CompletedJob } from "../../shared/contracts.ts";
import { button, element, errorMessage, request } from "./dom.ts";

export function designPanel(job: CompletedJob, presets?: DesignPresets) {
  const host = element("div", "studio-launch");
  const dialog = element("dialog", "design-drawer");
  const header = element("header", "drawer-header");
  const heading = element("h2", "", "Redesign studio");
  heading.id = "studio-heading";
  dialog.setAttribute("aria-labelledby", heading.id);
  header.append(heading, button("Close", "button", () => dialog.close()));
  const controls = element("div", "design-tools");
  const label = element("label", "", "Art direction ");
  const select = element("select");
  for (const value of designDirection.options) select.add(new Option(value[0].toUpperCase() + value.slice(1), value));
  label.append(select);
  const status = element("p", "studio-status");
  status.setAttribute("role", "status");
  const tabs = element("div", "studio-switch");
  const surface = element("div", "studio-surface");
  const preview = element("article", "site-concept");
  const notes = element("div", "design-notes");
  const modes = ["Live site", "Saved capture", "Redesign"] as const;
  type Mode = typeof modes[number];
  let active: Mode = presets ? "Saved capture" : "Live site";
  let available = false;
  let requestController: AbortController | undefined;
  const buttons = modes.map(mode => button(mode, "", () => display(mode)));
  const width = element("select");
  width.setAttribute("aria-label", "Preview width");
  width.add(new Option("Full width", "wide"));
  width.add(new Option("Phone width", "phone"));
  width.onchange = () => { surface.dataset.width = width.value; if (active === "Saved capture") display(active); };
  const external = element("a", "", "Open original site");
  external.href = job.target.url;
  external.target = "_blank";
  external.rel = "noopener noreferrer";
  tabs.append(...buttons, width);
  const help = element("p", "studio-hint", "If the site blocks embedded previews, select Saved capture or open the original site.");
  const generate = button(presets ? "Preview sample redesign" : "Generate redesign", "button primary", async () => {
    const controller = new AbortController();
    requestController = controller;
    generate.disabled = select.disabled = true;
    status.textContent = "Designing from the audited screenshots…";
    try {
      const concept = presets && job.result.designSource
        ? { plan: presets[designDirection.parse(select.value)], source: job.result.designSource, mode: "sample" }
        : await request("/api/audits/" + job.id + "/design?direction=" + select.value, designConcept, { method: "POST", signal: controller.signal });
      if (controller.signal.aborted) return;
      preview.className = "site-concept " + select.value;
      renderSource(preview, concept.source, concept.plan);
      notes.replaceChildren(element("h3", "", "Design decision"), element("p", "", concept.plan.rationale));
      available = true;
      status.textContent = concept.mode === "theme"
        ? "Theme preview ready. Model guidance was unavailable; generate again to retry."
        : "Redesign ready.";
      display("Redesign");
    } catch (error) { if (!controller.signal.aborted) status.textContent = errorMessage(error); }
    finally { if (requestController === controller) generate.disabled = select.disabled = false; }
  });
  select.onchange = () => { available = false; status.textContent = ""; display(active === "Redesign" ? "Saved capture" : active); };
  controls.append(label, generate);
  function display(mode: Mode) {
    active = mode;
    buttons.forEach((control, index) => {
      control.setAttribute("aria-pressed", String(modes[index] === mode));
      control.disabled = modes[index] === "Redesign" && !available;
    });
    surface.replaceChildren();
    surface.scrollTop = 0;
    notes.hidden = mode !== "Redesign";
    help.hidden = mode !== "Live site";
    if (mode === "Redesign") surface.append(preview);
    else if (mode === "Live site") {
      const frame = element("iframe");
      frame.title = "Live view of " + job.target.label;
      frame.sandbox.add("allow-scripts");
      frame.referrerPolicy = "no-referrer";
      frame.src = job.target.url;
      surface.append(frame);
    } else {
      const shots = job.result.screenshots ?? [];
      const shot = shots.find(s => s.view === (width.value === "phone" ? "mobile" : "desktop")) ?? shots[0];
      if (shot) { const img = element("img"); img.alt = "Audited " + shot.view + " capture"; img.src = shot.url; surface.append(img); }
      else surface.append(element("p", "", "This report has no saved screenshot."));
    }
  }
  dialog.addEventListener("close", () => {
    requestController?.abort();
    surface.replaceChildren();
    status.textContent = "";
  });
  dialog.append(header, controls, status, tabs, surface, help, external, notes);
  host.append(button("Redesign studio", "button", () => {
    document.querySelector("video")?.pause();
    dialog.showModal();
    display(active);
  }), dialog);
  return host;
}
