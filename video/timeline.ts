import type { Chapter } from "../shared/contracts.ts";

type Caption = { chapter: Chapter; caption: string; speech: number };

export function captionsFor(timeline: Caption[], lead: number, tail: number) {
  const cues = timeline.flatMap(({ chapter, caption, speech }) => {
    const chunks: string[] = [];
    let line = "";
    for (const word of caption.trim().split(/\s+/u)) {
      if (line && line.length + word.length > 76) {
        chunks.push(line);
        line = "";
      }
      line += (line ? " " : "") + word;
    }
    if (line) chunks.push(line);
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const window = speech || chapter.duration - lead - tail;
    let start = chapter.start + lead;
    return chunks.map((chunk) => {
      const end = start + chunk.length / total * window;
      const text = chunk.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      const cue = timestamp(start) + " --> " + timestamp(end) + "\n" + text;
      start = end;
      return cue;
    });
  });
  return "WEBVTT\n\n" + cues.join("\n\n") + "\n";
}

function timestamp(seconds: number) {
  const ms = Math.round(seconds * 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return two(Math.floor(ms / 3600000)) + ":" + two(Math.floor(ms / 60000) % 60)
    + ":" + two(Math.floor(ms / 1000) % 60) + "." + String(ms % 1000).padStart(3, "0");
}

export function chapterMetadata(chapters: Chapter[], target: string) {
  const safe = (value: string) => value.replace(/[\r\n]/g, " ").replace(/[\\=;#]/g, "\\$&");
  return [";FFMETADATA1", "title=" + safe(target + " | DeSpecto walkthrough"), ...chapters.flatMap((chapter) => [
    "[CHAPTER]", "TIMEBASE=1/1000", "START=" + Math.round(chapter.start * 1000),
    "END=" + Math.round((chapter.start + chapter.duration) * 1000), "title=" + safe(chapter.title),
  ])].join("\n") + "\n";
}
