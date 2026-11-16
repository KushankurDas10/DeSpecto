import { randomUUID } from "node:crypto";
import { InputError, parseTarget } from "../../shared/target.js";
import { auditRepository } from "../../workers/repo-audit/index.js";
import { maxReports } from "./reports.js";

export function createQueue({
  auditors = { repo: (target, progress) => auditRepository(target, progress) },
  fixers = {},
  store,
} = {}) {
  const records = new Map((store?.records ?? []).map((record) => [record.job.id, {
    ...record,
    assetBytes: [...record.assets.values()].reduce((total, bytes) => total + bytes.byteLength, 0),
    pendingFixes: new Map(),
  }]));
  const pending = [];
  let running = 0;
  let activeFixes = 0;

  function submit(input) {
    const target = parseTarget(input);
    if (!auditors[target.source]) throw new InputError("Website audits are unavailable.");
    if (pending.length >= 8) throw new InputError("The audit queue is full. Try again in a moment.");
    if (records.size >= maxReports) {
      const oldest = [...records].find(([, record]) =>
        ["complete", "failed"].includes(record.job.status) && record.pendingFixes.size === 0);
      if (!oldest) throw new InputError("The audit queue is full. Try again in a moment.");
      records.delete(oldest[0]);
      void store?.remove(oldest[0]).catch((error) => console.warn(error.message));
    }

    const job = { id: randomUUID(), createdAt: new Date().toISOString(), target, status: "queued", progress: 0, stage: "Queued" };
    const record = { job, assets: new Map(), assetBytes: 0, pendingFixes: new Map() };
    records.set(job.id, record);
    pending.push(record);
    queueMicrotask(drain);
    return job;
  }

  function drain() {
    while (running < 2 && pending.length) {
      const record = pending.shift();
      running += 1;
      void run(record).finally(() => {
        running -= 1;
        drain();
      });
    }
  }

  async function run(record) {
    const { job } = record;
    job.status = "running";
    const context = auditContext(record);

    try {
      const { findings, fixes, ...summary } = await auditors[job.target.source](job.target, context.progress, context);
      record.fixes = fixes ?? new Map();
      const completed = {
        ...job, status: "complete", progress: 100, stage: "Audit complete",
        result: {
          ...summary,
          findings: findings.map((item) => ({ ...item, fixAvailable: Boolean(fixers[item.source] && record.fixes.has(item.id)) })),
        },
      };
      await persist({ ...record, job: completed });
      Object.assign(job, completed);
    } catch (error) {
      if (!(error instanceof InputError)) console.error(error);
      record.assets.clear();
      record.assetBytes = 0;
      Object.assign(job, {
        status: "failed", stage: "Audit failed",
        error: error instanceof InputError ? error.message : "The audit could not finish. Please try again.",
      });
    }
  }

  async function fix(id, findingId) {
    const record = records.get(id);
    const item = record?.job.result?.findings.find((candidate) => candidate.id === findingId);
    if (!item) return null;
    if (item.fix) return item.fix;
    if (record.pendingFixes.has(findingId)) return record.pendingFixes.get(findingId);

    const recipe = record.fixes.get(findingId);
    const fixer = fixers[item.source];
    if (!recipe || !fixer) throw new InputError("A targeted fix is unavailable for this finding.");
    if (activeFixes >= 2) throw new InputError("The fix workers are busy. Try again in a moment.");
    activeFixes += 1;
    const request = Promise.resolve().then(() => fixer(record.job.target, item, recipe, auditContext(record)))
      .then(async (result) => {
        item.fix = result;
        await persist(record);
        return result;
      })
      .finally(() => {
        activeFixes -= 1;
        record.pendingFixes.delete(findingId);
      });
    record.pendingFixes.set(findingId, request);
    return request;
  }

  async function persist(record) {
    if (!store) return;
    try {
      await store.save(record);
    } catch (error) {
      console.warn(error.message);
      const notes = record.job.result.notes ??= [];
      const warning = "The report could not be saved to disk.";
      if (!notes.includes(warning)) notes.push(warning);
    }
  }

  return {
    submit, fix,
    get: (id) => records.get(id)?.job,
    asset: (id, name) => records.get(id)?.assets.get(name),
  };
}

function auditContext(record) {
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
