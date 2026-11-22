import { execFile } from "node:child_process";
import { mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import type { Chapter, CompletedJob, ExportState, Language, Scene, Walkthrough } from "../shared/contracts.ts";
import { InputError } from "../shared/target.ts";
import { frameSize, motionRate, prepareFrame, renderFrames } from "./frame.ts";
import { captionsFor, chapterMetadata } from "./timeline.ts";
import { narrationFor } from "./speech.ts";
import { walkthroughFor, walkthroughRevision } from "./walkthrough.ts";

interface ExportEntry {
  job: CompletedJob;
  language: Language;
  revision: string;
  state: Exclude<ExportState, { status: "idle" }>;
  media?: { bytes: Buffer; captions: string };
}
type Progress = Extract<ExportState, { status: "rendering" }>;
type Timeline = { chapter: Chapter; caption: string; speech: number }[];

const exec = promisify(execFile);
const maxBytes = 48 * 1024 * 1024;
const fps = 24;
const sampleRate = 48000;
const pcmBytesPerSecond = sampleRate * 2;
const lead = 0.35;
const tail = 0.55;
let ffmpegProbe: Promise<boolean> | undefined;

export function exportAvailable() {
  ffmpegProbe ??= ffmpeg(["-version"]).then(() => true, () => false);
  return ffmpegProbe;
}

export function createExports() {
  const entries: ExportEntry[] = [];

  function get(job: CompletedJob, language: Language) {
    return entries.find((entry) => entry.job === job && entry.language === language
      && entry.revision === walkthroughRevision(job));
  }

  async function start(job: CompletedJob, language: Language, asset: (path: string) => Buffer | undefined) {
    if (!await exportAvailable()) throw new InputError("Install FFmpeg and restart DeSpecto to make a walkthrough.");
    const existing = get(job, language);
    if (existing && existing.state.status !== "failed") return existing.state;
    if (entries.some(({ state }) => state.status === "rendering")) {
      throw new InputError("Another walkthrough is rendering. Try again shortly.");
    }
    if (existing) entries.splice(entries.indexOf(existing), 1);
    const progress: Progress = { status: "rendering", phase: "script", completed: 0, total: 0 };
    const entry: ExportEntry = { job, language, revision: walkthroughRevision(job), state: progress };
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
    entries.unshift(entry);
    void render(job, language, script, images, progress).then(({ bytes, captions, narrated, chapters, duration }) => {
      entry.media = { bytes, captions };
      entry.state = { status: "complete", completed: progress.completed, total: progress.total,
        narrated, chapters, duration, revision: entry.revision };
    }).catch((error) => {
      if (!(error instanceof InputError)) console.error(error);
      entry.state = { status: "failed", completed: progress.completed, total: progress.total,
        error: error instanceof InputError ? error.message : "The walkthrough could not be rendered. Try again.",
      };
    }).finally(() => {
      // Recent language switches can reuse the same cut while memory remains bounded.
      let bytes = 0;
      for (let index = 0; index < entries.length; index += 1) {
        bytes += entries[index].media?.bytes.length ?? 0;
        if (index >= 3 || bytes > maxBytes * 2) {
          entries.length = index;
          break;
        }
      }
    });
    return progress;
  }

  function remove(id: string) {
    for (let index = entries.length - 1; index >= 0; index--) {
      if (entries[index].job.id === id) entries.splice(index, 1);
    }
  }

  const rendering = (id: string) => entries.some(entry => entry.job.id === id && entry.state.status === "rendering");
  return { get, start, remove, rendering };
}

async function render(job: CompletedJob, language: Language, script: Promise<Walkthrough>, images: Map<string, Buffer | undefined>, state: Progress) {
  const directory = await mkdtemp(join(tmpdir(), "despecto-video-"));
  const deadline = Date.now() + 420000;
  let browser: import("playwright").Browser | undefined;
  try {
    const { scenes } = await script;
    state.phase = "edit";
    state.total = scenes.length;
    browser = await chromium.launch({ chromiumSandbox: true, timeout: 12000 });
    const page = await browser.newPage({ viewport: frameSize, deviceScaleFactor: 1 });
    await page.route(/^https?:\/\//, (route) => route.abort());
    await prepareFrame(page);
    const timeline: Timeline = [];
    let videoFrames = 0;
    const soundtrack = await open(join(directory, "voice.pcm"), "w");
    try {
      for (const [index, scene] of scenes.entries()) {
        if (Date.now() >= deadline) throw new InputError("The walkthrough reached its seven-minute time limit.");
        const framePrefix = "frame-" + index + "-";
        const speech = readSpeech(scene, directory, deadline).catch(() => Buffer.alloc(0));
        await renderFrames(page, { scene: embedImages(scene, images), label: job.target.label, position: index + 1, total: scenes.length },
          (position, bytes) => writeFile(join(directory, framePrefix + String(position).padStart(2, "0") + ".png"), bytes));
        const pcm = await speech;
        const spoken = pcm.length / pcmBytesPerSecond;
        const frames = Math.ceil((spoken ? Math.max(3.5, spoken + lead + tail) : scene.duration) * fps);
        const duration = frames / fps;
        const start = videoFrames / fps;
        const kind = scene.comparison ? "comparison" : scene.findingId ? "finding" : "overview";
        timeline.push({ chapter: { title: scene.title, start, duration, kind, findingId: scene.findingId }, caption: scene.caption, speech: spoken });

        // A single PCM timeline keeps encoder priming out of the seams between chapters.
        const segment = Buffer.alloc(Math.round(duration * sampleRate) * 2);
        pcm.copy(segment, Math.round(lead * sampleRate) * 2);
        await soundtrack.writeFile(segment);
        const filters = [
          "fps=24", "tpad=stop_mode=clone:stop_duration=" + duration,
          ...(index === 0 ? [] : ["fade=t=in:d=0.24:color=0x22332d"]),
          "fade=t=out:d=0.2:st=" + (duration - 0.2) + ":color=0x22332d",
        ];
        await ffmpeg([
          "-framerate", String(motionRate), "-i", framePrefix + "%02d.png", "-vf", filters.join(","),
          "-frames:v", String(frames), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
          "-threads", "3", "-pix_fmt", "yuv420p", "clip-" + index + ".mp4",
        ], directory, deadline);
        videoFrames += frames;
        state.completed += 1;
      }
    } finally {
      await soundtrack.close();
    }

    state.phase = "encode";
    const chapters = timeline.map(({ chapter }) => chapter);
    const captions = captionsFor(timeline, lead, tail);
    const narrated = timeline.filter(({ speech }) => speech > 0).length;
    const duration = videoFrames / fps;
    const isoLanguage = { en: "eng", hi: "hin", te: "tel" }[language];
    await Promise.all([
      writeFile(join(directory, "video.ffconcat"), "ffconcat version 1.0\n" + chapters.map((_, index) => "file 'clip-" + index + ".mp4'").join("\n")),
      writeFile(join(directory, "chapters.ffmeta"), chapterMetadata(chapters, job.target.label)),
      writeFile(join(directory, "captions.vtt"), captions),
    ]);
    await ffmpeg([
      "-f", "concat", "-safe", "1", "-i", "video.ffconcat",
      "-f", "s16le", "-ar", String(sampleRate), "-ac", "1", "-i", "voice.pcm",
      "-i", "captions.vtt", "-f", "ffmetadata", "-i", "chapters.ffmeta",
      "-map", "0:v:0", "-map", "1:a:0", "-map", "2:s:0", "-map_metadata", "3", "-map_chapters", "3",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "96k", "-c:s", "mov_text",
      "-metadata:s:a:0", "language=" + isoLanguage, "-metadata:s:s:0", "language=" + isoLanguage,
      // The automatic movie timescale can overflow chapter sample durations when captions are muxed.
      "-movie_timescale", "1000",
      "-disposition:s:0", narrated < chapters.length ? "default" : "0", "-movflags", "+faststart", "walkthrough.mp4",
    ], directory, deadline);
    const path = join(directory, "walkthrough.mp4");
    if ((await stat(path)).size > maxBytes) throw new InputError("The walkthrough exceeded the 48 MiB limit.");
    return { bytes: await readFile(path), captions, chapters, duration, narrated };
  } finally {
    try {
      await browser?.close();
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

async function readSpeech(scene: Scene, directory: string, deadline: number) {
  const audio = await narrationFor(scene);
  if (!audio) return Buffer.alloc(0);
  const input = audio.contentType === "audio/wav" ? "input.wav" : "input.mp3";
  await writeFile(join(directory, input), audio.bytes);
  await ffmpeg(["-i", input, "-vn", "-af", "loudnorm=I=-18:TP=-2:LRA=7",
    "-t", "90", "-ar", String(sampleRate), "-ac", "1", "-f", "s16le", "normalized.pcm"], directory, deadline);
  return readFile(join(directory, "normalized.pcm"));
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
    if (!bytes) throw new InputError("A screenshot could not be found. Run a new audit to make the walkthrough.");
    const type = path.endsWith(".jpg") ? "image/jpeg" : "image/png";
    return "data:" + type + ";base64," + bytes.toString("base64");
  }
}

async function ffmpeg(args: string[], cwd?: string, deadline = Date.now() + 5000) {
  const time = deadline - Date.now();
  if (time < 1) throw new InputError("The walkthrough reached its seven-minute time limit.");
  return exec(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    cwd, timeout: Math.min(time, 35000), maxBuffer: 128 * 1024, windowsHide: true,
  });
}
