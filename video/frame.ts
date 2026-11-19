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
export const motionRate = 12;
const motionFrames = 23;

const layout = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<style>
  html { color-scheme: dark; background: #22332d; }
  body { background: #22332d; color: #f6f8ef; font: 20px "Segoe UI", sans-serif; }
  article { display: grid; grid-template-rows: 32px auto minmax(0, 1fr) 26px; gap: 15px; width: 1280px; height: 720px; padding: 34px 56px 28px; --line: #52675a; --muted: #cbdacd; --night: #2c4037; }
  header, footer { display: flex; align-items: center; justify-content: space-between; gap: 24px; color: #cbdacd; font: 500 15px Consolas, monospace; }
  header strong { border-left: 3px solid #acccb2; padding-left: 10px; color: #ecf4e8; }
  header span, footer span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  footer { border-top: 1px solid #52675a; padding-top: 10px; }
  h1 { margin: 0; font-size: 43px; line-height: 1.14; letter-spacing: -.035em; overflow-wrap: anywhere; font-weight: 650; }
  main { display: grid; place-items: center; overflow: hidden; min-width: 0; }
  article .motion-frame { width: min(100%, 900px); max-height: var(--shot-height); }
  article .motion-frame.mobile { max-width: 360px; }
  article .motion-highlight { border-color: #ffe0a3; background: #dfb56d33; box-shadow: 0 0 0 2px #604e2e; }
  article .code-block, article .patch { font-size: 21px; max-height: var(--shot-height); white-space: pre-wrap; overflow-wrap: anywhere; }
  article .scene-comparison .code-block { font-size: 17px; }
  .scene-comparison .code-frame { margin: 0; padding: 13px 16px; }
  article .code-line { width: 100%; }
  article .code-line code { min-width: 0; }
  article .evidence-label { font-size: 17px; }
  main:empty::before { content: attr(data-target); font-size: 68px; letter-spacing: -.045em; font-weight: 650; max-width: 100%; overflow-wrap: anywhere; }
  [lang=hi] h1, [lang=hi] figcaption, [lang=te] h1, [lang=te] figcaption { font-family: "Nirmala UI", "Noto Sans Telugu", "Noto Sans Devanagari", sans-serif; }
</style>
<article>
  <header><strong>DeSpecto</strong><span id="position"></span></header>
  <h1></h1>
  <main></main>
  <footer><span id="target"></span><span id="source"></span></footer>
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
    document.querySelector("#position")!.textContent = String(position).padStart(2, "0") + " / " + String(total).padStart(2, "0");
    document.querySelector("h1")!.textContent = scene.title;
    document.querySelector("#target")!.textContent = label;
    const evidence = scene.evidence;
    document.querySelector("#source")!.textContent = evidence && "file" in evidence ? evidence.file : "";
    const main = document.querySelector("main")!;
    main.dataset.target = label;
    main.replaceChildren();
    main.style.setProperty("--shot-height", `${Math.max(90, main.clientHeight - 32)}px`);
    window.seekEvidence = window.DespectoEvidence.showSceneEvidence(main, scene);
    await Promise.all([document.fonts.ready, ...[...main.querySelectorAll("img")].map((image) => image.decode())]);
  }, input);

  const animated = scene.comparison || (!scene.comparison && scene.evidence && ("file" in scene.evidence || scene.evidence.box));
  const count = animated ? motionFrames : 1;
  for (let index = 0; index < count; index += 1) {
    await page.evaluate((time) => window.seekEvidence(time), animated ? index / (count - 1) : 1);
    await save(index, await page.screenshot({ timeout: 8000 }));
  }
}
