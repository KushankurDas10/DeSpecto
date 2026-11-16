import { checkRepository } from "../repo-audit/index.js";

export function previewRepositoryFix(_target, _finding, { index, repair }) {
  const { file, line, original, destination, replacement } = repair;
  const lines = index.files.get(file).split(/\r?\n/);
  const before = lines[line - 1];
  const extension = destination.match(/[?#].*$/)?.[0] ?? "";
  const next = replacement.split("/").map(encodeURIComponent).join("/") + extension;
  const after = before.replace(original, () => original.replace(destination, () => next));
  lines[line - 1] = after;
  const files = new Map(index.files);
  files.set(file, lines.join("\n"));
  const verification = checkRepository({ ...index, files });
  const verified = before !== after && ![...verification.fixes.values()].some(({ repair }) =>
    repair.file === file && repair.line === line && repair.destination === destination);
  const patch = [
    `diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`,
    `@@ -${line} +${line} @@`, `-${before}`, `+${after}`,
  ].join("\n");
  return {
    kind: "diff", file, before, after, patch, verified,
    summary: verified ? "The replacement link resolves in the audited revision." : "The original link still needs review.",
  };
}
