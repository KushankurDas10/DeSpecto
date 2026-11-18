import { auditInputSchema, languageSchema } from "../../shared/contracts.ts";
import { createQueue } from "./jobs.ts";
import { openReportStore } from "./reports.ts";
import { InputError } from "../../shared/target.ts";
import { walkthroughFor } from "../../video/walkthrough.ts";
import { narrationFor } from "../../video/speech.ts";
import { createExports, exportAvailable } from "../../video/export.ts";


export function createAuditHandler(queue = createQueue()) {
  const exports = createExports();
  return async (request: Request) => {
    const headers = new Headers({ "Cache-Control": "no-store" });
    const send = (status: number, data: unknown, type = "application/json; charset=utf-8") =>
      respond(headers, status, data, type);
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const audit = /^\/api\/audits\/([a-f\d-]+)(?:\/(.*))?$/.exec(path);
      if (request.method === "POST" && request.headers.get("origin")
        && request.headers.get("origin") !== `http://${request.headers.get("host")}`
        && request.headers.get("origin") !== `https://${request.headers.get("host")}`) {
        return send(403, { error: "Cross-origin requests are unavailable." });
      }
      if (request.method === "POST" && path === "/api/audits") {
        const input = await readBody(request);
        return send(202, queue.submit(input.url));
      }
      if (audit && /^export(?:\/file)?$/.test((audit[2] ?? ""))) {
        const [, id, action = ""] = audit;
        const job = queue.get(id);
        if (job?.status !== "complete") return send(404, { error: "Audit unavailable." });
        const lang = readLanguage(url);
        const entry = exports.get(job, lang);
        if (request.method === "GET" && action === "export") {
          return send(200, entry?.state ?? { status: "idle" });
        }
        if (request.method === "GET" && action === "export/file") {
          if (!entry?.bytes) return send(404, { error: "Export unavailable. Create a new video." });
          headers.set("Content-Disposition", `attachment; filename=despecto-${lang}.mp4`);
          headers.set("Content-Length", String(entry.bytes.byteLength));
          return send(200, entry.bytes, "video/mp4");
        }
        if (request.method === "POST" && action === "export") {
          return send(202, await exports.start(job, lang, (path) => queue.asset(id, path.slice(path.lastIndexOf("/") + 1))));
        }
      }
      if (request.method === "GET" && audit) {
        const [, id, action = ""] = audit;
        const job = queue.get(id);
        if (!action && job) return send(200, job);
        const name = /^assets\/([a-z\d-]+\.(?:png|jpg))$/.exec(action)?.[1];
        const bytes = name ? queue.asset(id, name) : undefined;
        if (name && bytes) return send(200, bytes, name.endsWith(".jpg") ? "image/jpeg" : "image/png");
        const patchId = /^findings\/([a-f\d-]+)\/patch$/.exec(action)?.[1];
        if (patchId) {
          const fix = (job?.status === "complete" ? job.result.findings : []).find((item) => item.id === patchId)?.fix;
          if (fix?.kind === "diff") {
            headers.set("Content-Disposition", "attachment; filename=despecto-fix.patch");
            return send(200, fix.patch, "text/x-diff; charset=utf-8");
          }
        }
        const audio = /^audio\/(\d{1,2})$/.exec(action)?.[1];
        if (job?.status === "complete" && (action === "walkthrough" || audio !== undefined)) {
          const lang = readLanguage(url);
          const walkthrough = await walkthroughFor(job, lang);
          if (action === "walkthrough") {
            return send(200, { ...walkthrough, exportAvailable: await exportAvailable() });
          }
          const revision = url.searchParams.get("revision");
          if (revision !== null && revision !== walkthrough.revision) {
            return send(409, { error: "The walkthrough changed. Open it again to hear the updated scenes." });
          }
          const scene = walkthrough.scenes[Number(audio)];
          if (!scene || !walkthrough.speechAvailable) return send(404, { error: "Voice unavailable." });
          const speech = await narrationFor(scene).catch(() => null);
          if (speech) return send(200, speech.bytes, speech.contentType);
          return send(502, { error: "Voice unavailable." });
        }
      }
      if (request.method === "POST" && audit) {
        const findingId = /^findings\/([a-f\d-]+)\/fix$/.exec((audit[2] ?? ""))?.[1];
        const result = findingId && await queue.fix(audit[1], findingId);
        if (result) return send(200, result);
      }
      return send(404, { error: "Not found." });
    } catch (error) {
      if (error instanceof InputError) return send(400, { error: error.message });
      console.error(error);
      return send(500, { error: "Something went wrong. Please try again." });
    }
  };
}

function readLanguage(url: URL) {
  const lang = url.searchParams.get("lang") ?? "en";
  const parsed = languageSchema.safeParse(lang);
  if (!parsed.success) throw new InputError("Select English, Hindi, or Telugu.");
  return parsed.data;
}

async function readBody(request: Request): Promise<{ url: string }> {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    throw new InputError("Send audit requests as JSON.");
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (reader) {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          throw new InputError("Request is too large.");
        }
        chunks.push(chunk.value);
      }
    }
  } finally {
    reader?.releaseLock();
  }
  let input: unknown;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InputError("Request body must be valid JSON.");
  }
  const parsed = auditInputSchema.safeParse(input);
  if (!parsed.success) throw new InputError("Enter a GitHub repository or website URL.");
  return parsed.data;
}

function respond(headers: Headers, status: number, data: unknown, type: string) {
  headers.set("content-type", type);
  if (type.startsWith("application/json")) return new Response(JSON.stringify(data), { status, headers });
  if (typeof data === "string") return new Response(data, { status, headers });
  if (data instanceof Uint8Array) return new Response(Uint8Array.from(data), { status, headers });
  throw new Error("Unsupported audit response body.");
}

const runtime = globalThis as typeof globalThis & {
  despectoAuditHandler?: Promise<ReturnType<typeof createAuditHandler>>;
};

async function openHandler() {
  const store = await openReportStore(process.env.REPORT_DIR ?? ".despecto").catch((error: unknown) => {
    console.warn("Reports will stay in memory.", error);
    return undefined;
  });
  return createAuditHandler(createQueue(store));
}

export async function handleAuditRequest(request: Request) {
  runtime.despectoAuditHandler ??= openHandler();
  return (await runtime.despectoAuditHandler)(request);
}
