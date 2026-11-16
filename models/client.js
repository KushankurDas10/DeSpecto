export async function askModel(instruction, contents, { vision = false, json = true } = {}) {
  const model = vision ? process.env.AI_VISION_MODEL : process.env.AI_MODEL;
  const base = process.env.AI_BASE_URL;
  if (!model || !base) return null;

  const response = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.AI_API_KEY ? { authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: contents },
      ],
      temperature: 0.2,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Model provider returned HTTP ${response.status}.`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Model provider returned no message.");
  return json ? JSON.parse(content) : content;
}
