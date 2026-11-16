function modelFor(vision) {
  return vision ? process.env.AI_VISION_MODEL : process.env.AI_MODEL;
}

export function modelConfigured(vision = false) {
  return Boolean(modelFor(vision) && process.env.AI_BASE_URL);
}

export async function askModel(instruction, contents, { vision = false } = {}) {
  if (!modelConfigured(vision)) return null;
  const model = modelFor(vision);
  const base = process.env.AI_BASE_URL;
  const openRouter = new URL(base).hostname === "openrouter.ai";

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
      response_format: { type: "json_object" },
      ...(openRouter && {
        max_tokens: 2000,
        provider: { require_parameters: true },
        reasoning: { effort: "none" },
      }),
    }),
    redirect: "error",
    signal: AbortSignal.timeout(35000),
  });
  if (!response.ok) throw new Error(`Model provider returned HTTP ${response.status}.`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Model provider returned no message.");
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(content.trim());
  return JSON.parse(fenced?.[1] ?? content);
}
