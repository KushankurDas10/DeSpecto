import type { Browser, Page, Request } from "playwright";
import type { Size, Target, View } from "../../shared/contracts.ts";
import { chromium } from "playwright";
import { InputError } from "../../shared/target.ts";
import { publicAddress, startAuditProxy } from "./network.ts";

export const viewports = Object.freeze({
  desktop: { viewport: { width: 1440, height: 960 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
});
const dataRequests = new WeakMap<Page, Set<Request>>();
export const maxCaptureHeight = 12000;

export async function withBrowser<T>(target: Target, inspect: (browser: Browser) => Promise<T>): Promise<T> {
  try {
    await publicAddress(new URL(target.url).hostname);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("The website hostname could not be resolved.");
  }

  const proxy = await startAuditProxy();
  let browser: Browser | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
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
      if (error instanceof Error && error.message.includes("Executable doesn't exist")) {
        throw new InputError("Install Chromium with npx playwright install chromium.");
      }
      throw error;
    }
    const timeout = new Promise<never>((_, reject) => {
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

export async function withPage<T>(browser: Browser, url: string, view: View, inspect: (page: Page) => Promise<T>): Promise<T> {
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
    const pending = new Set<Request>();
    dataRequests.set(page, pending);
    page.on("request", request => {
      if (["xhr", "fetch"].includes(request.resourceType()) && new URL(request.url()).origin === new URL(page.url()).origin) pending.add(request);
    });
    page.on("requestfinished", request => pending.delete(request));
    page.on("requestfailed", request => pending.delete(request));
    let response;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 14000 });
    } catch {
      throw new InputError("The website could not be loaded in the audit browser.");
    }
    if (!response?.ok()) {
      throw new InputError(`The website returned HTTP ${response?.status() ?? "unknown"}.`);
    }
    await settlePage(page);
    return await inspect(page);
  } finally {
    await context.close();
  }
}

export async function settlePage(page: Page) {
  try {
    await page.waitForLoadState("load", { timeout: 12000 });
    await waitForContent(page);
    // Recalculate the bottom after each scroll because lazy sections can extend the document.
    for (let step = 0; step < 20; step++) {
      const moved = await page.evaluate(limit => {
        const top = Math.min(scrollY + innerHeight * .8, Math.min(document.documentElement.scrollHeight, limit) - innerHeight);
        if (top <= scrollY + 1) return false;
        window.scrollTo({ top, behavior: "instant" });
        return true;
      }, maxCaptureHeight);
      if (!moved) break;
      await page.waitForTimeout(160);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await waitForContent(page);
    await page.waitForFunction(async limit => {
      const relevant = [...document.images].filter(img => {
        const rect = img.getBoundingClientRect();
        return rect.width && rect.height && rect.top < limit && (img.currentSrc || img.getAttribute("src"));
      });
      if (document.fonts.status !== "loaded" || relevant.some(img => !img.complete)) return false;
      await Promise.allSettled(relevant.filter(img => img.naturalWidth).map(img => img.decode()));
      return true;
    }, maxCaptureHeight, { timeout: 8000 });
    await waitForContent(page);
  } catch {
    throw new InputError("The page did not finish loading within the capture window. Try the audit again.");
  }
}

async function waitForContent(page: Page) {
  let previous = "";
  let quietSince = 0;
  const deadline = Date.now() + 9500;
  while (Date.now() < deadline) {
    const signature = dataRequests.get(page)?.size ? "" : await page.evaluate(() => {
      const body = document.body;
      if (!body) return "";
      const blockers = document.querySelectorAll('[aria-busy="true"], [role="progressbar"], .preloader, #preloader, .loading-overlay, .boot-curtain');
      for (const el of blockers) {
        const r = el.getBoundingClientRect();
        if (r.width >= innerWidth * .6 && r.height >= innerHeight * .4 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return "";
      }
      const text = body.innerText.trim();
      if (/^(?:loading|please wait|initializing)(?:[. …!]+)?$/i.test(text)) return "";
      if (!text && !body.querySelector("img,svg,canvas,video,iframe,input,button")) return "";
      const heading = document.querySelector("main h1,h1");
      return [document.documentElement.scrollHeight, text.length, document.images.length, heading?.getBoundingClientRect().top].join("|");
    });
    if (signature && signature === previous && Date.now() - quietSince >= 650) return;
    if (!signature || signature !== previous) quietSince = Date.now();
    previous = signature;
    await page.waitForTimeout(180);
  }
  throw new InputError("The page is still loading.");
}

export function capturePage(page: Page, { width, height }: Size) {
  return page.screenshot({
    type: "jpeg", quality: 80, fullPage: true, clip: { x: 0, y: 0, width, height },
    scale: "css", caret: "hide", timeout: 10000,
  });
}
