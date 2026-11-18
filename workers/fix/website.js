import { InputError } from "../../shared/target.js";
import { capturePage, withBrowser, withPage } from "../site-audit/browser.js";
import { inspectPage } from "../site-audit/inspect.js";

export function previewWebsiteFix(target, item, recipe, context) {
  const { view, rule, selector } = recipe;
  return withBrowser(target, (browser) => withPage(browser, target.url, view, async (page) => {
    const scan = await inspectPage(page, view, { rule, selector });
    const original = scan.issues[0];
    if (!original) {
      throw new InputError("The page changed and this issue could not be reproduced.");
    }
    const before = await capturePage(page, scan);
    await applyPageFix(page, recipe);
    const recheck = await inspectPage(page, view, {
      rule,
      targetSelector: selector,
      ...(["field-label", "image-crop", "text-contrast"].includes(rule) && { selector }),
    });
    const after = await capturePage(page, recheck);
    const verified = recheck.issues.length === 0 && (!selector || Boolean(recheck.targetBox));
    return {
      kind: "screenshots", verified,
      before: context.asset(`${item.id}-before.jpg`, before),
      after: context.asset(`${item.id}-after.jpg`, after),
      beforeSize: { width: scan.width, height: scan.height },
      afterSize: { width: recheck.width, height: recheck.height },
      beforeBox: original.box,
      afterBox: recheck.targetBox,
      summary: verified ? "The original check passed after applying the preview." : "The issue still appears in the preview.",
    };
  }));
}

export async function applyPageFix(page, { property, selector, value }) {
  const applied = await page.evaluate(({ property, selector, value }) => {
    if (property === "title") {
      document.title = value;
      return true;
    }
    if (property === "viewport") {
      const meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1";
      document.head.append(meta);
      return true;
    }
    const element = document.querySelector(selector);
    if (!element) return false;
    if (property === "aria-label") {
      element.setAttribute("aria-label", value);
    } else if (property === "image-fit") {
      element.style.setProperty("object-fit", "contain", "important");
    } else if (property === "contrast") {
      element.style.setProperty("color", value, "important");
    } else if (property === "width") {
      const room = document.documentElement.clientWidth - Math.max(0, element.getBoundingClientRect().left);
      element.style.setProperty("max-inline-size", `min(100%, ${Math.floor(room)}px)`, "important");
      element.style.setProperty("min-inline-size", "0", "important");
      element.style.setProperty("overflow-wrap", "anywhere", "important");
      element.style.setProperty("box-sizing", "border-box", "important");
    } else {
      return false;
    }
    return true;
  }, { property, selector, value });
  if (!applied) throw new InputError("The element changed before the preview could be applied.");
}
