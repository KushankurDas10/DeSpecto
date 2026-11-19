"use client";

import { useEffect, useState } from "react";

export function ClientWorkspace() {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    void import("../apps/web/app.ts").then(() => setStatus("ready"), () => setStatus("failed"));
  }, []);
  if (status === "ready") return null;
  if (status === "failed") return <p className="workspace-error" role="alert">The workspace couldn’t load. <a href="/">Reload DeSpecto</a></p>;
  return <div className="boot-meter" role="status" aria-label="Loading the audit workspace"><span /></div>;
}
