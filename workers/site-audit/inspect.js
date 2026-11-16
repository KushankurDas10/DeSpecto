export function inspectPage(page, view) {
  return page.evaluate(({ limit, width, height, view }) => {
    const visual = window.visualViewport;
    const scale = visual ? width / visual.width : 1;

    function box(element) {
      const rect = element.getBoundingClientRect();
      const x = Math.max(0, Math.floor((rect.left - (visual?.offsetLeft ?? 0)) * scale));
      const y = Math.max(0, Math.floor((rect.top - (visual?.offsetTop ?? 0)) * scale));
      const w = Math.min(width, Math.ceil((rect.right - (visual?.offsetLeft ?? 0)) * scale)) - x;
      const h = Math.min(height, Math.ceil((rect.bottom - (visual?.offsetTop ?? 0)) * scale)) - y;
      return w > 0 && h > 0 && getComputedStyle(element).visibility === "visible" ? { x, y, w, h } : null;
    }

    function selector(element) {
      const parts = [];
      for (let node = element; node; node = node.parentElement) {
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

    function named(element) {
      const references = element.getAttribute("aria-labelledby")?.trim().split(/\s+/) ?? [];
      return Boolean(element.getAttribute("aria-label")?.trim() || element.title?.trim()
        || references.some((id) => document.getElementById(id)?.textContent.trim())
        || Array.from(element.labels ?? []).some((label) => label.textContent.trim()));
    }

    const issues = [];
    function add(element, rule, details, repair) {
      const bounds = element && box(element);
      if (issues.length >= limit || (element && !bounds)) return;
      issues.push({ rule, ...details, selector: element && selector(element), box: bounds, repair });
    }

    const heading = [...document.querySelectorAll("h1")].find((element) => box(element));
    if (!document.title.trim()) {
      const suggestion = heading?.textContent.trim().replace(/\s+/g, " ").slice(0, 100);
      add(heading, "title", {
        type: "accessibility", severity: "medium", title: "Missing page title",
        explanation: "The document has no title for browser tabs, bookmarks, or assistive technology.",
      }, suggestion && { property: "title", value: suggestion });
    }

    const root = document.documentElement;
    if (view === "mobile" && !document.querySelector('meta[name="viewport" i]')) {
      add(heading, "mobile-viewport", {
        type: "visual_issue", severity: "medium", title: "Missing mobile viewport setting",
        explanation: "Mobile browsers can scale down the desktop layout, making text and controls harder to use.",
      }, { property: "viewport" });
    }
    const overflow = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0) - root.clientWidth;
    if (overflow > 12) {
      const elements = Array.from(document.querySelectorAll("body *")).slice(0, 3500);
      // Prefer the widest overflowing element so a patch addresses the layout rather than hiding the scroll.
      const offenders = elements.filter((element) => box(element) && element.getBoundingClientRect().right > root.clientWidth + 12);
      offenders.sort((left, right) => right.getBoundingClientRect().width - left.getBoundingClientRect().width);
      const offender = offenders[0];
      add(offender, "overflow", {
        type: "visual_issue", severity: "high", title: "Content extends beyond the viewport",
        explanation: `The page is ${overflow} pixels wider than the viewport and can scroll horizontally.`,
      }, offender && { property: "width" });
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

    const regions = Array.from(document.querySelectorAll("main, header, nav, section, article, footer, h1, button, img"))
      .slice(0, 160).flatMap((element) => {
        const bounds = box(element);
        return bounds && bounds.w >= 30 && bounds.h >= 15
          ? [{ selector: selector(element), box: bounds, tag: element.localName }] : [];
      }).slice(0, 25);
    return { issues, regions, width, height };
  }, { limit: 8, view, ...page.viewportSize() });
}
