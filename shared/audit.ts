import type { Report, Target, View } from "./contracts.ts";

export type Progress = (percent: number, stage: string) => void;

export interface AuditContext {
  progress: Progress;
  asset(name: string, bytes: Buffer): string;
}

export interface RepoIndex {
  revision: string;
  paths: Set<string>;
  files: Map<string, string>;
}

export interface RepoRepair {
  file: string;
  line: number;
  column: number;
  destination: string;
  replacement: string;
}

export interface RepoFixRecipe {
  index: RepoIndex;
  repair: RepoRepair;
}

export type SiteRule = "title" | "mobile-viewport" | "overflow" | "image-alt"
  | "broken-image" | "orphan-label" | "field-label" | "text-contrast" | "image-crop";

export type WebsiteChange =
  | { property: "title" | "aria-label" | "contrast"; value: string }
  | { property: "viewport" | "width" | "image-fit" };

export type WebsiteFixRecipe = WebsiteChange & { view: View; rule: SiteRule; selector: string | null };
export type FixRecipe = RepoFixRecipe | WebsiteFixRecipe;
export type AuditResult = Report & { fixes?: Map<string, FixRecipe> };
export type Auditor = (target: Target, progress: Progress, context: AuditContext) => Promise<AuditResult>;
