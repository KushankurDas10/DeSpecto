import type { CompletedJob, ExportState, Language, Scene, Walkthrough } from "../shared/contracts.ts";

interface ExportEntry {
  job: CompletedJob;
  language: Language;
  revision: string;
  state: Exclude<ExportState, { status: "idle" }>;
  bytes?: Buffer;
}
type ExportProgress = Pick<Extract<ExportState, { status: "rendering" }>, "completed" | "total">;
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { InputError } from "../shared/target.ts";
import { frameSize, motionRate, prepareFrame, renderFrames } from "./frame.ts";
import { narrationFor } from "./speech.ts";
import { walkthroughFor, walkthroughRevision } from "./walkthrough.ts";

const exec = promisify(execFile);
const maxBytes = 48 * 1024 * 1024;
let ffmpegProbe: Promise<boolean> | undefined;

export function exportAvailable() {
  ffmpegProbe ??= ffmpeg(["-version"]).then(() => true, () => false);
  return ffmpegProbe;
}

export function createExports() {
  let current: ExportEntry | undefined;

  function get(job: CompletedJob, language: Language) {
    return current?.job === job && current.language === language && current.revision === walkthroughRevision(job)
      ? current : null;
  }

  async function start(job: CompletedJob, language: Language, asset: (path: string) => Buffer | undefined) {
    if (!await exportAvailable()) throw new InputError("Install FFmpeg and restart DeSpecto to export video.");
    const existing = get(job, language);
    if (existing && existing.state.status !== "failed") return existing.state;
    if (current?.state.status === "rendering") throw new InputError("Another export is running. Try again shortly.");

    const entry: ExportEntry = { job, language, revision: walkthroughRevision(job), state: { status: "rendering", completed: 0, total: 0 } };
    const script = walkthroughFor(job, language);
    const paths = new Set((job.result.screenshots ?? []).map(({ url }) => url));
    for (const item of job.result.findings) {
      if (item.source === "website") paths.add(item.evidence.screenshot);
      if (item.fix?.kind === "screenshots") {
        paths.add(item.fix.before);
        paths.add(item.fix.after);
      }
    }
    const images = new Map([...paths].map((url) => [url, asset(url)]));
    current = entry;
    const progress = entry.state;
    void render(job, script, images, progress).then(({ bytes, narrated }) => {
      entry.bytes = bytes;
      entry.state = { ...progress, status: "complete", narrated };
    }).catch((error) => {
      if (!(error instanceof InputError)) console.error(error);
      entry.state = { ...progress,
        status: "failed", error: error instanceof InputError ? error.message : "The video could not be rendered. Try exporting again.",
      };
    });
    return entry.state;
  }

  return { get, start };
}

async function render(job: CompletedJob, script: Promise<Walkthrough>, images: Map<string, Buffer | undefined>, state: ExportProgress) {
  const directory = await mkdtemp(join(tmpdir(), "despecto-video-"));
  const deadline = Date.now() + 240000;
  let browser: import("playwright").Browser | undefined;
  try {
    const { scenes } = await script;
    state.total = scenes.length;
    browser = await chromium.launch({ chromiumSandbox: true, timeout: 12000 });
    const page = await browser.newPage({ viewport: frameSize, deviceScaleFactor: 1 });
    await page.route(/^https?:\/\//, (route) => route.abort());
    await prepareFrame(page);
    const clips = [];
    let narrated = 0;
    for (const [index, scene] of scenes.entries()) {
      if (Date.now() + 1000 >= deadline) throw new InputError("The export reached its four-minute time limit.");
      const frame = embedImages(scene, images);
      const framePrefix = `frame-${index}-`;
      await renderFrames(page, {
        scene: frame, label: job.target.label, position: index + 1, total: scenes.length,
      }, (position, bytes) => writeFile(join(directory, `${framePrefix}${String(position).padStart(2, "0")}.png`), bytes));
      const clip = `scene-${index}.mp4`;
      const audio = await narrationFor(scene).catch(() => null);
      const speech = `voice-${index}.${audio?.contentType === "audio/wav" ? "wav" : "mp3"}`;
      if (audio) {
        await writeFile(join(directory, speech), audio.bytes);
        narrated += 1;
      }
      await ffmpeg([
        "-framerate", String(motionRate), "-i", `${framePrefix}%02d.png`,
        ...(audio ? ["-i", speech] : ["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(scene.duration)]),
        "-vf", "fps=24,tpad=stop_mode=clone:stop_duration=120",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
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

function embedImages(scene: Scene, images: Map<string, Buffer | undefined>): Scene {
  const embedded = { ...scene };
  if (scene.evidence && "screenshot" in scene.evidence) embedded.evidence = {
    ...scene.evidence, screenshot: dataUrl(scene.evidence.screenshot),
  };
  if (scene.comparison?.kind === "screenshots") embedded.comparison = {
    ...scene.comparison, before: dataUrl(scene.comparison.before), after: dataUrl(scene.comparison.after),
  };
  return embedded;

  function dataUrl(path: string) {
    const bytes = images.get(path);
    if (!bytes) throw new InputError("A screenshot could not be found. Run a new audit to export it.");
    const type = path.endsWith(".jpg") ? "image/jpeg" : "image/png";
    return `data:${type};base64,${bytes.toString("base64")}`;
  }
}

async function ffmpeg(args: string[], cwd?: string, deadline = Date.now() + 5000) {
  const time = deadline - Date.now();
  if (time < 1) throw new InputError("The export reached its four-minute time limit.");
  return exec(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    cwd, timeout: Math.min(time, 25000), maxBuffer: 128 * 1024, windowsHide: true,
  });
}
