"use client";

import { useEffect, useState, type ReactNode } from "react";

type BootState = "loading" | "leaving" | "ready" | "failed";

export function ClientWorkspace({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BootState>("loading");
  useEffect(() => {
    let mounted = true;
    void import("../apps/web/app.ts").then(() => {
      if (mounted) setStatus(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "ready" : "leaving");
    }, () => { if (mounted) setStatus("failed"); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (status !== "leaving") return;
    // Release the overlay even when the browser skips its exit animation in a background tab.
    const timeout = window.setTimeout(() => setStatus("ready"), 750);
    return () => window.clearTimeout(timeout);
  }, [status]);

  return (
    <>
      <div className="app-content" inert={status === "loading"}>{children}</div>
      {(status === "loading" || status === "leaving") && (
        <div className="boot-curtain" data-state={status} role="status"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && status === "leaving") setStatus("ready");
          }}>
          <div className="boot-note">
            <div className="boot-scene" aria-hidden="true">
              <span className="clue-trail"><i /><i /><i /></span>
              <img className="boot-folder" src="/case-folder.svg" alt="" width={64} height={64} />
              <img className="boot-beetle" src="/inspector.svg" alt="" width={153} height={121} />
            </div>
            <p>Opening the audit desk<span aria-hidden="true">…</span></p>
          </div>
        </div>
      )}
      {status === "failed" && <p className="workspace-error" role="alert">The workspace couldn’t load. <a href="/">Reload DeSpecto</a></p>}
    </>
  );
}
