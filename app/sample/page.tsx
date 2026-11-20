"use client";

import { useEffect, useRef } from "react";
import { showReport } from "../../apps/web/report";
import { completedJobSchema } from "../../shared/contracts";
import { SiteHeader } from "../site-header";
import { designs, recording } from "./preview";
import report from "./report.json";

const job = completedJobSchema.parse(report);

export default function SampleAudit() {
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    if (container.current) {
      return showReport(container.current, job, () => window.location.assign("/"), { designs, recording });
    }
  }, []);
  return <><SiteHeader /><main ref={container} className="workspace"><p>Opening sample audit…</p></main></>;
}
