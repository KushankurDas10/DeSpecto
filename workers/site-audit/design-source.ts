import type { Page } from "playwright";
import type { DesignSource, Size } from "../../shared/contracts.ts";

export async function captureDesignSource(page: Page, size: Size, screenshot: string): Promise<DesignSource> {
  const content = await page.evaluate(({ width, height }) => {
    type Items = DesignSource["intro"];
    const intro: Items = [];
    const sections: DesignSource["sections"] = [];
    let items = intro;
    let title = "";
    let group: number | undefined;
    let groupCount = 0;
    let remaining = 360;
    const clean = (text: string) => text.replace(/\s+/g, " ").trim();
    function add(item: Items[number]) {
      if (remaining > 0) { items.push(group === undefined ? item : { ...item, group }); remaining--; }
    }
    function visit(el: Element) {
      if (!(el instanceof HTMLElement) || remaining <= 0 || el.matches("script,style,noscript,template,input,textarea,select,button,[hidden],[aria-hidden=true]")) return;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return;
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && rect.bottom + scrollY > 0 && rect.top + scrollY < height;
      if (el instanceof HTMLImageElement || (el.childElementCount === 0 && style.backgroundImage.includes("url("))) {
        if (!visible || rect.width < 45 || rect.height < 40) return;
        let { left, top, right, bottom } = rect;
        for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const clip = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
          if (/hidden|clip|scroll|auto/.test(clip.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
          if (/hidden|clip|scroll|auto/.test(clip.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
        }
        const x = Math.max(0, Math.round(left + scrollX)), y = Math.max(0, Math.round(top + scrollY));
        const w = Math.min(width, Math.round(right + scrollX)) - x, h = Math.min(height, Math.round(bottom + scrollY)) - y;
        if (w > 0 && h > 0) add({ kind: "image", text: el.getAttribute("alt") || "", box: { x, y, w, h } });
        return;
      }
      if (el instanceof HTMLAnchorElement && visible && /^(https?:|mailto:)$/.test(el.protocol)) {
        for (const image of el.querySelectorAll("img")) visit(image);
        const text = clean(el.innerText || el.getAttribute("aria-label") || el.title || el.querySelector("img")?.alt || "");
        if (text) add({ kind: "link", text: text.slice(0, 240), href: el.href });
        return;
      }
      const semantic = el.matches("h1,h2,h3,h4,h5,h6,[role=heading]");
      const phrase = semantic || el.matches("p,li") || (!el.childElementCount || [...el.children].every(c => c.matches("span,b,strong,i,em,br")));
      if (visible && phrase && !el.querySelector("a,img,button,ul,ol")) {
        const text = clean(el.textContent || "").slice(0, 1600);
        if (!text || /^[•·|]$/.test(text)) return;
        const font = parseFloat(style.fontSize);
        if ((semantic || font >= 24) && text.length < 160 && sections.length < 32 && group === undefined) {
          if (!title) title = text;
          else { items = []; sections.push({ heading: text, items }); }
        } else add({ kind: font >= 18 && text.length < 90 ? "subheading" : "text", text });
        return;
      }
      const cardGrid = group === undefined && style.display.includes("grid") && el.children.length > 1
        && [...el.children].slice(0, 2).every(child => child.querySelector("img") && child.textContent?.trim());
      for (const node of el.childNodes) {
        if (node instanceof Element) {
          if (cardGrid) group = groupCount++;
          visit(node);
          if (cardGrid) group = undefined;
        }
        else if (visible && node.nodeType === Node.TEXT_NODE && clean(node.textContent || "")) add({ kind: "text", text: clean(node.textContent || "").slice(0, 1600) });
      }
    }
    visit(document.body);
    return { title: title || document.title || location.hostname, intro, sections };
  }, size);
  return { ...size, screenshot, ...content };
}
