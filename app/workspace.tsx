"use client";

import { useEffect } from "react";

export function ClientWorkspace() {
  useEffect(() => { void import("../apps/web/app.ts"); }, []);
  return null;
}
