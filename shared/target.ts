import type { Target } from "./contracts.ts";

export class InputError extends Error {}

export function parseTarget(input: unknown): Target {
  if (typeof input !== "string" || !input.trim() || input.length > 2048) {
    throw new InputError("Enter a GitHub repository or website URL.");
  }

  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new InputError("Enter a valid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) {
    throw new InputError("Use a public HTTP or HTTPS URL without credentials or a custom port.");
  }
  url.hash = "";

  if (url.hostname === "github.com" && url.pathname !== "/") {
    const match = /^\/([a-z\d][a-z\d-]*)\/([a-z\d_.-]+?)(?:\.git)?\/?$/i.exec(url.pathname);
    if (!match) throw new InputError("Use the GitHub repository's main URL.");
    const [, owner, repo] = match;
    return { source: "repo", url: `https://github.com/${owner}/${repo}`, label: `${owner}/${repo}` };
  }

  return { source: "website", url: url.href, label: url.hostname };
}
