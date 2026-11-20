import type { Page } from "playwright";
import type { Box, Finding, View } from "../../shared/contracts.ts";
import type { SiteRule, WebsiteChange } from "../../shared/audit.ts";

type IssueDetails = Pick<Finding, "type" | "severity" | "title" | "explanation">;
type Filter = { rule: SiteRule; selector?: string | null; targetSelector?: string | null };
type Issue = IssueDetails & { rule: SiteRule; selector: string | null; box: Box | null; repair?: WebsiteChange };
import { maxCaptureHeight } from "./browser.ts";

export function inspectPage(page: Page, view: View, filter?: Filter) {
  return page.evaluate(({ limit, maxHeight, view, filter }) => {
    const root = document.documentElement;
    const width = root.clientWidth;
    const fullHeight = Math.max(root.clientHeight, root.scrollHeight, document.body?.scrollHeight ?? 0);
    const height = Math.min(fullHeight, maxHeight);
    const viewportHeight = window.innerHeight;

    function box(element: Element): Box | null {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.visibility !== "visible" || Number(style.opacity) === 0) return null;
      const x = Math.max(0, Math.floor(rect.left + scrollX));
      const y = Math.max(0, Math.floor(rect.top + scrollY));
      const w = Math.min(width, Math.ceil(rect.right + scrollX)) - x;
      const h = Math.min(height, Math.ceil(rect.bottom + scrollY)) - y;
      return w > 0 && h > 0 ? { x, y, w, h } : null;
    }

    function selector(element: Element) {
      const parts: string[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
          parts.unshift(`#${CSS.escape(node.id)}`);
          break;
        }
        let index = 1;
        for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
          if (sibling.localName === node.localName) index += 1;
        }
        parts.unshift(`${CSS.escape(node.localName)}:nth-of-type(${index})`);
      }
      return parts.join(" > ");
    }

    function named(element: Element) {
      const references = element.getAttribute("aria-labelledby")?.trim().split(/\s+/) ?? [];
      return Boolean(element.getAttribute("aria-label")?.trim() || element.getAttribute("title")?.trim()
        || references.some((id) => document.getElementById(id)?.textContent?.trim())
        || ("labels" in element && Array.from((element as HTMLInputElement).labels ?? []).some((label) => label.textContent?.trim())));
    }

    function cropped(image: Element | null) {
      if (!(image instanceof HTMLImageElement) || !image.naturalWidth || !image.clientHeight
        || getComputedStyle(image).objectFit !== "cover") return false;
      const ratio = image.naturalWidth * image.clientHeight / (image.naturalHeight * image.clientWidth);
      return Number.isFinite(ratio) && Math.abs(Math.log(ratio)) > .12;
    }

    function imageContext(element: Element) {
      if (!(element instanceof HTMLImageElement)) return null;
      const alt = element.alt.slice(0, 120);
      const hints = [alt, element.id, element.className, element.parentElement?.className,
        element.getAttribute("src")?.split("?")[0].split("/").pop()].join(" ");
      const style = getComputedStyle(element);
      const radius = style.borderTopLeftRadius;
      const size = Math.min(element.clientWidth, element.clientHeight);
      const round = radius.endsWith("%") ? parseFloat(radius) >= 45 : parseFloat(radius) >= size * .45;
      const portrait = /avatar|profile|headshot|portrait|author.photo/i.test(hints)
        || (round && size > 0 && size <= 256 && Math.abs(element.clientWidth - element.clientHeight) < size * .12);
      return { alt, portrait, fit: style.objectFit, naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight };
    }

    const issues: Issue[] = [];
    function add(element: Element | null | undefined, rule: SiteRule, details: IssueDetails, repair?: WebsiteChange | false | "") {
      if (issues.length >= limit || (filter && rule !== filter.rule)) return;
      const bounds = element && box(element);
      if (element && !bounds) return;
      const location = element && selector(element);
      if (filter?.selector !== undefined && filter.selector !== location) return;
      issues.push({ rule, ...details, selector: location ?? null, box: bounds ?? null, repair: repair || undefined });
    }

    const heading = [...document.querySelectorAll("h1")].find((element) => box(element));
    if (!document.title.trim()) {
      const suggestion = heading?.textContent?.trim().replace(/\s+/g, " ").slice(0, 100);
      add(heading, "title", {
        type: "accessibility", severity: "medium", title: "Missing page title",
        explanation: "The document has no title for browser tabs, bookmarks, or assistive technology.",
      }, suggestion && { property: "title", value: suggestion });
    }

    if (view === "mobile" && !document.querySelector('meta[name="viewport" i]')) {
      add(heading, "mobile-viewport", {
        type: "visual_issue", severity: "medium", title: "Missing mobile viewport setting",
        explanation: "Mobile browsers can scale down the desktop layout, making text and controls harder to use.",
      }, { property: "viewport" });
    }
    const overflow = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0) - root.clientWidth;
    if (overflow > 12 && !["hidden", "clip"].includes(getComputedStyle(document.scrollingElement ?? root).overflowX)
      && !["hidden", "clip"].includes(getComputedStyle(document.body).overflowX)) {
      const elements = Array.from(document.querySelectorAll("body *")).slice(0, 3500);
      // Prefer the widest overflowing element so a patch addresses the layout rather than hiding the scroll.
      const offenders = elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        return box(element) && rect.right > width + 12 && getComputedStyle(element).position !== "fixed";
      });
      offenders.sort((left, right) => right.getBoundingClientRect().width - left.getBoundingClientRect().width);
      const offender = offenders[0];
      add(offender, "overflow", {
        type: "visual_issue", severity: "high", title: "Content extends beyond the viewport",
        explanation: `The page is ${overflow} pixels wider than the viewport and can scroll horizontally.`,
      }, offender && { property: "width" });
    }

    for (const image of document.images) {
      if (image.currentSrc && image.complete && !image.naturalWidth && image.alt.trim() && box(image)
        && image.checkVisibility({ visibilityProperty: true, opacityProperty: true })) {
        add(image, "broken-image", { type: "bug", severity: "medium", title: "Image failed to load",
          explanation: "The browser finished requesting this image but could not decode it. Its alternative text is “" + image.alt.slice(0, 100) + "”." });
      }
    }
    for (const label of document.querySelectorAll<HTMLLabelElement>("label[for]")) {
      if (label.htmlFor && !document.getElementById(label.htmlFor) && label.innerText.trim() && box(label)) {
        add(label, "orphan-label", { type: "accessibility", severity: "medium", title: "Label points to a missing field",
          explanation: "This label references the ID “" + label.htmlFor.slice(0, 100) + "”, which is absent from the loaded page." });
      }
    }

    for (const image of document.querySelectorAll("img:not([alt])")) {
      if (image.getAttribute("role") === "presentation" || image.getAttribute("aria-hidden") === "true" || named(image)) continue;
      add(image, "image-alt", {
        type: "accessibility", severity: "medium", title: "Image missing alternative text",
        explanation: "This visible image has no alt attribute or accessible name.",
      });
    }

    for (const field of document.querySelectorAll("input:not([type=hidden],[type=submit],[type=reset],[type=button],[type=image]), select, textarea")) {
      if (named(field) || field.getAttribute("aria-hidden") === "true") continue;
      const placeholder = field.getAttribute("placeholder")?.trim();
      add(field, "field-label", {
        type: "accessibility", severity: "medium", title: "Form field missing a label",
        explanation: "This visible form field has no associated label or explicit accessible name.",
      }, placeholder && { property: "aria-label", value: placeholder.slice(0, 100) });
    }

    if (!filter || filter.rule === "text-contrast") {
      const sample = document.createElement("canvas");
      sample.width = sample.height = 1;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Could not initialize the color sampler.");
      const colors = new Map<string, Uint8ClampedArray>();
      const color = (value: string): Uint8ClampedArray => {
        if (!colors.has(value)) {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = value;
          context.fillRect(0, 0, 1, 1);
          colors.set(value, context.getImageData(0, 0, 1, 1).data);
        }
        return colors.get(value)!;
      };
      const luminance = (rgb: Uint8ClampedArray) => [.2126, .7152, .0722].reduce((sum, weight, index) => {
        const level = rgb[index] / 255;
        return sum + weight * (level <= .04045 ? level / 12.92 : ((level + .055) / 1.055) ** 2.4);
      }, 0);
      const candidates = filter?.selector ? [document.querySelector(filter.selector)]
        : [...document.querySelectorAll("p, li, a, button, h1, h2, h3, h4, label, span")].slice(0, 1000);
      let found = 0;
      for (const element of candidates) {
        if (!element || !box(element) || element.closest('[disabled], [aria-hidden="true"]')
          || ![...element.childNodes].some((node) => node.nodeType === 3 && (node.textContent?.trim().length ?? 0) > 2)) continue;
        let background: Uint8ClampedArray | undefined;
        for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (style.backgroundImage !== "none" || style.mixBlendMode !== "normal" || Number(style.opacity) < 1) break;
          const rgb = color(style.backgroundColor);
          if (!rgb[3]) continue;
          if (rgb[3] === 255) background = rgb;
          break;
        }
        if (!background) continue;
        const style = getComputedStyle(element);
        const foreground = color(style.color);
        if (foreground[3] !== 255) continue;
        const fg = luminance(foreground);
        const bg = luminance(background);
        const ratio = (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
        const size = parseFloat(style.fontSize);
        const minimum = size >= 24 || (size >= 18.67 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
        if (ratio >= minimum) continue;
        add(element, "text-contrast", {
          type: "accessibility", severity: "medium", title: "Low text contrast",
          explanation: `The computed text and background colors give a contrast ratio of ${ratio.toFixed(2)}:1. The minimum for text this size is ${minimum}:1.`,
        }, { property: "contrast", value: 1.05 / (bg + .05) > (bg + .05) / .05 ? "#fff" : "#000" });
        if (++found >= 2) break;
      }
    }

    if (filter?.rule === "image-crop") {
      const image = filter.selector ? document.querySelector(filter.selector) : null;
      if (cropped(image)) add(image, "image-crop", {
        type: "visual_issue", severity: "medium", title: "Cropped image", explanation: "The image is cropped to fit its frame.",
      }, { property: "image-fit" });
    }

    const regions = Array.from(document.querySelectorAll("main, header, nav, section, article, footer, h1, button, img"))
      .slice(0, 400).flatMap((element) => {
        const bounds = box(element);
        return bounds && bounds.w >= 30 && bounds.h >= 15
          ? [{ selector: selector(element), box: bounds, tag: element.localName, cropped: cropped(element), image: imageContext(element) }] : [];
      }).slice(0, 25);
    const target = filter?.targetSelector && document.querySelector(filter.targetSelector);
    return { issues, regions, width, height, viewportHeight, truncated: fullHeight > height,
      targetBox: target ? box(target) : null };
  }, { limit: 8, maxHeight: maxCaptureHeight, view, filter });
}
