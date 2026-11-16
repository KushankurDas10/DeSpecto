import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { deserialize, serialize } from "node:v8";

export const maxReports = 20;
const maxReportBytes = 24 * 1024 * 1024;
const reportName = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.audit$/;

export async function openReportStore(path) {
  const directory = resolve(path);
  await mkdir(directory, { recursive: true });
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && reportName.test(entry.name));
  const files = (await Promise.all(entries.map(async ({ name }) => {
    const file = join(directory, name);
    const metadata = await stat(file).catch(() => null);
    return metadata && { file, name, metadata };
  }))).filter(Boolean).sort((left, right) => right.metadata.mtimeMs - left.metadata.mtimeMs);

  const records = [];
  for (const { file, name, metadata } of files) {
    if (records.length >= maxReports) {
      await removeFile(file).catch(warn);
      continue;
    }
    if (metadata.size > maxReportBytes) continue;
    try {
      const saved = deserialize(await readFile(file));
      if (!validRecord(saved, name)) continue;
      records.push(saved.record);
    } catch {
      console.warn(`Skipping unreadable DeSpecto report ${name}.`);
    }
  }
  records.sort((left, right) => left.job.createdAt.localeCompare(right.job.createdAt));

  const pending = new Map();

  function serializeWrite(id, callback) {
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

function validRecord(saved, name) {
  const record = saved?.record;
  return saved?.format === 1 && record?.job?.status === "complete"
    && name === `${record.job.id}.audit` && typeof record.job.createdAt === "string"
    && Array.isArray(record.job.result?.findings) && record.fixes instanceof Map && record.assets instanceof Map
    && [...record.assets.values()].every(Buffer.isBuffer);
}

async function removeFile(file) {
  try {
    await unlink(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function warn(error) {
  console.warn(`DeSpecto report storage: ${error.message}`);
}
