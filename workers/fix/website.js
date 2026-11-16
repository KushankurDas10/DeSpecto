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
    const before = await capturePage(page);
    await applyPageFix(page, recipe);
    const after = await capturePage(page);
    const recheck = await inspectPage(page, view, {
      rule,
      ...(rule === "field-label" && { selector }),
    });
    const verified = recheck.issues.length === 0;
    return {
      kind: "screenshots", verified,
      before: context.asset(`${item.id}-before.png`, before),
      after: context.asset(`${item.id}-after.png`, after),
      beforeBox: original.box,
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
    } else if (property === "width") {
      element.style.setProperty("max-inline-size", "100%", "important");
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
