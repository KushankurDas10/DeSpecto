import type { Recording } from "../../apps/web/walkthrough";
import type { DesignPresets } from "../../shared/contracts";
import report from "./report.json";

const finding = report.result.findings[0];
export const recording: Recording = {
  language: "en",
  media: { video: "/sample/walkthrough.mp4", download: "/sample/walkthrough.mp4", captions: "/sample/captions.vtt" },
  cut: {
    status: "complete", revision: "cern-viewport", completed: 3, total: 3, narrated: 3, duration: 27.625,
    chapters: [
      { title: "Audit overview", kind: "overview", start: 0, duration: 7.958 },
      { title: finding.title, kind: "finding", findingId: finding.id, start: 7.958, duration: 12.459 },
      { title: "Fix preview · " + finding.title, kind: "comparison", findingId: finding.id, start: 20.417, duration: 7.208 },
    ],
  },
};

export const designs: DesignPresets = {
  editorial: { paper: "#f1e4c9", accent: "#7e3928", rationale: "Set the archive title as a masthead and lead into the original CERN destinations.", sections: [] },
  playful: { paper: "#c6a6ef", accent: "#ffb736", rationale: "Turn the original destinations into tactile links under the archive title.", sections: [] },
  minimal: { paper: "#f5f6f5", accent: "#30455a", rationale: "Use a compact index so each original destination is easy to scan.", sections: [] },
};
