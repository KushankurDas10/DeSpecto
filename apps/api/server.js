import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createQueue } from "./jobs.js";
import { InputError } from "../../shared/target.js";

export function createApp(queue = createQueue()) {
  return createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    const path = new URL(request.url, "http://localhost").pathname;
    const audit = /^\/api\/audits\/([a-f\d-]+)(?:\/(.*))?$/.exec(path);

    try {
      if (request.method === "POST" && request.headers.origin
        && request.headers.origin !== `http://${request.headers.host}`
        && request.headers.origin !== `https://${request.headers.host}`) {
        return send(response, 403, { error: "Cross-origin requests are unavailable." });
      }
      if (request.method === "POST" && path === "/api/audits") {
        const input = await readBody(request);
        return send(response, 202, queue.submit(input?.url));
      }
      if (request.method === "GET" && audit) {
        const [, id, action] = audit;
        if (!action && queue.get(id)) return send(response, 200, queue.get(id));
        const name = /^assets\/([a-z\d-]+\.png)$/.exec(action)?.[1];
        const bytes = name && queue.asset(id, name);
        if (bytes) return send(response, 200, bytes, "image/png");
      }
      if (request.method === "POST" && audit) {
        const findingId = /^findings\/([a-f\d-]+)\/fix$/.exec(audit[2])?.[1];
        const result = findingId && await queue.fix(audit[1], findingId);
        if (result) return send(response, 200, result);
      }
      return send(response, 404, { error: "Not found." });
    } catch (error) {
      if (error instanceof InputError) return send(response, 400, { error: error.message });
      console.error(error);
      return send(response, 500, { error: "Something went wrong. Please try again." });
    }
  });
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
