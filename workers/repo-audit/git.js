import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { InputError } from "../../shared/target.js";

const run = promisify(execFile);
const maxFileBytes = 96 * 1024;
const maxIndexBytes = 2 * 1024 * 1024;
const textFile = /(?:\.(?:md|mdx|rst|txt|json|toml|ini|ya?ml|xml|html?|css|scss|m?[jt]sx?|cjs|py|go|rs|java|kt|rb|php|cs|c|h|cpp|sh|ps1|sql)|(?:^|\/)(?:Dockerfile|Makefile|Procfile))$/i;
const excluded = /(?:^|\/)(?:node_modules|vendor|dist|build|coverage|\.git)(?:\/|$)|(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i;
export const rootReadme = /^readme(?:\.(?:md|mdx|rst|txt))?$/i;

function git(directory, args, limits = {}) {
  return run("git", ["-c", "protocol.allow=never", "-c", "protocol.https.allow=always",
    "-c", "http.followRedirects=false", ...args], {
    cwd: directory,
    timeout: 15000,
    maxBuffer: maxIndexBytes,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" },
    ...limits,
  });
}

export async function readRepository(target, progress) {
  const directory = await mkdtemp(join(tmpdir(), "despecto-"));
  try {
    try {
      await git(directory, ["clone", "--quiet", "--depth=1", "--no-checkout", "--filter=blob:limit=100k", "--",
        `${target.url}.git`, "repo"], { timeout: 45000 });
    } catch (error) {
      if (error.code === "ENOENT") throw new InputError("Install Git to audit repositories.");
      if (error.killed) throw new InputError("GitHub took too long to send the repository. Try again or audit a smaller repository.");
      if (/could not resolve host|failed to connect|timed out/i.test(error.stderr ?? "")) {
        throw new InputError("The audit server could not reach GitHub. Check your internet connection and try again.");
      }
      if (/repository not found|authentication failed|could not read username|terminal prompts disabled|(?:http|error:) (?:401|403|404)/i.test(error.stderr ?? "")) {
        throw new InputError("GitHub did not make this repository available without signing in. Check the URL and make sure the repository is public.");
      }
      throw new InputError("Could not read the repository. Check that it is public and accessible.");
    }

    progress(38, "Indexing source files");
    return await readTree(join(directory, "repo"));
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

async function readTree(directory) {
  const [{ stdout: tree }, { stdout: revision }] = await Promise.all([
    git(directory, ["ls-tree", "-r", "-z", "HEAD"]),
    git(directory, ["rev-parse", "HEAD"]),
  ]);
  const entries = tree.split("\0").flatMap((entry) => {
    const match = /^(\d{6}) (?:blob|commit) ([a-f\d]+)\t([\s\S]+)$/.exec(entry);
    return match ? [{ mode: match[1], hash: match[2], path: match[3] }] : [];
  });
  const candidates = entries.filter(({ mode, path }) => mode.startsWith("100")
    && (textFile.test(path) || rootReadme.test(path)) && !excluded.test(path));
  candidates.sort((left, right) => priority(left.path) - priority(right.path));

  const files = new Map();
  let remaining = maxIndexBytes;
  // Read objects directly so symlinks, submodules, and repository hooks are never materialized.
  for (let start = 0; start < Math.min(candidates.length, 100) && remaining > 0; start += 8) {
    const batch = candidates.slice(start, Math.min(start + 8, 100));
    const blobs = await Promise.all(batch.map(async ({ path, hash }) => {
      try {
        const { stdout } = await git(directory, ["cat-file", "blob", hash], { maxBuffer: maxFileBytes, timeout: 3500 });
        return [path, stdout];
      } catch {
        return [path, null];
      }
    }));
    for (const [path, contents] of blobs) {
      if (contents === null || contents.includes("\0") || Buffer.byteLength(contents) > remaining) continue;
      files.set(path, contents);
      remaining -= Buffer.byteLength(contents);
    }
  }
  return { revision: revision.trim(), paths: new Set(entries.map(({ path }) => path)), files };
}

function priority(path) {
  if (rootReadme.test(path)) return 0;
  if (path === "package.json" || path.startsWith(".github/workflows/")) return 1;
  if (path.endsWith("/package.json")) return 2;
  return 2 + path.split("/").length;
}
