import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { InputError } from "../shared/target.js";
import { frameSize, prepareFrame, renderFrame } from "./frame.js";
import { narrationFor } from "./speech.js";
import { walkthroughFor } from "./walkthrough.js";

const exec = promisify(execFile);
const maxBytes = 48 * 1024 * 1024;
let ffmpegProbe;

export function exportAvailable() {
  ffmpegProbe ??= ffmpeg(["-version"]).then(() => true, () => false);
  return ffmpegProbe;
}

export function createExports() {
  let current;

  function get(job, language) {
    return current?.job === job && current.language === language ? current : null;
  }

  async function start(job, language, asset) {
    if (!await exportAvailable()) throw new InputError("Install FFmpeg and restart DeSpecto to export video.");
    const existing = get(job, language);
    if (existing && existing.state.status !== "failed") return existing.state;
    if (current?.state.status === "rendering") throw new InputError("Another export is running. Try again shortly.");

    const entry = { job, language, state: { status: "rendering", completed: 0, total: 0 } };
    const images = new Map((job.result.screenshots ?? []).map(({ url }) => [url, asset(url)]));
    current = entry;
    void render(job, language, images, entry.state).then(({ bytes, narrated }) => {
      entry.bytes = bytes;
      Object.assign(entry.state, { status: "complete", narrated });
    }).catch((error) => {
      if (!(error instanceof InputError)) console.error(error.message);
      Object.assign(entry.state, {
        status: "failed", error: error instanceof InputError ? error.message : "The video could not be rendered. Try exporting again.",
      });
    });
    return entry.state;
  }

  return { get, start };
}

async function render(job, language, images, state) {
  const directory = await mkdtemp(join(tmpdir(), "despecto-video-"));
  const deadline = Date.now() + 240000;
  let browser;
  try {
    const { scenes } = await walkthroughFor(job, language);
    state.total = scenes.length;
    browser = await chromium.launch({ chromiumSandbox: true, timeout: 12000 });
    const page = await browser.newPage({ viewport: frameSize, deviceScaleFactor: 1 });
    await page.route(/^https?:\/\//, (route) => route.abort());
    await prepareFrame(page);
    const clips = [];
    let narrated = 0;
    for (const [index, scene] of scenes.entries()) {
      if (Date.now() + 1000 >= deadline) throw new InputError("The export reached its four-minute time limit.");
      const png = images.get(scene.evidence?.screenshot);
      const screenshot = png && `data:image/png;base64,${png.toString("base64")}`;
      const frame = await renderFrame(page, {
        scene, label: job.target.label, position: index + 1, total: scenes.length, screenshot,
      });
      const image = `frame-${index}.png`;
      const speech = `voice-${index}.mp3`;
      const clip = `scene-${index}.mp4`;
      await writeFile(join(directory, image), frame);
      const audio = await narrationFor(scene).catch(() => null);
      if (audio) {
        await writeFile(join(directory, speech), audio);
        narrated += 1;
      }
      await ffmpeg([
        "-loop", "1", "-framerate", "24", "-i", image,
        ...(audio ? ["-i", speech] : ["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(scene.duration)]),
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", "24000", "-ac", "1", "-b:a", "64k", "-shortest", clip,
      ], directory, deadline);
      clips.push(clip);
      state.completed = clips.length;
    }

    await writeFile(join(directory, "scenes.ffconcat"), `ffconcat version 1.0\n${clips.map((clip) => `file '${clip}'`).join("\n")}\n`);
    await ffmpeg(["-f", "concat", "-safe", "1", "-i", "scenes.ffconcat", "-c", "copy", "-movflags", "+faststart", "walkthrough.mp4"], directory, deadline);
    const path = join(directory, "walkthrough.mp4");
    if ((await stat(path)).size > maxBytes) throw new InputError("The video exceeded the 48 MiB export limit.");
    return { bytes: await readFile(path), narrated };
  } finally {
    try {
      await browser?.close();
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

function ffmpeg(args, cwd, deadline = Date.now() + 5000) {
  const time = deadline - Date.now();
  if (time < 1) throw new InputError("The export reached its four-minute time limit.");
  return exec(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    cwd, timeout: Math.min(time, 25000), maxBuffer: 128 * 1024, windowsHide: true,
  });
}
