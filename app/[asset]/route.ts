import "server-only";
import { webAsset } from "../../apps/api/web-assets.ts";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const file = await webAsset((await params).asset);
  const headers = { "Cache-Control": "no-store" };
  if (!file) return Response.json({ error: "Not found." }, { status: 404, headers });
  return new Response(file.text, { headers: { ...headers, "Content-Type": file.type } });
}
