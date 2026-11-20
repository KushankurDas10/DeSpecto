import { auditInputSchema, languageSchema } from "../../shared/contracts.ts";
import { redesignFor } from "../../workers/site-audit/design.ts";
import { createQueue } from "./jobs.ts";
import { openReportStore } from "./reports.ts";
import { InputError } from "../../shared/target.ts";
import { walkthroughFor } from "../../video/walkthrough.ts";
import { narrationFor } from "../../video/speech.ts";
import { createExports, exportAvailable } from "../../video/export.ts";


export function createAuditHandler(queue = createQueue(), exports = createExports()) {
  return async (request: Request) => {
    const headers = new Headers({ "Cache-Control": "no-store" });
    const send = (status: number, data: unknown, type = "application/json; charset=utf-8") =>
      respond(headers, status, data, type);
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const audit = /^\/api\/audits\/([a-f\d-]+)(?:\/(.*))?$/.exec(path);
      if (["POST", "DELETE"].includes(request.method) && request.headers.get("origin")
        && request.headers.get("origin") !== `http://${request.headers.get("host")}`
        && request.headers.get("origin") !== `https://${request.headers.get("host")}`) {
        return send(403, { error: "Cross-origin requests are unavailable." });
      }
      if (request.method === "DELETE" && audit && !audit[2]) {
        if (exports.rendering(audit[1])) return send(409, { error: "The walkthrough is rendering. Remove this audit after it finishes." });
        await queue.remove(audit[1]);
        exports.remove(audit[1]);
        return send(200, { removed: true });
      }
      if (request.method === "POST" && path === "/api/audits") {
        const input = await readBody(request);
        return send(202, queue.submit(input.url));
      }
      if (request.method === "POST" && audit?.[2] === "design") {
        const job = queue.get(audit[1]);
        if (job?.status !== "complete" || job.target.source !== "website") return send(404, { error: "Website report unavailable." });
        return send(200, await redesignFor(job, url.searchParams.get("direction"), (name) => queue.asset(job.id, name)));
      }
      if (audit && /^export(?:\/(?:file|captions))?$/.test((audit[2] ?? ""))) {
        const [, id, action = ""] = audit;
        const job = queue.get(id);
        if (job?.status !== "complete") return send(404, { error: "Audit unavailable." });
        const lang = readLanguage(url);
        const entry = exports.get(job, lang);
        if (request.method === "GET" && action === "export") {
          return send(200, entry?.state ?? { status: "idle" });
        }
        if ((request.method === "GET" || request.method === "HEAD") && action === "export/file") {
          const revision = url.searchParams.get("revision");
          if (!entry?.media || (revision !== null && revision !== entry.revision)) {
            return send(404, { error: "Walkthrough unavailable. Create a new video." });
          }
          const name = job.target.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
          const disposition = url.searchParams.get("play") === "1" ? "inline" : "attachment";
          headers.set("Content-Disposition", disposition + '; filename="despecto-' + (name ? name + "-" : "") + lang + '.mp4"');
          return videoResponse(request, headers, entry.media.bytes);
        }
        if (request.method === "GET" && action === "export/captions") {
          const revision = url.searchParams.get("revision");
          if (!entry?.media || (revision !== null && revision !== entry.revision)) {
            return send(404, { error: "Walkthrough captions unavailable." });
          }
          return send(200, entry.media.captions, "text/vtt; charset=utf-8");
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

function videoResponse(request: Request, headers: Headers, bytes: Uint8Array) {
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Type", "video/mp4");
  const length = bytes.byteLength;
  const range = request.method === "GET" && request.headers.get("range");
  if (!range) {
    headers.set("Content-Length", String(length));
    return new Response(request.method === "HEAD" ? null : Uint8Array.from(bytes), { headers });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = match?.[1] ? Number(match[1]) : Math.max(0, length - Number(match?.[2] ?? 0));
  const end = match?.[1] && match[2] ? Math.min(Number(match[2]), length - 1) : length - 1;
  if (!match || (!match[1] && !match[2]) || start > end) {
    headers.set("Content-Range", "bytes */" + length);
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", "bytes " + start + "-" + end + "/" + length);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(Uint8Array.from(bytes.subarray(start, end + 1)), { status: 206, headers });
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
  despectoAuditStateV2?: ReturnType<typeof openAuditState>;
};

async function openAuditState() {
  const store = await openReportStore(process.env.REPORT_DIR ?? ".despecto").catch((error: unknown) => {
    console.warn("Reports will stay in memory.", error);
    return undefined;
  });
  return { queue: createQueue(store), exports: createExports() };
}

export async function handleAuditRequest(request: Request) {
  // Keep jobs and rendered videos across Fast Refresh. The route must use the current response schemas.
  runtime.despectoAuditStateV2 ??= openAuditState();
  const { queue, exports } = await runtime.despectoAuditStateV2;
  return createAuditHandler(queue, exports)(request);
}
