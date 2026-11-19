import { designConcept, designDirection } from "../../shared/contracts.ts";
import { button, element, errorMessage, request } from "./dom.ts";

export function designPanel(id: string) {
  const panel = element("details", "card design-panel");
  panel.append(element("summary", "", "Explore a website redesign"));
  const tools = element("div", "design-tools");
  const label = element("label", "", "Art direction ");
  const select = element("select");
  for (const value of designDirection.options) select.add(new Option(value[0].toUpperCase() + value.slice(1), value));
  label.append(select);
  const output = element("div");
  const status = element("p");
  status.setAttribute("role", "status");
  const generate = button("Generate concept", "button primary", async () => {
    generate.disabled = select.disabled = true;
    status.textContent = "Reviewing the captured page…";
    output.replaceChildren();
    try {
      const concept = await request("/api/audits/" + id + "/design?direction=" + select.value, designConcept, { method: "POST" });
      const preview = element("div", "concept-preview " + select.value);
      preview.style.backgroundColor = concept.paper;
      // Use the more legible of black and white on the model’s validated background color.
      const channels = [1, 3, 5].map(i => parseInt(concept.paper.slice(i, i + 2), 16) / 255)
        .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      preview.style.color = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] > .179 ? "#000" : "#fff";
      preview.style.borderColor = concept.accent;
      preview.append(element("h3", "", concept.headline), element("p", "", concept.purpose));
      output.append(preview);
      for (const change of concept.changes) output.append(element("strong", "", change.observation), element("p", "", change.proposal));
      output.append(element("strong", "", "Typography"), element("p", "", concept.typography), element("strong", "", "Mobile layout"), element("p", "", concept.mobile));
      status.textContent = "Suggested design direction";
    } catch (error) { status.textContent = errorMessage(error); }
    finally { generate.disabled = select.disabled = false; }
  });
  select.addEventListener("change", () => { output.replaceChildren(); status.textContent = ""; });
  tools.append(label, generate);
  panel.append(tools, status, output);
  return panel;
}
