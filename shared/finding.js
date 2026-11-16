import { randomUUID } from "node:crypto";

export const languages = Object.freeze({ en: "English", hi: "Hindi", te: "Telugu" });

const sources = new Set(["repo", "website"]);
const types = new Set(["misleading_claim", "missing_claim", "bug", "visual_issue", "accessibility", "improvement"]);
const severities = new Set(["high", "medium", "low"]);

export function finding({ source, type, severity, confidence = 1, title, explanation, evidence }) {
  if (!sources.has(source) || !types.has(type) || !severities.has(severity)) {
    throw new TypeError("Invalid finding classification.");
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1 || !title?.trim() || !explanation?.trim()) {
    throw new TypeError("A finding requires a title, an explanation, and a confidence between 0 and 1.");
  }
  if (source === "repo" && (!evidence?.file || !validLines(evidence.lines))) {
    throw new TypeError("A repository finding requires a file and an inclusive line range.");
  }
  if (source === "website" && !evidence?.screenshot) {
    throw new TypeError("A website finding requires a screenshot.");
  }

  return {
    id: randomUUID(), source, type, severity, confidence, title, explanation, evidence, fix: null,
  };
}

function validLines(lines) {
  return Array.isArray(lines) && lines.length === 2 && lines.every(Number.isSafeInteger)
    && lines[0] >= 1 && lines[1] >= lines[0];
}
