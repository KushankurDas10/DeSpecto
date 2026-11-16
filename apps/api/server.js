import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createQueue } from "./jobs.js";
import { InputError } from "../../shared/target.js";
import { auditRepository } from "../../workers/repo-audit/index.js";
import { auditWebsite } from "../../workers/site-audit/index.js";
import { previewRepositoryFix } from "../../workers/fix/repository.js";
import { previewWebsiteFix } from "../../workers/fix/website.js";
import { languages } from "../../shared/finding.js";
import { walkthroughFor } from "../../video/walkthrough.js";
import { narrationFor } from "../../video/speech.js";
import { createExports, exportAvailable } from "../../video/export.js";

const web = new URL("../web/", import.meta.url);
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ...["app.js", "dom.js", "report.js", "walkthrough.js", "export.js"].map((name) =>
    [`/${name}`, [name, "text/javascript; charset=utf-8"]]),
]);

export function createApp(queue = createQueue({
  auditors: { repo: (target, progress) => auditRepository(target, progress), website: auditWebsite },
  fixers: { repo: previewRepositoryFix, website: previewWebsiteFix },
})) {
  const exports = createExports();
  return createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", [
      "default-src 'self'", "img-src 'self'", "style-src 'self' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com", "frame-ancestors 'none'", "form-action 'self'", "base-uri 'none'",
    ].join("; "));
    response.setHeader("Cache-Control", "no-store");

    try {
      const url = new URL(`http://localhost${request.url}`);
      const path = url.pathname;
      const audit = /^\/api\/audits\/([a-f\d-]+)(?:\/(.*))?$/.exec(path);
      if (request.method === "POST" && request.headers.origin
        && request.headers.origin !== `http://${request.headers.host}`
        && request.headers.origin !== `https://${request.headers.host}`) {
        return send(response, 403, { error: "Cross-origin requests are unavailable." });
      }
      if (request.method === "POST" && path === "/api/audits") {
        const input = await readBody(request);
        return send(response, 202, queue.submit(input?.url));
      }
      if (audit && /^export(?:\/file)?$/.test(audit[2])) {
        const [, id, action] = audit;
        const job = queue.get(id);
        if (job?.status !== "complete") return send(response, 404, { error: "Audit unavailable." });
        const lang = readLanguage(url);
        const entry = exports.get(job, lang);
        if (request.method === "GET" && action === "export") {
          return send(response, 200, entry?.state ?? { status: "idle" });
        }
        if (request.method === "GET" && action === "export/file") {
          if (!entry?.bytes) return send(response, 404, { error: "Export unavailable. Create a new video." });
          response.setHeader("Content-Disposition", `attachment; filename=despecto-${lang}.mp4`);
          response.setHeader("Content-Length", entry.bytes.byteLength);
          return send(response, 200, entry.bytes, "video/mp4");
        }
        if (request.method === "POST" && action === "export") {
          return send(response, 202, await exports.start(job, lang, (path) => queue.asset(id, path.split("/").at(-1))));
        }
      }
      if (request.method === "GET" && audit) {
        const [, id, action] = audit;
        const job = queue.get(id);
        if (!action && job) return send(response, 200, job);
        const name = /^assets\/([a-z\d-]+\.png)$/.exec(action)?.[1];
        const bytes = name && queue.asset(id, name);
        if (bytes) return send(response, 200, bytes, "image/png");
        const patchId = /^findings\/([a-f\d-]+)\/patch$/.exec(action)?.[1];
        if (patchId) {
          const fix = job?.result?.findings.find((item) => item.id === patchId)?.fix;
          if (fix?.kind === "diff") {
            response.setHeader("Content-Disposition", "attachment; filename=despecto-fix.patch");
            return send(response, 200, fix.patch, "text/x-diff; charset=utf-8");
          }
        }
        const audio = /^audio\/(\d{1,2})$/.exec(action)?.[1];
        if (job?.status === "complete" && (action === "walkthrough" || audio !== undefined)) {
          const lang = readLanguage(url);
          const walkthrough = await walkthroughFor(job, lang);
          if (action === "walkthrough") {
            return send(response, 200, { ...walkthrough, exportAvailable: await exportAvailable() });
          }
          const scene = walkthrough.scenes[Number(audio)];
          if (!scene || !walkthrough.speechAvailable) return send(response, 404, { error: "Voice unavailable." });
          const speech = await narrationFor(scene).catch(() => null);
          if (speech) return send(response, 200, speech, "audio/mpeg");
          return send(response, 502, { error: "Voice unavailable." });
        }
      }
      if (request.method === "POST" && audit) {
        const findingId = /^findings\/([a-f\d-]+)\/fix$/.exec(audit[2])?.[1];
        const result = findingId && await queue.fix(audit[1], findingId);
        if (result) return send(response, 200, result);
      }
      if (request.method === "GET" && staticFiles.has(path)) {
        const [file, type] = staticFiles.get(path);
        return send(response, 200, await readFile(new URL(file, web)), type);
      }
      return send(response, 404, { error: "Not found." });
    } catch (error) {
      if (error instanceof InputError) return send(response, 400, { error: error.message });
      console.error(error);
      return send(response, 500, { error: "Something went wrong. Please try again." });
    }
  });
}

function readLanguage(url) {
  const lang = url.searchParams.get("lang") ?? "en";
  if (!Object.hasOwn(languages, lang)) throw new InputError("Select English, Hindi, or Telugu.");
  return lang;
}

async function readBody(request) {
  if (request.headers["content-type"]?.split(";", 1)[0] !== "application/json") {
    throw new InputError("Send audit requests as JSON.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 8192) {
      request.resume();
      throw new InputError("Request is too large.");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InputError("Request body must be valid JSON.");
  }
}

export function send(response, status, data, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "content-type": type });
  response.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, process.env.HOST ?? "127.0.0.1", () => {
    console.log(`DeSpecto is listening on port ${port}.`);
  });
}
