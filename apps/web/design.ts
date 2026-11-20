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
      const concept = presets ? presets[designDirection.parse(select.value)] : await request("/api/audits/" + job.id + "/design?direction=" + select.value, designConcept, { method: "POST", signal: controller.signal });
      if (controller.signal.aborted) return;
      preview.className = "site-concept " + select.value;
      preview.style.setProperty("--concept-paper", concept.paper);
      preview.style.setProperty("--concept-accent", concept.accent);
      const mast = element("header", "prototype-hero");
      mast.append(element("strong", "", job.target.label), element("h3", "", concept.headline), element("p", "", concept.purpose));
      const stories = element("div", "prototype-stories");
      preview.replaceChildren(mast, stories);
      if (select.value === "minimal") {
        for (const [index, section] of concept.sections.entries()) {
          const entry = element("details");
          entry.open = index === 0;
          entry.append(element("summary", "", section.heading), element("p", "", section.copy));
          stories.append(entry);
        }
      } else {
        const nav = element("nav", "prototype-nav");
        nav.setAttribute("aria-label", "Preview sections");
        mast.after(nav);
        for (const section of concept.sections) {
          const block = element("section");
          block.tabIndex = -1;
          block.append(element("h4", "", section.heading), element("p", "", section.copy));
          stories.append(block);
          nav.append(button(section.label, "", () => {
            block.focus({ preventScroll: true });
            surface.scrollTop += block.getBoundingClientRect().top - surface.getBoundingClientRect().top - 8;
          }));
        }
      }
      notes.replaceChildren(element("h3", "", "Design decisions"));
      for (const change of concept.changes) notes.append(element("strong", "", change.observation), element("p", "", change.proposal));
      notes.append(element("strong", "", "Typography"), element("p", "", concept.typography), element("strong", "", "Mobile layout"), element("p", "", concept.mobile));
      available = true;
      status.textContent = "Interactive concept ready.";
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
