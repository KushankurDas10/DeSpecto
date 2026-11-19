import { fixSchema, languageSchema, type Chapter, type CompletedJob, type ExportState, type Language } from "../../shared/contracts.ts";
import { button, element, errorMessage, request } from "./dom.ts";
import { videoExport } from "./export.ts";

type Cut = Extract<ExportState, { status: "complete" }>;
const languageNames = { en: "English", hi: "Hindi", te: "Telugu" } satisfies Record<Language, string>;
const timecode = (seconds: number) => Math.floor(seconds / 60) + ":" + String(Math.floor(seconds) % 60).padStart(2, "0");
type Media = ReturnType<ReturnType<typeof videoExport>["media"]>;
let selectedLanguage: Language = "en";

export function createWalkthrough(container: HTMLElement, job: CompletedJob) {
  const player = element("section", "card player");
  player.setAttribute("aria-labelledby", "walkthrough-title");
  const toolbar = element("header", "player-toolbar");
  const title = element("h2", "", "Audit walkthrough");
  title.id = "walkthrough-title";
  const languageLabel = element("label", "language-control", "Narration");
  const language = element("select");
  for (const [code, name] of Object.entries(languageNames)) {
    const option = element("option", "", name);
    option.value = code;
    language.append(option);
  }
  language.value = selectedLanguage;
  languageLabel.append(language);
  const download = element("a", "button primary", "Download MP4");
  download.hidden = true;
  const tools = element("div", "player-tools");
  tools.append(languageLabel, download);
  toolbar.append(title, tools);

  const layout = element("div", "player-layout");
  const screen = element("div", "player-screen");
  const video = element("video");
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.setAttribute("aria-label", "Recorded audit walkthrough");
  video.hidden = true;

  const slate = element("div", "player-slate");
  const mark = element("img", "slate-mark");
  mark.src = "/inspector.svg";
  mark.alt = "";
  mark.setAttribute("aria-hidden", "true");
  const screenTitle = element("p", "slate-title", "Watch the audit");
  const status = element("p", "slate-status");
  status.setAttribute("role", "status");
  const progress = element("progress");
  progress.setAttribute("aria-label", "Walkthrough rendering progress");
  progress.hidden = true;
  let actionMethod: "GET" | "POST" = "POST";
  const create = button("Create walkthrough", "button primary", () => void load(actionMethod));
  create.hidden = true;
  const slateCopy = element("div", "slate-copy");
  slateCopy.append(screenTitle, status, progress, create);
  slate.append(mark, slateCopy);
  screen.append(video, slate);

  const playback = element("div", "player-main");
  const notice = element("p", "player-notice");
  notice.setAttribute("role", "status");
  notice.hidden = true;
  playback.append(screen, notice);

  const sidebar = element("nav", "player-chapters");
  sidebar.setAttribute("aria-label", "Walkthrough chapters");
  const bar = element("div", "chapter-header");
  const length = element("span", "chapter-time");
  bar.append(element("h3", "", "Chapters"), length);
  const list = element("ol", "chapter-list");
  sidebar.append(bar, list);
  layout.append(playback, sidebar);
  player.append(toolbar, layout);
  container.replaceChildren(player);

  let controller = new AbortController();
  let cut: Cut | undefined;
  let working = false;
  let pendingChapter: Chapter | undefined;
  let rows: HTMLButtonElement[] = [];

  language.addEventListener("change", () => {
    selectedLanguage = languageSchema.parse(language.value);
    void load();
  });
  video.addEventListener("timeupdate", highlightChapter);
  video.addEventListener("seeking", highlightChapter);
  video.addEventListener("loadedmetadata", () => {
    if (pendingChapter) jumpTo(pendingChapter);
  });
  video.addEventListener("error", () => {
    if (cut) showSlate("Playback interrupted", "Reload the walkthrough to try again.", "Reload video", "GET");
  });
  void load();
  return () => {
    controller.abort();
    releaseVideo();
  };

  async function load(method: "GET" | "POST" = "GET", fixId?: string) {
    controller.abort();
    controller = new AbortController();
    const { signal } = controller;
    const narration = selectedLanguage;
    const exporter = videoExport(job, narration);
    releaseVideo();
    working = true;
    drawChapters();
    showSlate("Watch the audit", "Checking for a saved walkthrough…");
    setNotice("");
    try {
      await exporter.follow(method, signal, (state) => {
        if (state.status === "complete") {
          showVideo(state, narration, exporter.media(state.revision), fixId);
        } else if (state.status === "rendering") {
          const copy = { script: "Writing the narration…", edit: "Editing evidence and recording narration…", encode: "Finishing the MP4…" };
          const count = state.total ? " " + state.completed + " of " + state.total + " chapters." : "";
          showSlate("Building your walkthrough", copy[state.phase] + count);
          if (state.total > 0) {
            progress.hidden = false;
            progress.max = state.total;
            progress.value = state.completed;
          }
        } else if (state.status === "failed") {
          showSlate("The walkthrough stopped", state.error, "Try again");
        } else {
          showSlate("Watch the audit", "Follow the evidence with narration, captions, and fix previews.", "Create walkthrough");
        }
      });
    } catch (error) {
      if (!signal.aborted) showSlate("Walkthrough unavailable", errorMessage(error), "Try again", method);
    } finally {
      if (!signal.aborted) {
        working = false;
        drawChapters();
      }
    }
  }

  function showSlate(heading: string, message: string, action?: string, method: "GET" | "POST" = "POST") {
    video.hidden = true;
    download.hidden = true;
    slate.hidden = false;
    if (screenTitle.textContent !== heading) screenTitle.textContent = heading;
    if (status.textContent !== message) status.textContent = message;
    progress.hidden = true;
    create.hidden = !action;
    create.textContent = action ?? "";
    actionMethod = method;
  }

  function showVideo(state: Cut, narration: Language, media: Media, fixId?: string) {
    cut = state;
    pendingChapter = state.chapters.find(({ kind, findingId }) => kind === "comparison" && findingId === fixId);
    const captions = element("track");
    captions.kind = "captions";
    captions.label = languageNames[narration];
    captions.srclang = narration;
    captions.default = state.narrated < state.total;
    captions.src = media.captions;
    video.append(captions);
    if (captions.default) captions.track.mode = "showing";
    video.src = media.video;
    video.hidden = false;
    slate.hidden = true;
    download.href = media.download;
    download.hidden = false;
    setNotice(state.narrated === 0 ? "Captions only. Narration was unavailable for this cut."
      : state.narrated < state.total ? "Captions cover every chapter. Some chapters have no narration." : "");
  }

  function drawChapters() {
    const count = cut?.chapters.length ?? 1 + job.result.findings.length + job.result.findings.filter(({ fix }) => fix).length;
    length.textContent = count + (count === 1 ? " chapter" : " chapters") + (cut ? " · " + timecode(cut.duration) : "");
    const chapters = cut?.chapters;
    rows = [];
    list.replaceChildren();
    if (chapters) {
      for (const chapter of chapters) {
        const row = element("li", "chapter");
        const seek = button("", "chapter-seek", () => jumpTo(chapter));
        seek.append(element("span", "chapter-time", timecode(chapter.start)), element("span", "", chapter.title));
        seek.lang = selectedLanguage;
        row.append(seek);
        if (chapter.kind === "finding") {
          const item = job.result.findings.find(({ id }) => id === chapter.findingId);
          if (item?.fixAvailable && !item.fix) row.append(fixButton(item));
        }
        rows.push(seek);
        list.append(row);
      }
      highlightChapter();
      return;
    }

    const overview = element("li", "chapter");
    overview.append(element("span", "chapter-label", "Audit overview"));
    list.append(overview);
    for (const item of job.result.findings) {
      const row = element("li", "chapter");
      row.append(element("span", "chapter-label", item.title));
      if (item.fixAvailable && !item.fix) row.append(fixButton(item));
      if (item.fix) row.append(element("span", "chapter-fix-included", "Fix included"));
      list.append(row);
    }
  }

  function fixButton(item: CompletedJob["result"]["findings"][number]) {
    const action = button("Show fix", "chapter-fix", () => void addFix(item));
    action.disabled = working;
    action.setAttribute("aria-label", "Show fix for " + item.title);
    return action;
  }

  async function addFix(item: CompletedJob["result"]["findings"][number]) {
    if (working) return;
    working = true;
    language.disabled = true;
    create.disabled = true;
    drawChapters();
    video.pause();
    setNotice("Preparing a before-and-after comparison…");
    const { signal } = controller;
    try {
      item.fix = await request("/api/audits/" + job.id + "/findings/" + item.id + "/fix", fixSchema, { method: "POST", signal });
      if (!signal.aborted) await load("POST", item.id);
    } catch (error) {
      if (!signal.aborted) setNotice(errorMessage(error));
    } finally {
      language.disabled = false;
      create.disabled = false;
      if (!signal.aborted) {
        working = false;
        drawChapters();
      }
    }
  }

  function jumpTo(chapter: Chapter) {
    if (video.readyState === 0) {
      pendingChapter = chapter;
      return;
    }
    pendingChapter = undefined;
    // Land after the short transition and before the next chapter's narration starts.
    video.currentTime = chapter.start === 0 ? 0 : chapter.start + .25;
    highlightChapter();
  }

  function highlightChapter() {
    const index = cut?.chapters.findIndex(({ start, duration }) =>
      video.currentTime >= start - .01 && video.currentTime < start + duration - .01) ?? -1;
    for (const [position, row] of rows.entries()) {
      const current = position === index || (video.ended && position === rows.length - 1);
      if (current && !row.hasAttribute("aria-current")) {
        row.setAttribute("aria-current", "true");
        const card = row.getBoundingClientRect();
        const track = list.getBoundingClientRect();
        if (card.left < track.left) list.scrollLeft += card.left - track.left - 14;
        else if (card.right > track.right) list.scrollLeft += card.right - track.right + 14;
        if (list.scrollHeight > list.clientHeight) {
          if (card.top < track.top) list.scrollTop += card.top - track.top - 12;
          else if (card.bottom > track.bottom) list.scrollTop += card.bottom - track.bottom + 12;
        }
      } else if (!current) {
        row.removeAttribute("aria-current");
      }
    }
  }

  function releaseVideo() {
    cut = undefined;
    pendingChapter = undefined;
    video.pause();
    if (video.hasAttribute("src")) {
      video.removeAttribute("src");
      video.replaceChildren();
      video.load();
    }
  }

  function setNotice(message: string) {
    notice.textContent = message;
    notice.hidden = !message;
  }
}
