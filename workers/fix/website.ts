import type { Page } from "playwright";
import type { AuditContext, WebsiteFixRecipe } from "../../shared/audit.ts";
import type { Finding, ScreenshotFix, Target } from "../../shared/contracts.ts";
import { InputError } from "../../shared/target.ts";
import { capturePage, withBrowser, withPage } from "../site-audit/browser.ts";
import { inspectPage } from "../site-audit/inspect.ts";

export function previewWebsiteFix(target: Target, item: Finding, recipe: WebsiteFixRecipe, context: AuditContext): Promise<ScreenshotFix> {
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

export async function applyPageFix(page: Page, recipe: WebsiteFixRecipe) {
  const applied = await page.evaluate((recipe) => {
    const { property, selector } = recipe;
    if (property === "title") {
      document.title = "value" in recipe ? recipe.value : document.title;
      return true;
    }
    if (property === "viewport") {
      const meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1";
      document.head.append(meta);
      return true;
    }
    const element = selector ? document.querySelector<HTMLElement>(selector) : null;
    if (!element) return false;
    if (property === "aria-label") {
      if ("value" in recipe) element.setAttribute("aria-label", recipe.value);
    } else if (property === "image-fit") {
      element.style.setProperty("object-fit", "contain", "important");
    } else if (property === "contrast") {
      if ("value" in recipe) element.style.setProperty("color", recipe.value, "important");
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
  }, recipe);
  if (!applied) throw new InputError("The element changed before the preview could be applied.");
}
