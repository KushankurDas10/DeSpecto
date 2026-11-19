import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../apps/web/style.css";

export const metadata: Metadata = { title: "DeSpecto — Audit workspace" };
export const viewport: Viewport = { themeColor: "#f7f8f2" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
