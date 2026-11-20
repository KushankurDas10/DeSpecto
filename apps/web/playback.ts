import type { Chapter } from "../../shared/contracts.ts";
import { button, element } from "./dom.ts";

export const timecode = (seconds: number) => Math.floor(seconds / 60) + ":" + String(Math.floor(seconds) % 60).padStart(2, "0");

const paths = {
  Play: "M8 5v14l11-7z", Pause: "M8 5v14M16 5v14",
  Mute: "M3 9h4l5-4v14l-5-4H3z M16 8q4 4 0 8 M19 5q7 7 0 14",
  Unmute: "M3 9h4l5-4v14l-5-4H3z M16 9l6 6m0-6-6 6",
  Fullscreen: "M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6",
  "Exit fullscreen": "M9 3v6H3m12-6v6h6m0 6h-6v6m-6 0v-6H3",
};

function setIcon(control: HTMLButtonElement, name: keyof typeof paths) {
  if (control.title === name) return;
  control.title = name;
  control.setAttribute("aria-label", name);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[name]);
  svg.append(path);
  control.replaceChildren(svg);
}

export function playbackControls(video: HTMLVideoElement, frame: HTMLElement, notify: (message: string) => void) {
  const controls = element("div", "transport");
  const timeline = element("div", "transport-timeline");
  const seek = element("input", "transport-seek");
  seek.type = "range";
  seek.min = "0";
  seek.step = "0.1";
  seek.setAttribute("aria-label", "Seek walkthrough");
  const markers = element("div", "transport-markers");
  markers.setAttribute("aria-hidden", "true");
  timeline.append(seek, markers);

  function toggle() {
    if (!video.paused) video.pause();
    else void video.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify("Playback could not start. Press Play to try again.");
    });
  }

  const row = element("div", "transport-row");
  const play = button("", "transport-play", toggle);
  const clock = element("span", "transport-clock");
  const sound = button("", "", () => {
    if (!video.volume) { video.volume = 1; video.muted = false; }
    else video.muted = !video.muted;
  });
  const volume = element("input", "transport-volume");
  volume.type = "range";
  volume.min = "0";
  volume.max = "1";
  volume.step = ".05";
  volume.setAttribute("aria-label", "Playback volume");
  volume.oninput = () => { video.volume = Number(volume.value); video.muted = false; };
  const captions = button("CC", "transport-cc", () => {
    const track = video.querySelector("track")?.track;
    if (track) track.mode = track.mode === "showing" ? "disabled" : "showing";
    sync();
  });
  captions.title = "Captions";
  captions.setAttribute("aria-label", "Captions");
  const speed = element("select");
  speed.setAttribute("aria-label", "Playback speed");
  for (const rate of [.75, 1, 1.25, 1.5, 2]) speed.add(new Option(rate + "×", String(rate)));
  speed.onchange = () => { video.defaultPlaybackRate = video.playbackRate = Number(speed.value); };
  const mobileVideo: HTMLVideoElement & { webkitEnterFullscreen?: () => void } = video;
  const full = button("", "", async () => {
    try {
      if (document.fullscreenElement === frame) await document.exitFullscreen();
      else if (document.fullscreenEnabled) await frame.requestFullscreen();
      else mobileVideo.webkitEnterFullscreen?.();
    } catch { notify("Fullscreen is unavailable in this window."); }
  });
  full.hidden = !document.fullscreenEnabled && !mobileVideo.webkitEnterFullscreen;
  frame.onfullscreenchange = () => setIcon(full, document.fullscreenElement === frame ? "Exit fullscreen" : "Fullscreen");
  setIcon(full, "Fullscreen");
  row.append(play, clock, sound, volume, captions, speed, full);
  controls.append(timeline, row);
  frame.append(controls);
  video.onclick = toggle;
  seek.oninput = () => { if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value); };
  function sync() {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    seek.max = String(duration);
    seek.disabled = !duration;
    seek.value = String(video.currentTime);
    clock.textContent = timecode(video.currentTime) + " / " + timecode(duration);
    seek.setAttribute("aria-valuetext", clock.textContent);
    seek.style.setProperty("--played", (duration ? video.currentTime / duration * 100 : 0) + "%");
    setIcon(play, video.paused ? "Play" : "Pause");
    setIcon(sound, video.muted || !video.volume ? "Unmute" : "Mute");
    volume.value = String(video.muted ? 0 : video.volume);
    speed.value = String(video.playbackRate);
    const track = video.querySelector("track")?.track;
    captions.disabled = !track;
    captions.setAttribute("aria-pressed", String(track?.mode === "showing"));
  }
  for (const event of ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "ended", "ratechange", "volumechange"]) {
    video.addEventListener(event, sync);
  }
  video.textTracks.addEventListener("change", sync);
  sync();
  return (chapters: Chapter[], duration: number) => {
    markers.replaceChildren();
    for (const chapter of chapters.slice(1)) {
      const marker = element("i");
      marker.style.left = chapter.start / duration * 100 + "%";
      markers.append(marker);
    }
    sync();
  };
}
