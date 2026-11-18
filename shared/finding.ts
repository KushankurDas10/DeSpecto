import { randomUUID } from "node:crypto";
import { findingSchema, type Finding, type FindingInput } from "./contracts.ts";

export const languages = Object.freeze({ en: "English", hi: "Hindi", te: "Telugu" });

type NewFinding = FindingInput extends infer T
  ? T extends FindingInput ? Omit<T, "id" | "fix"> : never : never;

export function finding(input: NewFinding): Finding {
  return findingSchema.parse({ ...input, id: randomUUID(), fix: null });
}
