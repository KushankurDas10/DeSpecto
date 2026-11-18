import { fixSchema, languageSchema, walkthroughSchema, type CompletedJob, type Language, type Scene, type Walkthrough } from "../../shared/contracts.ts";

interface Playback {
  scene: Scene;
  started: number;
  elapsed: number;
  audio?: HTMLAudioElement;
  utterance?: SpeechSynthesisUtterance;
}
import { button, element, errorMessage, request, showSceneEvidence } from "./dom.ts";
import { showExport } from "./export.ts";

const voices = { en: "en-US", hi: "hi-IN", te: "te-IN" };
let selectedLanguage: Language = "en";

export function createWalkthrough(container: HTMLElement, job: CompletedJob) {
  const player = element("section", "card player");
  const settings = element("div", "player-settings");
  const languageLabel = element("label", "language-control", "Narration");
  const language = element("select");
  for (const [code, label] of [["en", "English"], ["hi", "Hindi"], ["te", "Telugu"]]) {
    const option = element("option", "", label);
    option.value = code;
    language.append(option);
  }
  language.value = selectedLanguage;
  languageLabel.append(language);
  settings.append(element("h2", "", "Audit walkthrough"), languageLabel);

  const stage = element("div", "stage");
  const controls = element("div", "play-controls");
  const play = button("Play", "button primary", toggle);
  const previous = button("Previous", "button", () => move(index - 1, playing));
  const next = button("Next", "button", () => move(index + 1, playing));
  const progress = element("progress");
  progress.max = 100;
  progress.setAttribute("aria-label", "Scene progress");
  const count = element("output");
  const status = element("p", "voice-note");
  status.setAttribute("role", "status");
  status.hidden = true;
  const exports = element("div", "export-controls");
  exports.hidden = true;
  controls.append(play, previous, next, progress, count);
  player.append(settings, stage, controls, status, exports);
  container.replaceChildren(player);

  let controller = new AbortController();
  let script: Walkthrough | undefined;
  let playback: Playback | undefined;
  let frame = 0;
  let index = 0;
  let playing = false;
  let finished = false;
  let seekScene: (time: number) => void = () => {};
  let sceneTime = 1;
  const resize = () => seekScene(sceneTime);
  window.addEventListener("resize", resize);
  language.addEventListener("change", () => {
    selectedLanguage = languageSchema.parse(language.value);
    void load();
  });
  void load();

  return () => {
    controller?.abort();
    stop();
    window.removeEventListener("resize", resize);
  };

  async function load(fixId?: string) {
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    stop();
    script = undefined;
    setStatus("");
    exports.hidden = true;
    setSceneControls();
    stage.replaceChildren(element("p", "", "Preparing walkthrough…"));
    try {
      const result = await request(`/api/audits/${job.id}/walkthrough?lang=${language.value}`, walkthroughSchema, { signal });
      if (signal.aborted) return;
      script = result;
      const preview = fixId ? result.scenes.findIndex((scene) => scene.findingId === fixId && scene.comparison) : -1;
      move(Math.max(0, preview), false);
      if (result.exportAvailable) showExport(exports, job, selectedLanguage, signal);
    } catch (error) {
      if (!signal.aborted) {
        stage.replaceChildren(element("p", "", errorMessage(error)), button("Retry", "button", () => void load()));
      }
    }
  }

  function move(position: number, autoplay: boolean) {
    if (!script || position < 0 || position >= script.scenes.length) return;
    stop();
    index = position;
    finished = false;
    progress.value = 0;
    const scene = script.scenes[index];
    stage.replaceChildren(element("span", "eyebrow", `SCENE ${index + 1} OF ${script.scenes.length}`));
    const title = element("h3", "", scene.title);
    title.lang = scene.language;
    stage.append(title);
    seekScene = showSceneEvidence(stage, scene, { repository: job.target.url, revision: job.result.revision });
    const caption = element("p", "caption", scene.caption);
    caption.lang = scene.language;
    stage.append(caption);
    sceneTime = 1;
    seekScene(sceneTime);
    if (scene.fixAvailable && !scene.comparison) addFixControl(scene);
    setStatus(scene.language !== language.value ? "This finding is available in English." : "");
    setSceneControls();
    if (autoplay) void start();
  }

  function addFixControl(scene: Scene) {
    const actions = element("div", "scene-actions");
    const preview = script?.scenes.findIndex((candidate) => candidate.findingId === scene.findingId && candidate.comparison) ?? -1;
    const action = button(preview >= 0 ? "View fix" : "Show fix", "button", async () => {
      if (preview >= 0) {
        move(preview, false);
        return;
      }
      stop();
      setSceneControls();
      const { signal } = controller;
      action.disabled = true;
      action.textContent = "Preparing fix…";
      try {
        const fix = await request(`/api/audits/${job.id}/findings/${scene.findingId}/fix`, fixSchema, { method: "POST", signal });
        const item = job.result.findings.find(({ id }) => id === scene.findingId);
        if (item) item.fix = fix;
        if (!signal.aborted) void load(scene.findingId);
      } catch (error) {
        if (signal.aborted) return;
        setStatus(errorMessage(error));
        action.disabled = false;
        action.textContent = "Retry fix";
      }
    });
    actions.append(action);
    stage.append(actions);
  }

  function setSceneControls() {
    play.disabled = !script;
    play.textContent = playing ? "Pause" : finished ? "Replay" : "Play";
    previous.disabled = !script || index === 0;
    next.disabled = !script || index === script.scenes.length - 1;
    count.textContent = script ? `${index + 1} / ${script.scenes.length}` : "";
  }

  function toggle() {
    if (playing && playback) {
      playing = false;
      playback.elapsed += performance.now() - playback.started;
      playback.audio?.pause();
      if (playback.utterance) speechSynthesis.pause();
      cancelAnimationFrame(frame);
      setSceneControls();
    } else if (finished) {
      move(0, true);
    } else if (playback) {
      void resume(playback);
    } else {
      void start();
    }
  }

  async function start() {
    if (!script) return;
    const scene = script.scenes[index];
    const current: Playback = { scene, started: performance.now(), elapsed: 0 };
    playback = current;
    playing = true;
    sceneTime = 0;
    seekScene(sceneTime);
    setSceneControls();
    if (script.speechAvailable) {
      const audio = new Audio(`/api/audits/${job.id}/audio/${index}?lang=${language.value}&revision=${encodeURIComponent(script.revision)}`);
      current.audio = audio;
      audio.onended = () => end(current);
      try {
        await audio.play();
        if (current === playback && playing) frame = requestAnimationFrame(tick);
        return;
      } catch {
        if (current !== playback || !playing) return;
        releaseAudio(current);
      }
    }
    playBrowserVoice(current);
  }

  function playBrowserVoice(current: Playback) {
    const { scene } = current;
    const synthesis = window.speechSynthesis;
    const voice = synthesis?.getVoices().find((item) =>
      item.lang.toLowerCase().split(/[-_]/)[0] === scene.language);
    current.started = performance.now();
    current.elapsed = 0;
    if (voice && window.SpeechSynthesisUtterance) {
      const utterance = new SpeechSynthesisUtterance(scene.caption);
      current.utterance = utterance;
      utterance.lang = voices[scene.language];
      utterance.voice = voice;
      utterance.onend = () => end(current);
      utterance.onerror = () => {
        if (current === playback) captionsOnly(current);
      };
      synthesis.resume();
      synthesis.speak(utterance);
    } else {
      captionsOnly(current);
    }
    frame = requestAnimationFrame(tick);
  }

  async function resume(current: Playback) {
    playing = true;
    current.started = performance.now();
    setSceneControls();
    if (current.audio) {
      try {
        await current.audio.play();
      } catch {
        if (current === playback && playing) {
          releaseAudio(current);
          playBrowserVoice(current);
        }
        return;
      }
    }
    if (current !== playback || !playing) return;
    if (current.utterance) speechSynthesis.resume();
    frame = requestAnimationFrame(tick);
  }

  function captionsOnly(current: Playback) {
    current.utterance = undefined;
    setStatus("No voice available for this scene. Showing captions.");
  }

  function tick(now: number) {
    const current = playback;
    if (!playing || !current) return;
    const elapsed = (current.elapsed + now - current.started) / 1000;
    sceneTime = Math.min(1, (current.audio?.currentTime ?? elapsed) / 1.4);
    seekScene(sceneTime);
    const ratio = current.audio
      ? current.audio.currentTime / (current.audio.duration || current.scene.duration)
      : elapsed / current.scene.duration;
    progress.value = Math.max(0, Math.min(100, ratio * 100));
    if ((!current.audio && !current.utterance && ratio >= 1) || (!current.audio && ratio >= 3)) {
      end(current);
    } else {
      frame = requestAnimationFrame(tick);
    }
  }

  function end(current: Playback) {
    if (current !== playback || !playing || !script) return;
    if (index + 1 < script.scenes.length) {
      move(index + 1, true);
      return;
    }
    stop();
    progress.value = 100;
    finished = true;
    setSceneControls();
  }

  function stop() {
    const current = playback;
    playing = false;
    playback = undefined;
    cancelAnimationFrame(frame);
    if (current?.audio) releaseAudio(current);
    if (current?.utterance) {
      current.utterance.onend = null;
      current.utterance.onerror = null;
      speechSynthesis.cancel();
    }
  }

  function releaseAudio(current: Playback) {
    const { audio } = current;
    current.audio = undefined;
    if (!audio) return;
    audio.onended = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  function setStatus(message: string) {
    status.textContent = message;
    status.hidden = !message;
  }
}
