import type { RepoFixRecipe } from "../../shared/audit.ts";
import type { DiffFix, Finding, Target } from "../../shared/contracts.ts";
import { InputError } from "../../shared/target.ts";
import { checkRepository } from "../repo-audit/index.ts";

export function previewRepositoryFix(_target: Target | null, item: Finding, { index, repair }: RepoFixRecipe): DiffFix {
  const { file, line, column, destination, replacement } = repair;
  const source = index.files.get(file);
  if (source === undefined) throw new InputError("The original file could not be located.");
  const lines = source.split("\n");
  const terminated = source.endsWith("\n");
  if (terminated) lines.pop();
  const offset = line - 1;
  const before = lines[offset];
  if (before.slice(column, column + destination.length) !== destination) {
    throw new InputError("The original link could not be located in the audited revision.");
  }
  const extension = destination.match(/[?#].*$/)?.[0] ?? "";
  const next = replacement.split("/").map((part) => encodeURIComponent(part)
    .replace(/[()]/g, (character) => character === "(" ? "%28" : "%29")).join("/") + extension;
  const after = before.slice(0, column) + next + before.slice(column + destination.length);
  lines[offset] = after;
  const files = new Map(index.files);
  files.set(file, lines.join("\n") + (terminated ? "\n" : ""));
  const verification = checkRepository({ ...index, files });
  const verified = before !== after && !verification.findings.some(({ source, title, explanation, evidence }) =>
    source === "repo" && title === item.title && explanation === item.explanation
    && evidence.file === file && evidence.lines[0] === line);
  const start = Math.max(0, offset - 3);
  const end = Math.min(lines.length, offset + 4);
  const patch = [
    `diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`,
    `@@ -${start + 1},${end - start} +${start + 1},${end - start} @@`,
  ];
  for (let i = start; i < end; i += 1) {
    if (i === offset) {
      append(`-${before}`, i);
      append(`+${after}`, i);
    } else {
      append(` ${lines[i]}`, i);
    }
  }
  return {
    kind: "diff", file, before, after, patch: patch.join("\n") + "\n", verified,
    summary: verified ? "The replacement link resolves in the audited revision." : "The original link still needs review.",
  };

  function append(text: string, index: number) {
    patch.push(text);
    if (!terminated && index === lines.length - 1) patch.push("\\ No newline at end of file");
  }
}
