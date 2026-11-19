import process from "node:process";
import { z } from "zod";
import type { Language, Scene } from "../shared/contracts.ts";

export interface Narration {
  bytes: Buffer;
  contentType: "audio/wav" | "audio/mpeg";
}
const maxAudioBytes = 2 * 1024 * 1024;
const geminiVoices: Record<Language, string> = { en: "Charon", hi: "Kore", te: "Sulafat" };

const speechResponse = z.object({
  candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({
    inlineData: z.object({ mimeType: z.string(), data: z.base64() }).optional(),
  })) }).optional() })).optional(),
});

export function speechConfigured() {
  const { GEMINI_API_KEY, TTS_BASE_URL, TTS_MODEL } = process.env;
  return Boolean(GEMINI_API_KEY?.trim() || (TTS_BASE_URL && TTS_MODEL));
}

export async function synthesize({ language, caption }: Pick<Scene, "language" | "caption">): Promise<Narration | null> {
  if (!speechConfigured()) return null;
  const key = process.env.GEMINI_API_KEY?.trim();
  const request = key ? geminiRequest(caption, geminiVoices[language], key) : compatibleRequest(caption);
  if (!request) return null;

  const response = await fetch(request.url, {
    ...request.options,
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(key ? 40000 : 25000),
  });
  const type = response.headers.get("content-type")?.split(";", 1)[0] ?? "";
  const expected = key ? type === "application/json" : type.startsWith("audio/") || type === "application/octet-stream";
  if (!response.ok || !response.body || !expected) {
    await response.body?.cancel();
    if (key && response.status === 429) throw new Error("Gemini speech quota reached. Check the project limits in Google AI Studio.");
    throw new Error(`Speech provider returned HTTP ${response.status} without audio.`);
  }
  const bytes = await readAudioResponse(response.body, key ? Math.ceil(maxAudioBytes / 3) * 4 + 16384 : maxAudioBytes);
  if (!bytes.length) throw new Error("Speech provider returned empty audio.");
  return key ? decodeGeminiAudio(JSON.parse(bytes.toString("utf8"))) : { bytes, contentType: "audio/mpeg" };
}

async function readAudioResponse(body: ReadableStream<Uint8Array>, limit: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > limit) throw new Error("Speech response exceeded the scene size limit.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function geminiRequest(caption: string, voice: string, key: string) {
  const model = process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts";
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    options: {
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: caption }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    },
  };
}

function decodeGeminiAudio(result: unknown): Narration {
  const parsed = speechResponse.safeParse(result);
  const parts = parsed.success ? parsed.data.candidates?.[0]?.content?.parts ?? [] : [];
  const audio = parts.find(({ inlineData }) => inlineData?.mimeType?.startsWith("audio/"))?.inlineData;
  if (!audio?.data) throw new Error("Gemini did not return narration audio.");
  const bytes = Buffer.from(audio.data, "base64");
  if (!bytes.length || bytes.length > maxAudioBytes) throw new Error("Gemini returned an invalid scene size.");
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") {
    return { bytes, contentType: "audio/wav" };
  }
  if (!/^audio\/l16(?:;|$)/i.test(audio.mimeType) || bytes.length % 2) {
    throw new Error("Gemini returned an unsupported audio format.");
  }
  const rate = Number(/\brate=(\d+)\b/i.exec(audio.mimeType)?.[1] ?? 24000);
  if (rate < 8000 || rate > 48000) throw new Error("Gemini returned an unsupported sample rate.");
  // Gemini's raw 16-bit PCM is mono. Wrap it in WAV so the browser can play it directly.
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(bytes.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(bytes.length, 40);
  return { bytes: Buffer.concat([header, bytes]), contentType: "audio/wav" };
}

function compatibleRequest(caption: string) {
  const { TTS_BASE_URL, TTS_MODEL, TTS_API_KEY, TTS_VOICE } = process.env;
  if (!TTS_BASE_URL || !TTS_MODEL) return null;
  return {
    url: `${TTS_BASE_URL.replace(/\/+$/, "")}/audio/speech`,
    options: {
      headers: {
        "content-type": "application/json",
        ...(TTS_API_KEY ? { authorization: `Bearer ${TTS_API_KEY}` } : {}),
      },
      body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE || "alloy", input: caption, response_format: "mp3" }),
    },
  };
}
