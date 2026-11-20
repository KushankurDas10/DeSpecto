import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const development = process.env.NODE_ENV === "development";
  const styleSources = "'self' https://fonts.googleapis.com";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ""}`,
    "img-src 'self'",
    `style-src ${styleSources}`,
    // The Next.js development overlay inserts style elements without the request nonce.
    ...(development ? [`style-src-elem ${styleSources} 'unsafe-inline'`] : []),
    `font-src https://fonts.gstatic.com${development ? " 'self'" : ""}`,
    "frame-src https: http:",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  // Next reads the request policy to apply its nonce to bootstrap scripts.
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = { matcher: "/" };
