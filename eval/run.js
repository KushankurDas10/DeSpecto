import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { createApp } from "../apps/api/server.js";
import { checkRepository } from "../workers/repo-audit/index.js";
import { previewRepositoryFix } from "../workers/fix/repository.js";

const repositories = [
  "octocat/Hello-World",
  "expressjs/express",
  "pallets/flask",
  "sindresorhus/is",
  "nodejs/undici",
  "fastify/fastify",
  "earlephilhower/ESP8266Audio",
  "lit/lit",
  "markedjs/marked",
  "11ty/eleventy",
].map((repo) => `https://github.com/${repo}`);
const websites = [
  "https://info.cern.ch/",
  "https://example.com/",
  "https://www.iana.org/domains/reserved",
  "https://www.w3.org/WAI/demos/bad/before/home.html",
  "https://www.w3.org/WAI/demos/bad/after/home.html",
];

// Evaluate the built-in checks independently of provider credentials.
delete process.env.AI_BASE_URL;
const server = createApp().listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const targets = [...repositories, ...websites].values();
const results = [];

async function json(path, options) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(45000) });
  const data = await response.json();
  assert.ok(response.ok, data.error ?? `HTTP ${response.status}`);
  return data;
}

async function audit(url) {
  const queued = await json("/api/audits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const path = `/api/audits/${queued.id}`;
  const deadline = Date.now() + 135000;
  let job = queued;
  while (["queued", "running"].includes(job.status) && Date.now() < deadline) {
    await delay(650);
    job = await json(path);
  }
  assert.equal(job.status, "complete", job.error ?? `Timed out at ${job.stage}`);
  const { findings, revision, screenshots } = job.result;
  for (const item of findings) {
    assert.equal(item.source, job.target.source);
    assert.ok(item.title && item.explanation);
    assert.equal(item.fix, null);
    if (item.source === "repo") {
      assert.ok(item.evidence.file);
      const [start, end] = item.evidence.lines;
      assert.ok(start > 0 && end >= start);
    } else {
      assert.ok(screenshots.some(({ url }) => url === item.evidence.screenshot));
      const { box, width, height } = item.evidence;
      if (box) assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= width && box.y + box.h <= height);
    }
  }

  if (job.target.source === "repo") {
    assert.match(revision, /^[a-f\d]{40}$/);
  } else {
    assert.deepEqual(screenshots.map(({ view }) => view), ["desktop", "mobile"]);
    for (const image of screenshots) await checkImage(image.url, image.width, image.height);
  }
  if (url === websites[3] || url === websites[4]) {
    assert.equal(findings.some(({ title }) => title === "Image missing alternative text"), url === websites[3]);
  }

  if (url === websites[0]) {
    const finding = findings.find(({ fixAvailable, title }) => fixAvailable && title === "Missing mobile viewport setting");
    assert.ok(finding, "The website demo needs a reproducible viewport fix.");
    const fix = await json(`${path}/findings/${finding.id}/fix`, { method: "POST" });
    assert.equal(fix.verified, true);
    await Promise.all([checkImage(fix.before, 390, 844), checkImage(fix.after, 390, 844)]);
    for (const lang of ["en", "hi", "te"]) {
      const { scenes } = await json(`${path}/walkthrough?lang=${lang}`);
      assert.equal(scenes.length, findings.length + 1);
      assert.equal(scenes.find(({ findingId }) => findingId === finding.id)?.language, lang);
    }
  }
  return findings;
}

async function checkImage(path, width, height) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.readUInt32BE(16), width);
  assert.equal(png.readUInt32BE(20), height);
}

async function run() {
  for (const url of targets) {
    const started = performance.now();
    try {
      const findings = await audit(url);
      results.push(true);
      console.log(`PASS ${url} · ${findings.length} findings · ${Math.round(performance.now() - started)} ms`);
      for (const item of findings) console.log(`  ${item.evidence.file ?? item.evidence.view} · ${item.title}`);
    } catch (error) {
      results.push(false);
      console.error(`FAIL ${url} · ${error.message}`);
    }
  }
}

async function checkRepoFixture() {
  const readme = [
    "## Scaffold a separate app", "```sh", "npm create sample-app", "npm run dev", "```", "",
    "## Develop this repo", "Run `npm run preview`.", "",
    "[Valid file](docs/example(v2).pdf) and [guide](old/guide.txt#start).",
  ].join("\n");
  const files = new Map([
    ["README.md", readme],
    ["package.json", '{"scripts":{"start":"node absent.js"}}'],
  ]);
  const paths = new Set([...files.keys(), "docs/example(v2).pdf", "new/guide.txt"]);
  const { findings, fixes } = checkRepository({ files, paths });
  assert.deepEqual(findings.map(({ title }) => title), [
    "Undeclared script: preview", "Broken README link", "Missing entry point for start",
  ]);

  const item = findings[1];
  const patch = previewRepositoryFix(null, item, fixes.get(item.id));
  assert.equal(patch.verified, true);
  const directory = await mkdtemp(join(tmpdir(), "despecto-check-"));
  try {
    await Promise.all([writeFile(join(directory, "README.md"), readme), writeFile(join(directory, "fix.diff"), patch.patch)]);
    await promisify(execFile)("git", ["apply", "--check", "fix.diff"], { cwd: directory, windowsHide: true, timeout: 5000 });
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
  console.log("PASS repository fixture · Markdown context, source evidence, and an applicable patch");
}

try {
  await checkRepoFixture();
  await Promise.all([run(), run()]);
  const passed = results.filter(Boolean).length;
  console.log(`${passed}/${repositories.length + websites.length} targets passed.`);
  if (passed !== repositories.length + websites.length) process.exitCode = 1;
} finally {
  server.close();
}
