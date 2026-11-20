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
  editorial: {
    headline: "The first address on the web", purpose: "An archive guide to the first website and the tools people used to read it.",
    typography: "A serif headline sets the archival tone. Short section headings separate the original pages from the browser exhibit.",
    mobile: "Stack the two entries in reading order and size the page to the device.",
    changes: [{ observation: "The original list gives every link equal weight.", proposal: "Lead with the first website, then introduce the line-mode browser as a companion exhibit." }],
    paper: "#faf4e8", accent: "#7e3928", sections: [
      { label: "The website", heading: "Inside the World Wide Web project", copy: "The original pages introduce the project and explain how readers could find information through links." },
      { label: "The browser", heading: "Reading in line mode", copy: "Early readers could move through a document and follow numbered links using a keyboard." },
    ],
  },
  playful: {
    headline: "Pick your first click", purpose: "Explore the early web through two stops on a short tour.",
    typography: "Short action headings give each stop an obvious starting point.",
    mobile: "Place each stop on its own row with a large tap target.",
    changes: [{ observation: "A newcomer has to choose between unfamiliar destinations.", proposal: "Introduce each stop with a question and describe what the visitor will find there." }],
    paper: "#f5f8ee", accent: "#346b5e", sections: [
      { label: "Stop one", heading: "What was on the first website?", copy: "Start with the project page. Its links branch out into explanations, software and ways to get involved." },
      { label: "Stop two", heading: "What did browsing feel like?", copy: "Meet the line-mode browser and imagine navigating a page one numbered link at a time." },
    ],
  },
  minimal: {
    headline: "Web origins", purpose: "A compact directory for exploring the first website at CERN.",
    typography: "Keep the destination names prominent and use one short description per entry.",
    mobile: "Use a single fluid column with room between adjacent destinations.",
    changes: [{ observation: "Similar link labels take time to scan.", proposal: "Name each destination first and move its context into a separate line." }],
    paper: "#f5f6f5", accent: "#30455a", sections: [
      { label: "Site", heading: "First website", copy: "The original World Wide Web project pages, preserved at CERN." },
      { label: "Browser", heading: "Line-mode browser", copy: "A text-based way to explore how the web looked to its early readers." },
    ],
  },
};
