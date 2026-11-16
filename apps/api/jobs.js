import { randomUUID } from "node:crypto";
import { InputError, parseTarget } from "../../shared/target.js";
import { auditRepository } from "../../workers/repo-audit/index.js";

export function createQueue({
  auditors = { repo: (target, progress) => auditRepository(target, progress) },
  fixers = {},
} = {}) {
  const records = new Map();
  const pending = [];
  let running = 0;

  function submit(input) {
    const target = parseTarget(input);
    if (!auditors[target.source]) throw new InputError("Website audits are unavailable.");
    if (pending.length >= 8) throw new InputError("The audit queue is full. Try again in a moment.");
    if (records.size >= 20) {
      const oldest = [...records].find(([, record]) =>
        ["complete", "failed"].includes(record.job.status) && record.pendingFixes.size === 0);
      if (!oldest) throw new InputError("The audit queue is full. Try again in a moment.");
      records.delete(oldest[0]);
    }

    const job = { id: randomUUID(), target, status: "queued", progress: 0, stage: "Queued" };
    const record = { job, assets: new Map(), pendingFixes: new Map() };
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
    const context = {
      progress(progress, stage) {
        Object.assign(job, { progress, stage });
      },
      asset(name, bytes) {
        record.assets.set(name, bytes);
        return `/api/audits/${job.id}/assets/${name}`;
      },
    };
    record.context = context;

    try {
      const { findings, fixes, ...summary } = await auditors[job.target.source](job.target, context.progress, context);
      record.fixes = fixes ?? new Map();
      job.result = { ...summary, findings };
      Object.assign(job, { status: "complete", progress: 100, stage: "Audit complete" });
    } catch (error) {
      if (!(error instanceof InputError)) console.error(error);
      record.assets.clear();
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
    const request = Promise.resolve().then(() => fixer(record.job.target, item, recipe, record.context))
      .then((result) => (item.fix = result))
      .finally(() => record.pendingFixes.delete(findingId));
    record.pendingFixes.set(findingId, request);
    return request;
  }

  return {
    submit, fix,
    get: (id) => records.get(id)?.job,
    asset: (id, name) => records.get(id)?.assets.get(name),
  };
}
