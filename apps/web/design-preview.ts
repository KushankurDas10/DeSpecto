import type { DesignSource, DesignPlan } from "../../shared/contracts.ts";
import { element } from "./dom.ts";

export function renderSource(preview: HTMLElement, source: DesignSource, plan: DesignPlan) {
  type Item = DesignSource["intro"][number];
  function render(item: Item) {
    if (item.kind === "image") {
      const { x, y, w, h } = item.box;
      const image = element("div", "source-image");
      image.setAttribute("role", "img");
      image.setAttribute("aria-label", item.text || "Image from the audited page");
      image.style.aspectRatio = w + " / " + h;
      image.style.maxWidth = w + "px";
      image.style.backgroundImage = 'url("' + source.screenshot + '")';
      image.style.backgroundSize = (100 * source.width / w) + "% " + (100 * source.height / h) + "%";
      image.style.backgroundPosition = (100 * x / (source.width - w || 1)) + "% " + (100 * y / (source.height - h || 1)) + "%";
      return image;
    }
    if (item.kind === "link") {
      const link = element("a", "source-linkout", item.text);
      link.href = item.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      return link;
    }
    return element(item.kind === "subheading" ? "h5" : "p", "", item.text);
  }

  function appendItems(parent: HTMLElement, items: Item[]) {
    let grid: HTMLElement | undefined;
    let card: HTMLElement | undefined;
    let previous: number | undefined;
    for (const item of items) {
      if (item.group === undefined) {
        grid = card = undefined;
        parent.append(render(item));
      } else {
        if (!grid) { grid = element("div", "source-cards"); parent.append(grid); }
        if (!card || item.group !== previous) { card = element("article"); grid.append(card); }
        card.append(render(item));
      }
      previous = item.group;
    }
  }

  preview.style.setProperty("--concept-paper", plan.paper);
  preview.style.setProperty("--concept-accent", plan.accent);
  const mast = element("header", "prototype-hero");
  const lead = element("div", "source-lead");
  const banner = source.intro.find(item => item.kind === "image" && item.box.w >= 2 * item.box.h);
  const portrait = source.intro.find(item => item.kind === "image" && item !== banner && item.box.w <= 220 && Math.abs(item.box.w - item.box.h) < 24);
  const firstImage = source.intro.findIndex(item => item.kind === "image");
  const leadingLinks = firstImage > 0 ? source.intro.slice(0, firstImage).filter(item => item.kind === "link") : [];
  if (leadingLinks.length) {
    const navigation = element("nav", "source-navigation");
    navigation.setAttribute("aria-label", source.title + " links");
    for (const item of leadingLinks) navigation.append(render(item));
    mast.append(navigation);
  }
  if (banner) mast.append(render(banner));
  if (portrait) lead.append(render(portrait));
  lead.append(element("h3", "", source.title));
  mast.append(lead);
  appendItems(mast, source.intro.filter(item => item !== banner && item !== portrait && !leadingLinks.some(link => link === item)));
  const stories = element("div", "prototype-stories");
  for (const { index, layout } of plan.sections) {
    const section = source.sections[index];
    if (!section) continue;
    const block = layout === "directory" ? element("details") : element("section");
    block.dataset.layout = layout;
    if (block instanceof HTMLDetailsElement) block.open = !stories.children.length;
    block.append(element(layout === "directory" ? "summary" : "h4", "", section.heading));
    appendItems(block, section.items);
    stories.append(block);
  }
  preview.replaceChildren(mast, stories);
}
