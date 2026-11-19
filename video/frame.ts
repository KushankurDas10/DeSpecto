import type { Page } from "playwright";
import type { Scene } from "../shared/contracts.ts";
import { webAsset } from "../apps/api/web-assets.ts";

interface FrameInput { scene: Scene; label: string; position: number; total: number }
declare global {
  interface Window {
    DespectoEvidence: Pick<typeof import("../apps/web/dom.ts"), "showSceneEvidence">;
    seekEvidence: (time: number) => void;
  }
}

export const frameSize = { width: 1280, height: 720 };
export const motionRate = 10;
const motionFrames = 15;

const layout = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<style>
  body { background: #0e1320; color: #f3f5fd; font: 20px Arial, sans-serif; }
  article { display: grid; grid-template-rows: 24px auto minmax(0, 1fr) auto; gap: 12px; width: 1280px; height: 720px; padding: 30px 48px; }
  header { display: flex; justify-content: space-between; gap: 24px; color: #dcfa75; font: 600 16px Consolas, monospace; }
  header span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  h1 { margin: 0; font-size: 38px; line-height: 1.12; letter-spacing: -.025em; overflow-wrap: anywhere; }
  main { display: grid; place-items: center; overflow: hidden; min-width: 0; }
  article .motion-frame { width: min(100%, 820px); max-height: var(--shot-height); }
  article .motion-frame.mobile { max-width: 280px; }
  article .code-block, article .patch { font-size: 17px; max-height: var(--shot-height); }
  footer { background: #222b41; border-left: 4px solid #dcfa75; padding: 13px 18px; color: #f3f5fd; line-height: 1.35; overflow-wrap: anywhere; }
  [lang=hi] h1, [lang=hi] footer, [lang=te] h1, [lang=te] footer { font-family: "Nirmala UI", "Noto Sans Telugu", "Noto Sans Devanagari", sans-serif; }
</style>
<article>
  <header><span>DESPECTO / AUDIT WALKTHROUGH</span><span id="position"></span></header>
  <h1></h1>
  <main></main>
  <footer></footer>
</article>
</html>`;

export async function prepareFrame(page: Page) {
  const [module, styles] = await Promise.all([webAsset("dom.js", "iife"), webAsset("style.css")]);
  if (!module || !styles) throw new Error("The walkthrough browser assets are unavailable.");
  await page.setContent(layout, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: styles.text.replace(/^@import[^\n]*\n/, "") });
  // Load the renderer as a browser script so server bundlers do not rewrite an import from Playwright's page context.
  await page.addScriptTag({ content: module.text });
}

export async function renderFrames(page: Page, input: FrameInput, save: (index: number, bytes: Buffer) => Promise<void>) {
  const { scene } = input;
  await page.evaluate(async ({ scene, label, position, total }) => {
    document.documentElement.lang = scene.language;
    document.querySelector("#position")!.textContent = `${label} · ${position} / ${total}`;
    document.querySelector("h1")!.textContent = scene.title;
    document.querySelector("footer")!.textContent = scene.caption;
    const main = document.querySelector("main")!;
    main.replaceChildren();
    main.style.setProperty("--shot-height", `${Math.max(90, main.clientHeight - 32)}px`);
    window.seekEvidence = window.DespectoEvidence.showSceneEvidence(main, scene);
    await Promise.all([document.fonts.ready, ...[...main.querySelectorAll("img")].map((image) => image.decode())]);
  }, input);

  const animated = scene.comparison?.kind === "screenshots" || (!scene.comparison && scene.evidence && ("file" in scene.evidence || scene.evidence.box));
  const count = animated ? motionFrames : 1;
  for (let index = 0; index < count; index += 1) {
    await page.evaluate((time) => window.seekEvidence(time), animated ? index / (count - 1) : 1);
    await save(index, await page.screenshot({ timeout: 8000 }));
  }
}
