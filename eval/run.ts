import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import type { ZodType } from "zod";
import { createAuditHandler } from "../apps/api/handler.ts";
import { errorSchema, fixSchema, jobSchema, walkthroughSchema } from "../shared/contracts.ts";
import { checkRepository } from "../workers/repo-audit/index.ts";
import { previewRepositoryFix } from "../workers/fix/repository.ts";

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
const handle = createAuditHandler();
const base = "http://127.0.0.1";
const targets = [...repositories, ...websites].values();
const results: boolean[] = [];

async function json<T>(path: string, schema: ZodType<T>, options?: RequestInit): Promise<T> {
  const response = await handle(new Request(base + path, options));
  const data: unknown = await response.json();
  const error = errorSchema.safeParse(data);
  assert.ok(response.ok, error.success ? error.data.error : `HTTP ${response.status}`);
  return schema.parse(data);
}

async function audit(url: string) {
  const queued = await json("/api/audits", jobSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const path = `/api/audits/${queued.id}`;
  const deadline = Date.now() + 135000;
  let job = queued;
  while (["queued", "running"].includes(job.status) && Date.now() < deadline) {
    await delay(650);
    job = await json(path, jobSchema);
  }
  assert.ok(job.status === "complete", job.status === "failed" ? job.error : `Timed out at ${job.stage}`);
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
      const imageUrl = item.evidence.screenshot;
      assert.ok(screenshots?.some(({ url }) => url === imageUrl));
      const { box, width, height } = item.evidence;
      if (box) assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= width && box.y + box.h <= height);
    }
  }

  if (job.target.source === "repo") {
    assert.ok(revision);
    assert.match(revision, /^[a-f\d]{40}$/);
  } else {
    assert.ok(screenshots);
    assert.deepEqual(screenshots.map(({ view }) => view), ["desktop", "mobile"]);
    for (const image of screenshots) await checkImage(image.url, image.width, image.height);
  }
  if (url === websites[3] || url === websites[4]) {
    assert.equal(findings.some(({ title }) => title === "Image missing alternative text"), url === websites[3]);
  }

  if (url === websites[0]) {
    const finding = findings.find(({ fixAvailable, title }) => fixAvailable && title === "Missing mobile viewport setting");
    assert.ok(finding, "The website demo needs a reproducible viewport fix.");
    const fix = await json(`${path}/findings/${finding.id}/fix`, fixSchema, { method: "POST" });
    assert.equal(fix.verified, true);
    assert.ok(fix.kind === "screenshots" && fix.beforeSize && fix.afterSize);
    assert.equal(fix.afterSize.width, 390);
    await Promise.all([checkImage(fix.before, fix.beforeSize.width, fix.beforeSize.height),
      checkImage(fix.after, fix.afterSize.width, fix.afterSize.height)]);
    for (const lang of ["en", "hi", "te"]) {
      const { scenes } = await json(`${path}/walkthrough?lang=${lang}`, walkthroughSchema);
      assert.equal(scenes.length, findings.length + 2);
      assert.equal(scenes.find(({ findingId }) => findingId === finding.id)?.language, lang);
      assert.deepEqual(scenes.find(({ findingId, comparison }) => findingId === finding.id && comparison)?.comparison, fix);
    }
  }
  return findings;
}

async function checkImage(path: string, width: number, height: number) {
  const response = await handle(new Request(base + path));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  const jpeg = Buffer.from(await response.arrayBuffer());
  assert.equal(jpeg.readUInt16BE(0), 0xffd8);
  for (let offset = 2; offset + 9 <= jpeg.length && jpeg[offset] === 0xff;) {
    const marker = jpeg[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      assert.equal(jpeg.readUInt16BE(offset + 7), width);
      assert.equal(jpeg.readUInt16BE(offset + 5), height);
      return;
    }
    offset += 2 + jpeg.readUInt16BE(offset + 2);
  }
  assert.fail("Screenshot has no JPEG size header.");
}

async function run() {
  for (const url of targets) {
    const started = performance.now();
    try {
      const findings = await audit(url);
      results.push(true);
      console.log(`PASS ${url} · ${findings.length} findings · ${Math.round(performance.now() - started)} ms`);
      for (const item of findings) console.log(`  ${item.source === "repo" ? item.evidence.file : item.evidence.view} · ${item.title}`);
    } catch (error) {
      results.push(false);
      console.error(`FAIL ${url} · ${error instanceof Error ? error.message : String(error)}`);
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
  const { findings, fixes } = checkRepository({ files, paths, revision: "fixture" });
  assert.deepEqual(findings.map(({ title }) => title), [
    "Undeclared script: preview", "Broken README link", "Missing entry point for start",
  ]);

  const item = findings[1];
  const recipe = fixes.get(item.id);
  assert.ok(recipe);
  const patch = previewRepositoryFix(null, item, recipe);
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

const fixtureOnly = process.argv.includes("--fixture-only");

await checkRepoFixture();
if (!fixtureOnly) {
  await Promise.all([run(), run()]);
  const passed = results.filter(Boolean).length;
  console.log(`${passed}/${repositories.length + websites.length} targets passed.`);
  if (passed !== repositories.length + websites.length) process.exitCode = 1;
}
