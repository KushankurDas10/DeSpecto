import { chromium } from "playwright";
import { InputError } from "../../shared/target.js";
import { publicAddress, startAuditProxy } from "./network.js";

export const viewports = Object.freeze({
  desktop: { viewport: { width: 1440, height: 960 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
});

export async function withBrowser(target, inspect) {
  try {
    await publicAddress(new URL(target.url).hostname);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("The website hostname could not be resolved.");
  }

  const proxy = await startAuditProxy();
  let browser;
  let deadline;
  try {
    try {
      browser = await chromium.launch({
        timeout: 15000,
        chromiumSandbox: true,
        ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
        proxy: { server: proxy.url, bypass: "<-loopback>" },
        args: [
          "--disable-quic",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
        ],
      });
    } catch (error) {
      if (error.message.includes("Executable doesn't exist")) {
        throw new InputError("Install Chromium with npx playwright install chromium.");
      }
      throw error;
    }
    const timeout = new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new InputError("The website audit browser timed out.")), 95000);
    });
    return await Promise.race([inspect(browser), timeout]);
  } finally {
    clearTimeout(deadline);
    try {
      await browser?.close();
    } finally {
      await proxy.close();
    }
  }
}

export async function withPage(browser, url, view, inspect) {
  const context = await browser.newContext({
    ...viewports[view], serviceWorkers: "block", deviceScaleFactor: 1, acceptDownloads: false,
  });
  try {
    await context.route("**/*", (route) => {
      const request = route.request();
      return ["GET", "HEAD"].includes(request.method()) && /^https?:\/\//.test(request.url())
        ? route.continue()
        : route.abort();
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    let response;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 14000 });
    } catch {
      throw new InputError("The website could not be loaded in the audit browser.");
    }
    if (!response?.ok()) {
      throw new InputError(`The website returned HTTP ${response?.status() ?? "unknown"}.`);
    }
    await page.waitForLoadState("load", { timeout: 3000 }).catch(() => {});
    return await inspect(page);
  } finally {
    await context.close();
  }
}

export function capturePage(page) {
  return page.screenshot({ animations: "disabled", caret: "hide", timeout: 8000 });
}
