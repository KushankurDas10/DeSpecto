import { reviewImage } from "./visual-review.ts";
import type { AuditContext, AuditResult, Progress, WebsiteFixRecipe } from "../../shared/audit.ts";
import type { Finding, Report, Target } from "../../shared/contracts.ts";
import { modelConfigured } from "../../models/llm.ts";
import { finding } from "../../shared/finding.ts";
import { capturePage, withBrowser, withPage } from "./browser.ts";
import { captureDesignSource } from "./design-source.ts";
import { inspectPage } from "./inspect.ts";

export async function auditWebsite(target: Target, progress: Progress, context: AuditContext): Promise<AuditResult> {
  const captures = await withBrowser(target, async (browser) => {
    const images = [];
    for (const [view, percent] of [["desktop", 21], ["mobile", 56]] as const) {
      progress(percent, `Inspecting the ${view} layout`);
      const image = await withPage(browser, target.url, view, async (page) => {
        const scan = await inspectPage(page, view);
        const bytes = await capturePage(page, scan);
        const screenshot = context.asset(`${view}.jpg`, bytes);
        const vision = modelConfigured(true)
          ? await capturePage(page, { width: scan.width, height: Math.min(scan.height, scan.viewportHeight) })
          : null;
        const designSource = view === "desktop" ? await captureDesignSource(page, { width: scan.width, height: scan.height }, screenshot) : undefined;
        return { view, scan, vision, screenshot, designSource };
      });
      images.push(image);
    }
    return images;
  });

  const screenshots: NonNullable<Report["screenshots"]> = [];
  const findings: Finding[] = [];
  const fixes = new Map<string, WebsiteFixRecipe>();
  const notes = [captures.some(({ scan }) => scan.truncated)
    ? "Captured up to 12,000 pixels of page height on desktop and mobile."
    : "Captured the full page on desktop and mobile."];
  const seen = new Set();
  for (const { view, scan, screenshot } of captures) {
    screenshots.push({ view, url: screenshot, width: scan.width, height: scan.height });
    for (const item of scan.issues) {
      const key = `${item.rule === "overflow" ? view : ""}:${item.rule}:${item.selector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const value = finding({
        source: "website", type: item.type, severity: item.severity, title: item.title,
        explanation: item.explanation, evidence: {
          screenshot, view, width: scan.width, height: scan.height, box: item.box, selector: item.selector,
        },
      });
      findings.push(value);
      if (item.repair) fixes.set(value.id, { ...item.repair, view, rule: item.rule, selector: item.selector });
    }
  }

  if (modelConfigured(true)) {
    progress(82, "Reviewing screenshots with AI");
    const reviews = await Promise.allSettled(captures.map(({ vision, scan, screenshot, view }) =>
      reviewImage(vision, scan, screenshot, view)));
    let reviewed = 0;
    for (const result of reviews) {
      if (result.status === "fulfilled" && result.value) {
        reviewed += 1;
        for (const { item, recipe } of result.value) {
          findings.push(item);
          if (recipe) fixes.set(item.id, recipe);
        }
      }
    }
    notes.push(`AI reviewed the top of the page on ${reviewed} of ${captures.length} screen sizes.`);
  }
  progress(93, "Preparing screenshot evidence");
  return { findings, fixes, screenshots, notes, designSource: captures[0]?.designSource };
}
