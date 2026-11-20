import { z } from "zod";

export const languageSchema = z.enum(["en", "hi", "te"]);
export const viewSchema = z.enum(["desktop", "mobile"]);
export const severitySchema = z.enum(["high", "medium", "low"]);
const category = z.enum(["misleading_claim", "missing_claim", "bug", "visual_issue", "accessibility", "improvement"]);
const integer = z.number().int().nonnegative();
const size = z.object({ width: z.number().int().positive(), height: z.number().int().positive() });
const box = z.object({ x: integer, y: integer, w: z.number().int().positive(), h: z.number().int().positive() });

export const screenshotEvidenceSchema = size.extend({
  screenshot: z.string().min(1),
  view: viewSchema,
  box: box.nullish(),
  selector: z.string().nullish(),
});
export const codeEvidenceSchema = z.object({
  file: z.string().min(1),
  lines: z.tuple([z.number().int().positive(), z.number().int().positive()])
    .refine(([start, end]) => end >= start, "Line ranges must be inclusive and ordered."),
  excerpt: z.string(),
});
const screenshotsFix = z.object({
  kind: z.literal("screenshots"), verified: z.boolean(), summary: z.string(),
  before: z.string(), after: z.string(), beforeBox: box.nullish(), afterBox: box.nullish(),
  beforeSize: size.optional(), afterSize: size.optional(),
});
const diffFix = z.object({
  kind: z.literal("diff"), verified: z.boolean(), summary: z.string(),
  file: z.string(), before: z.string(), after: z.string(), patch: z.string(),
});
export const fixSchema = z.discriminatedUnion("kind", [screenshotsFix, diffFix]);

const findingFields = z.object({
  id: z.string().min(1), type: category, severity: severitySchema,
  confidence: z.number().min(0).max(1).default(1),
  title: z.string().trim().min(1), explanation: z.string().trim().min(1),
  fix: fixSchema.nullable(), fixAvailable: z.boolean().optional(),
});
export const findingSchema = z.discriminatedUnion("source", [
  findingFields.extend({ source: z.literal("repo"), evidence: codeEvidenceSchema }),
  findingFields.extend({ source: z.literal("website"), evidence: screenshotEvidenceSchema }),
]);
const sourceItem = z.discriminatedUnion("kind", [
  z.object({ group: integer.optional(), kind: z.enum(["text", "subheading"]), text: z.string() }),
  z.object({ group: integer.optional(), kind: z.literal("link"), text: z.string(), href: z.string().regex(/^(https?:\/\/|mailto:)/i) }),
  z.object({ group: integer.optional(), kind: z.literal("image"), text: z.string(), box }),
]);
export const designSourceSchema = size.extend({
  screenshot: z.string(), title: z.string(),
  intro: z.array(sourceItem), sections: z.array(z.object({ heading: z.string(), items: z.array(sourceItem) })),
});
export type DesignSource = z.infer<typeof designSourceSchema>;

export const reportSchema = z.object({
  designSource: designSourceSchema.optional(),
  findings: z.array(findingSchema), notes: z.array(z.string()).optional(),
  revision: z.string().optional(),
  screenshots: z.array(size.extend({ view: viewSchema, url: z.string().min(1) })).optional(),
});
export const targetSchema = z.object({
  source: z.enum(["repo", "website"]), url: z.string().min(1), label: z.string().min(1),
});
const jobFields = z.object({
  id: z.string().min(1), createdAt: z.string(), target: targetSchema,
  stage: z.string(), progress: z.number().min(0).max(100),
});
export const completedJobSchema = jobFields.extend({ status: z.literal("complete"), result: reportSchema });
export const jobSchema = z.discriminatedUnion("status", [
  jobFields.extend({ status: z.literal("queued") }),
  jobFields.extend({ status: z.literal("running") }),
  jobFields.extend({ status: z.literal("failed"), error: z.string() }),
  completedJobSchema,
]);
export const auditInputSchema = z.object({ url: z.string().trim().min(1).max(2048) });
export const errorSchema = z.object({ error: z.string() });
export const walkthroughSchema = z.object({
  revision: z.string(), speechAvailable: z.boolean(), exportAvailable: z.boolean().optional(),
  scenes: z.array(z.object({
    title: z.string(), caption: z.string(), language: languageSchema, duration: z.number().positive(),
    severity: severitySchema.optional(), findingId: z.string().optional(), fixAvailable: z.boolean().optional(),
    evidence: z.union([screenshotEvidenceSchema, codeEvidenceSchema]).optional(),
    comparison: fixSchema.optional(),
  })),
});
const chapterSchema = z.object({
  title: z.string(), start: z.number().nonnegative(), duration: z.number().positive(),
  kind: z.enum(["overview", "finding", "comparison"]), findingId: z.string().optional(),
});
const exportProgress = z.object({ completed: integer, total: integer });
export const exportStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle") }),
  exportProgress.extend({ status: z.literal("rendering"), phase: z.enum(["script", "edit", "encode"]) }),
  exportProgress.extend({
    status: z.literal("complete"), narrated: integer, revision: z.string(),
    duration: z.number().positive(), chapters: z.array(chapterSchema).min(1),
  }),
  exportProgress.extend({ status: z.literal("failed"), error: z.string() }),
]);

export type Finding = z.output<typeof findingSchema>;
export type FindingInput = z.input<typeof findingSchema>;
export type Report = z.infer<typeof reportSchema>;
export type Job = z.infer<typeof jobSchema>;
export type CompletedJob = z.infer<typeof completedJobSchema>;
export type Target = z.infer<typeof targetSchema>;
export type Fix = z.infer<typeof fixSchema>;
export type ScreenshotFix = z.infer<typeof screenshotsFix>;
export type DiffFix = z.infer<typeof diffFix>;
export type ScreenshotEvidence = z.infer<typeof screenshotEvidenceSchema>;
export type Box = z.infer<typeof box>;
export type Size = z.infer<typeof size>;
export type View = z.infer<typeof viewSchema>;
export type Language = z.infer<typeof languageSchema>;
export type Walkthrough = z.infer<typeof walkthroughSchema>;
export type Scene = Walkthrough["scenes"][number];
export type ExportState = z.infer<typeof exportStateSchema>;
export type Chapter = z.infer<typeof chapterSchema>;

export const designDirection = z.enum(["editorial", "playful", "minimal"]);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const designPlan = z.object({
  paper: color, accent: color, rationale: z.string().min(1).max(600),
  sections: z.array(z.object({ index: integer, layout: z.enum(["feature", "column", "directory"]) })).max(32),
});
export const designConcept = z.object({
  source: designSourceSchema, plan: designPlan, mode: z.enum(["model", "theme", "sample"]),
});
export type DesignPlan = z.infer<typeof designPlan>;
export type DesignPresets = Record<z.infer<typeof designDirection>, DesignPlan>;
