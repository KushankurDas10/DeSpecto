export const frameSize = { width: 1280, height: 720 };

const layout = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; color: #f1f8ee; background: #111c17; font: 20px Arial, sans-serif; }
  article { display: grid; grid-template-rows: 28px auto minmax(0, 1fr) auto; gap: 14px; width: 1280px; height: 720px; padding: 32px 48px; background: radial-gradient(ellipse at 80% 65%, #294231, transparent 70%); }
  header { display: flex; justify-content: space-between; gap: 24px; color: #d2f78c; font: 600 16px Consolas, monospace; align-items: center; }
  header span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  h1 { margin: 0; font-size: 43px; line-height: 1.12; letter-spacing: -.025em; overflow-wrap: anywhere; }
  main { display: grid; place-content: center; overflow: hidden; min-width: 0; }
  #capture { position: relative; display: block; box-shadow: 0 0 0 1px #87ae84; border-radius: 6px; overflow: hidden; }
  #capture img { width: 100%; height: 100%; display: block; }
  #capture span { position: absolute; box-shadow: 0 0 0 1px #142e10; border: 3px solid #63d238; background: #aff95d2a; }
  #code { width: 1100px; background: #15241a; border: 1px solid #497051; border-radius: 8px; overflow: hidden; }
  #location { padding: 11px 16px; color: #b7cdb9; border-bottom: 1px solid #497051; font: 500 17px Consolas, monospace; overflow-wrap: anywhere; }
  #code pre { margin: 0; padding: 12px 16px; font: 18px/1.4 Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  footer { background: #203327; border-left: 4px solid #d2f78c; padding: 14px 20px; color: #e1eddd; line-height: 1.45; overflow-wrap: anywhere; }
  [lang=hi] h1, [lang=hi] footer, [lang=te] h1, [lang=te] footer { font-family: "Nirmala UI", "Noto Sans Telugu", "Noto Sans Devanagari", sans-serif; }
</style>
<article>
  <header><span>DESPECTO / AUDIT WALKTHROUGH</span><span id="position"></span></header>
  <h1></h1>
  <main></main>
  <footer></footer>
</article>
</html>`;

export async function prepareFrame(page) {
  await page.setContent(layout, { waitUntil: "domcontentloaded" });
}

export async function renderFrame(page, input) {
  await page.evaluate(async ({ scene, label, position, total, screenshot }) => {
    document.documentElement.lang = scene.language;
    document.querySelector("#position").textContent = `${label} · ${position} / ${total}`;
    document.querySelector("h1").textContent = scene.title;
    document.querySelector("footer").textContent = scene.caption;
    const main = document.querySelector("main");
    main.replaceChildren();
    if (screenshot) {
      const { width, height, box } = scene.evidence;
      const scale = Math.min(main.clientWidth / width, main.clientHeight / height, 1);
      const frame = document.createElement("figure");
      frame.id = "capture";
      frame.style.margin = "0";
      frame.style.width = `${width * scale}px`;
      frame.style.height = `${height * scale}px`;
      const image = document.createElement("img");
      image.src = screenshot;
      frame.append(image);
      if (box) {
        const annotation = document.createElement("span");
        Object.assign(annotation.style, {
          left: `${100 * box.x / width}%`, top: `${100 * box.y / height}%`,
          width: `${100 * box.w / width}%`, height: `${100 * box.h / height}%`,
        });
        frame.append(annotation);
      }
      main.append(frame);
      await image.decode();
    } else if (scene.evidence?.file) {
      const { file, lines: [start, end], excerpt } = scene.evidence;
      const code = document.createElement("section");
      code.id = "code";
      const location = document.createElement("div");
      location.id = "location";
      location.textContent = `${file} · ${start === end ? start : `${start}–${end}`}`;
      const body = document.createElement("pre");
      body.textContent = excerpt.split("\n").map((line, index) => {
        const text = line.length > 160 ? `${line.slice(0, 157)}…` : line;
        return `${String(start + index).padStart(4)}  ${text}`;
      }).join("\n");
      code.append(location, body);
      main.append(code);
    }
    await document.fonts.ready;
  }, input);
  return page.screenshot({ timeout: 8000 });
}
