import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { deserialize, serialize } from "node:v8";

import { z } from "zod";
import { completedJobSchema, viewSchema, type CompletedJob } from "../../shared/contracts.ts";
import type { FixRecipe } from "../../shared/audit.ts";

export interface SavedReport {
  job: CompletedJob;
  fixes: Map<string, FixRecipe>;
  assets: Map<string, Buffer>;
}
export interface ReportStore {
  records: SavedReport[];
  save(record: SavedReport): Promise<void>;
  remove(id: string): Promise<void>;
}

const recipe = z.union([
  z.object({
    index: z.object({ revision: z.string(), files: z.map(z.string(), z.string()), paths: z.set(z.string()) }),
    repair: z.object({ file: z.string(), line: z.number().int().positive(), column: z.number().int().nonnegative(),
      destination: z.string(), replacement: z.string() }),
  }),
  z.object({
    view: viewSchema, selector: z.string().nullable(),
    rule: z.enum(["title", "mobile-viewport", "overflow", "image-alt", "field-label", "text-contrast", "image-crop"]),
  }).and(z.union([
    z.object({ property: z.enum(["title", "aria-label", "contrast"]), value: z.string() }),
    z.object({ property: z.enum(["viewport", "width", "image-fit"]) }),
  ])),
]);
const snapshot = z.object({
  format: z.literal(1),
  record: z.object({ job: completedJobSchema, fixes: z.map(z.string(), recipe),
    assets: z.map(z.string(), z.instanceof(Buffer)) }),
});

export const maxReports = 20;
const maxReportBytes = 24 * 1024 * 1024;
const reportName = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.audit$/;

export async function openReportStore(path: string): Promise<ReportStore> {
  const directory = resolve(path);
  await mkdir(directory, { recursive: true });
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && reportName.test(entry.name));
  const files = (await Promise.all(entries.map(async ({ name }) => {
    const file = join(directory, name);
    const metadata = await stat(file).catch(() => null);
    return metadata && { file, name, metadata };
  }))).filter((file) => file !== null).sort((left, right) => right.metadata.mtimeMs - left.metadata.mtimeMs);

  const records: SavedReport[] = [];
  for (const { file, name, metadata } of files) {
    if (records.length >= maxReports) {
      await removeFile(file).catch(warn);
      continue;
    }
    if (metadata.size > maxReportBytes) continue;
    try {
      const saved = snapshot.safeParse(deserialize(await readFile(file)));
      if (saved.success && name === `${saved.data.record.job.id}.audit`) records.push(saved.data.record);
    } catch {
      console.warn(`Skipping unreadable DeSpecto report ${name}.`);
    }
  }
  records.sort((left, right) => left.job.createdAt.localeCompare(right.job.createdAt));

  const pending = new Map<string, Promise<void>>();

  function serializeWrite(id: string, callback: () => Promise<void>) {
    // Serialize updates for the same report so a slower fix cannot replace a newer snapshot.
    const previous = pending.get(id) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(callback).finally(() => {
      if (pending.get(id) === operation) pending.delete(id);
    });
    pending.set(id, operation);
    return operation;
  }

  return {
    records,
    async save({ job, fixes, assets }) {
      const bytes = serialize({ format: 1, record: { job, fixes, assets } });
      if (bytes.byteLength > maxReportBytes) throw new Error("A report exceeded the local storage limit.");
      const { id } = job;
      await serializeWrite(id, async () => {
        const temp = join(directory, `${id}-${randomUUID()}.tmp`);
        try {
          await writeFile(temp, bytes, { mode: 0o600, flag: "wx" });
          await rename(temp, join(directory, `${id}.audit`));
        } finally {
          await removeFile(temp).catch(warn);
        }
      });
    },
    remove(id) {
      return serializeWrite(id, () => removeFile(join(directory, `${id}.audit`)));
    },
  };
}

async function removeFile(file: string) {
  try {
    await unlink(file);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
}

function warn(error: unknown) {
  console.warn(`DeSpecto report storage: ${error instanceof Error ? error.message : String(error)}`);
}
