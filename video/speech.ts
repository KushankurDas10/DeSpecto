import type { Scene } from "../shared/contracts.ts";
import { speechConfigured, synthesize, type Narration } from "../models/tts.ts";

const maxCacheBytes = 24 * 1024 * 1024;
const cache = new Map<Scene, Narration>();
const pending = new Map<Scene, Promise<Narration | null>>();
let cacheBytes = 0;

export async function narrationFor(scene: Scene): Promise<Narration | null> {
  if (!speechConfigured()) return null;
  const saved = cache.get(scene);
  if (saved) {
    cache.delete(scene);
    cache.set(scene, saved);
    return saved;
  }
  const inFlight = pending.get(scene);
  if (inFlight) return inFlight;
  if (pending.size >= 2) throw new Error("Speech is busy. Try again shortly.");

  const request = synthesize(scene).then((audio) => {
    if (audio) {
      while (cacheBytes + audio.bytes.byteLength > maxCacheBytes) {
        const [oldest, entry] = cache.entries().next().value ?? [];
        if (!oldest || !entry) break;
        cacheBytes -= entry.bytes.byteLength;
        cache.delete(oldest);
      }
      cache.set(scene, audio);
      cacheBytes += audio.bytes.byteLength;
    }
    return audio;
  }).finally(() => pending.delete(scene));
  pending.set(scene, request);
  return request;
}
