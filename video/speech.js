const maxAudioBytes = 2 * 1024 * 1024;
const maxCacheBytes = 24 * 1024 * 1024;
const cache = new Map();
const pending = new Map();
let cacheBytes = 0;

const azureVoices = {
  en: ["en-IN", "en-IN-NeerjaNeural"],
  hi: ["hi-IN", "hi-IN-SwaraNeural"],
  te: ["te-IN", "te-IN-ShrutiNeural"],
};

export function speechConfigured() {
  const { AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, TTS_BASE_URL, TTS_MODEL } = process.env;
  return Boolean((AZURE_SPEECH_KEY && AZURE_SPEECH_REGION) || (TTS_BASE_URL && TTS_MODEL));
}

export async function narrationFor(scene) {
  if (!speechConfigured()) return null;
  const saved = cache.get(scene);
  if (saved) {
    cache.delete(scene);
    cache.set(scene, saved);
    return saved;
  }
  if (pending.has(scene)) return pending.get(scene);
  if (pending.size >= 2) throw new Error("Speech is busy. Try again shortly.");

  const request = synthesize(scene).then((audio) => {
    if (audio) {
      while (cacheBytes + audio.byteLength > maxCacheBytes) {
        const oldest = cache.keys().next().value;
        cacheBytes -= cache.get(oldest).byteLength;
        cache.delete(oldest);
      }
      cache.set(scene, audio);
      cacheBytes += audio.byteLength;
    }
    return audio;
  }).finally(() => pending.delete(scene));
  pending.set(scene, request);
  return request;
}

export async function synthesize({ language, caption }) {
  if (!speechConfigured()) return null;
  const { AZURE_SPEECH_KEY, AZURE_SPEECH_REGION } = process.env;
  const voice = process.env[`TTS_VOICE_${language.toUpperCase()}`];
  const request = AZURE_SPEECH_KEY && AZURE_SPEECH_REGION
    ? azureRequest(language, caption, voice, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION)
    : compatibleRequest(caption, voice);

  const response = await fetch(request.url, {
    ...request.options,
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(25000),
  });
  const type = response.headers.get("content-type")?.split(";", 1)[0] ?? "";
  if (!response.ok || !response.body || (!type.startsWith("audio/") && type !== "application/octet-stream")) {
    await response.body?.cancel();
    throw new Error(`Speech provider returned HTTP ${response.status} without audio.`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxAudioBytes) throw new Error("Speech response exceeded the scene size limit.");
    chunks.push(chunk);
  }
  if (!size) throw new Error("Speech provider returned empty audio.");
  return Buffer.concat(chunks);
}

function azureRequest(language, caption, voice, key, region) {
  if (!/^[a-z\d]+$/i.test(region)) throw new Error("AZURE_SPEECH_REGION must be the region name from your Speech resource.");
  const [locale, defaultVoice] = azureVoices[language];
  const text = xml(caption.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""));
  return {
    url: `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    options: {
      headers: {
        "content-type": "application/ssml+xml",
        "ocp-apim-subscription-key": key,
        "x-microsoft-outputformat": "audio-24khz-48kbitrate-mono-mp3",
      },
      body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}"><voice name="${xml(voice || defaultVoice)}">${text}</voice></speak>`,
    },
  };
}

function compatibleRequest(caption, voice) {
  const { TTS_BASE_URL, TTS_MODEL, TTS_API_KEY, TTS_VOICE } = process.env;
  return {
    url: `${TTS_BASE_URL.replace(/\/+$/, "")}/audio/speech`,
    options: {
      headers: {
        "content-type": "application/json",
        ...(TTS_API_KEY ? { authorization: `Bearer ${TTS_API_KEY}` } : {}),
      },
      body: JSON.stringify({ model: TTS_MODEL, voice: voice || TTS_VOICE || "alloy", input: caption, response_format: "mp3" }),
    },
  };
}

function xml(text) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  return text.replace(/[&<>"']/g, (character) => entities[character]);
}
