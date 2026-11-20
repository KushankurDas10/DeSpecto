import { randomUUID } from "node:crypto";
import { InputError, parseTarget } from "../../shared/target.ts";
import { auditRepository } from "../../workers/repo-audit/index.ts";
import { maxReports } from "./reports.ts";

import { withBrowser, withPage, capturePage } from "../../workers/site-audit/browser.ts";
import { inspectPage } from "../../workers/site-audit/inspect.ts";
import { captureDesignSource } from "../../workers/site-audit/design-source.ts";
import { auditWebsite } from "../../workers/site-audit/index.ts";
import { previewRepositoryFix } from "../../workers/fix/repository.ts";
import { previewWebsiteFix } from "../../workers/fix/website.ts";
import type { AuditContext, Auditor, FixRecipe } from "../../shared/audit.ts";
import type { CompletedJob, DesignSource, Fix, Job } from "../../shared/contracts.ts";
import type { ReportStore, SavedReport } from "./reports.ts";

interface JobRecord {
  job: Job;
  fixes?: Map<string, FixRecipe>;
  assets: Map<string, Buffer>;
  assetBytes: number;
  preparingSource?: Promise<DesignSource>;
  removing?: Promise<void>;
  pendingFixes: Map<string, Promise<Fix>>;
}

const auditors: Record<Job["target"]["source"], Auditor> = {
  repo: (target, progress) => auditRepository(target, progress),
  website: auditWebsite,
};

