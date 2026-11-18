import process from "node:process";
import { z } from "zod";

type ImagePart = { type: "image_url"; image_url: { url: string } };
type TextPart = { type: "text"; text: string };
const completion = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).nonempty(),
});

function modelFor(vision: boolean) {
  return vision ? process.env.AI_VISION_MODEL : process.env.AI_MODEL;
}

export function modelConfigured(vision = false) {
  return Boolean(modelFor(vision) && process.env.AI_BASE_URL);
}

export async function askModel(instruction: string, contents: string | (ImagePart | TextPart)[], { vision = false } = {}): Promise<unknown> {
  const model = modelFor(vision);
  const base = process.env.AI_BASE_URL;
  if (!model || !base) return null;
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
  const parsed = completion.safeParse(await response.json());
  if (!parsed.success) throw new Error("Model provider returned no message.");
  const content = parsed.data.choices[0].message.content;
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(content.trim());
  return JSON.parse(fenced?.[1] ?? content);
}
