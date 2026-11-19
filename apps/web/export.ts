import { exportStateSchema, type CompletedJob, type ExportState, type Language } from "../../shared/contracts.ts";
import { request } from "./dom.ts";

export function videoExport(job: CompletedJob, language: Language) {
  const path = "/api/audits/" + job.id + "/export";
  const query = new URLSearchParams({ lang: language });
  return {
    async follow(method: "GET" | "POST", signal: AbortSignal, update: (state: ExportState) => void) {
      let state = await request(path + "?" + query, exportStateSchema, { method, signal });
      while (!signal.aborted) {
        update(state);
        if (state.status !== "rendering") return;
        await new Promise((resolve) => setTimeout(resolve, 900));
        signal.throwIfAborted();
        state = await request(path + "?" + query, exportStateSchema, { signal });
      }
    },
    media(revision: string) {
      const params = new URLSearchParams(query);
      params.set("revision", revision);
      const file = path + "/file?" + params;
      return { video: file + "&play=1", download: file, captions: path + "/captions?" + params };
    },
  };
}