export function createQueue(store?: ReportStore) {
  const records = new Map<string, JobRecord>((store?.records ?? []).map((record) => [record.job.id, {
    ...record,
    assetBytes: [...record.assets.values()].reduce((total, bytes) => total + bytes.byteLength, 0),
    pendingFixes: new Map(),
  }]));
  const pending: JobRecord[] = [];
  let running = 0;
  let activeFixes = 0;

  function submit(input: unknown): Job {
    const target = parseTarget(input);
    if (pending.length >= 8) throw new InputError("The audit queue is full. Try again in a moment.");
    if (records.size >= maxReports) {
      const oldest = [...records].find(([, record]) =>
        ["complete", "failed"].includes(record.job.status) && record.pendingFixes.size === 0 && !record.removing && !record.preparingSource);
      if (!oldest) throw new InputError("The audit queue is full. Try again in a moment.");
      records.delete(oldest[0]);
      void store?.remove(oldest[0]).catch((error) => console.warn(error.message));
    }

    const job: Job = { id: randomUUID(), createdAt: new Date().toISOString(), target, status: "queued", progress: 0, stage: "Queued" };
    const record: JobRecord = { job, assets: new Map(), assetBytes: 0, pendingFixes: new Map() };
    records.set(job.id, record);
    pending.push(record);
    queueMicrotask(drain);
    return job;
  }

  function drain() {
    while (running < 2 && pending.length) {
      const record = pending.shift();
      if (!record) return;
      running += 1;
      void run(record).finally(() => {
        running -= 1;
        drain();
      });
    }
  }

  async function run(record: JobRecord) {
    const job: Job = { ...record.job, status: "running" };
    record.job = job;
    const context = auditContext(record);

    try {
      const { findings, fixes, ...summary } = await auditors[job.target.source](job.target, context.progress, context);
      record.fixes = fixes ?? new Map();
      const completed: CompletedJob = {
        ...job, status: "complete", progress: 100, stage: "Audit complete",
        result: {
          ...summary,
          findings: findings.map((item) => ({ ...item, fixAvailable: Boolean(fixes?.has(item.id)) })),
        },
      };
      await persist({ job: completed, fixes: record.fixes, assets: record.assets });
      record.job = completed;
    } catch (error) {
      if (!(error instanceof InputError)) console.error(error);
      record.assets.clear();
      record.assetBytes = 0;
      record.job = { ...job,
        status: "failed", stage: "Audit failed",
        error: error instanceof InputError ? error.message : "The audit could not finish. Please try again.",
      };
    }
  }

  async function fix(id: string, findingId: string): Promise<Fix | null> {
    const record = records.get(id);
    if (record?.job.status !== "complete" || record.removing || !record.fixes) return null;
    const { job, assets, fixes } = record;
    const item = job.result.findings.find((candidate) => candidate.id === findingId);
    if (!item) return null;
    const pending = record.pendingFixes.get(findingId);
    if (pending) return pending;
    if (item.fix) return item.fix;

    const recipe = fixes.get(findingId);
    if (!recipe) throw new InputError("A targeted fix is unavailable for this finding.");
    if (activeFixes >= 2) throw new InputError("The fix workers are busy. Try again in a moment.");
    activeFixes += 1;
    const request = Promise.resolve()
      .then<Fix>(() => "index" in recipe
        ? previewRepositoryFix(job.target, item, recipe)
        : previewWebsiteFix(job.target, item, recipe, auditContext(record)))
      .then(async (result) => {
        item.fix = result;
        await persist({ job, assets, fixes });
        return result;
      })
      .finally(() => {
        activeFixes -= 1;
        record.pendingFixes.delete(findingId);
      });
    record.pendingFixes.set(findingId, request);
    return request;
  }

  async function persist(record: SavedReport) {
    if (!store) return;
    try {
      await store.save(record);
    } catch (error) {
      console.warn(error instanceof Error ? error.message : error);
      const notes = record.job.result.notes ??= [];
      const warning = "The report could not be saved to disk.";
      if (!notes.includes(warning)) notes.push(warning);
    }
  }

  async function designSource(id: string) {
    const record = records.get(id);
    if (!record || record.job.status !== "complete" || record.job.target.source !== "website" || record.removing) {
      throw new InputError("The saved website report is unavailable.");
    }
    const job = record.job;
    if (job.result.designSource) return job.result.designSource;
    // Older reports contain only screenshots. Capture the element bounds and their matching pixels together.
    record.preparingSource ??= withBrowser(job.target, browser => withPage(browser, job.target.url, "desktop", async page => {
      const { width, height } = await inspectPage(page, "desktop");
      const bytes = await capturePage(page, { width, height });
      const url = auditContext(record).asset("redesign.jpg", bytes);
      const source = await captureDesignSource(page, { width, height }, url);
      job.result.designSource = source;
      await persist({ job, assets: record.assets, fixes: record.fixes ?? new Map() });
      return source;
    })).finally(() => { record.preparingSource = undefined; });
    return record.preparingSource;
  }

  async function remove(id: string) {
    const record = records.get(id);
    if (!record) return;
    if (record.job.status === "running" || record.job.status === "queued" || record.pendingFixes.size || record.preparingSource) {
      throw new InputError("This audit is still processing. Remove it after it finishes.");
    }
    // Block new fix writes until the snapshot has been removed, including during a concurrent retry.
    record.removing ??= Promise.resolve().then(async () => {
      await store?.remove(id);
      records.delete(id);
    }).finally(() => { record.removing = undefined; });
    await record.removing;
  }

  return {
    submit, fix, remove, designSource,
    get: (id: string) => records.get(id)?.job,
    asset: (id: string, name: string) => records.get(id)?.assets.get(name),
  };
}

function auditContext(record: JobRecord): AuditContext {
  const { job } = record;
  return {
    progress(progress, stage) {
      Object.assign(job, { progress, stage });
    },
    asset(name, bytes) {
      const size = record.assetBytes - (record.assets.get(name)?.byteLength ?? 0) + bytes.byteLength;
      if (size > 18 * 1024 * 1024) throw new InputError("This audit reached its screenshot storage limit.");
      record.assets.set(name, bytes);
      record.assetBytes = size;
      return `/api/audits/${job.id}/assets/${name}`;
    },
  };
}
