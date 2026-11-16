const maxAudioBytes = 2 * 1024 * 1024;

export async function synthesize({ language, caption }) {
  const { TTS_BASE_URL, TTS_MODEL, TTS_API_KEY, TTS_VOICE } = process.env;
  if (!TTS_BASE_URL || !TTS_MODEL) return null;

  const voice = process.env[`TTS_VOICE_${language.toUpperCase()}`] || TTS_VOICE || "alloy";
  const response = await fetch(`${TTS_BASE_URL.replace(/\/+$/, "")}/audio/speech`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(TTS_API_KEY ? { authorization: `Bearer ${TTS_API_KEY}` } : {}),
    },
    body: JSON.stringify({ model: TTS_MODEL, voice, input: caption, response_format: "mp3" }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("audio/")) {
    await response.body?.cancel();
    return null;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxAudioBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
