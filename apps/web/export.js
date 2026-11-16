import { button, element, request } from "./dom.js";

export function showExport(container, job, language, signal) {
  const path = `/api/audits/${job.id}/export`;
  const query = `?lang=${language}`;
  const status = element("p", "export-status");
  status.setAttribute("role", "status");
  const download = element("a", "button primary", "Download MP4");
  download.href = `${path}/file${query}`;
  download.download = `despecto-${language}.mp4`;
  download.hidden = true;
  const action = button("Export MP4", "button", () => {
    action.disabled = true;
    void follow("POST");
  });
  action.disabled = true;
  container.replaceChildren(action, download, status);
  container.hidden = false;
  void follow("GET");

  async function follow(method) {
    try {
      let state = await request(path + query, { method, signal });
      while (!signal.aborted && state.status === "rendering") {
        action.textContent = state.total ? `Rendering ${state.completed} of ${state.total} scenes` : "Preparing video…";
        action.disabled = true;
        await new Promise((resolve) => setTimeout(resolve, 700));
        if (!signal.aborted) state = await request(path + query, { signal });
      }
      if (signal.aborted) return;
      if (state.status === "complete") {
        action.hidden = true;
        download.hidden = false;
        status.textContent = state.narrated === 0 ? "Video includes captions."
          : state.narrated < state.total ? `Narration is available for ${state.narrated} of ${state.total} scenes.`
            : "Video includes captions and narration.";
      } else {
        status.textContent = state.error ?? "";
      }
    } catch (error) {
      if (!signal.aborted) status.textContent = error.message;
    } finally {
      if (!signal.aborted) {
        action.textContent = "Export MP4";
        action.disabled = false;
      }
    }
  }
}
