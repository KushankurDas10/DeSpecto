import assert from "node:assert/strict";
import { chromium } from "playwright";
import { askModel, modelConfigured } from "../models/client.js";
import { speechConfigured, synthesize } from "../video/speech.js";

const captions = {
  en: "The repository audit is complete.",
  hi: "वेबसाइट का ऑडिट पूरा हो गया है।",
  te: "వెబ్‌సైట్ ఆడిట్ పూర్తయింది.",
};

const checks = [
  ["AI text", async () => {
    assert.ok(modelConfigured(), "Set AI_BASE_URL and AI_MODEL.");
    const result = await askModel('Read the given label and return only a JSON object with a "label" property.', "DeSpecto");
    assert.equal(result?.label, "DeSpecto", "The provider did not return the expected label.");
  }],
  ["AI vision", async () => {
    assert.ok(modelConfigured(true), "Set AI_BASE_URL and AI_VISION_MODEL.");
    const browser = await chromium.launch({ chromiumSandbox: true });
    try {
      const page = await browser.newPage({ viewport: { width: 400, height: 220 } });
      await page.setContent('<main style="font: bold 60px system-ui; margin: 25px">DeSpecto</main>');
      const image = await page.screenshot();
      const result = await askModel('Read the word shown in the image. Return only JSON with a "label" property.', [
        { type: "image_url", image_url: { url: `data:image/png;base64,${image.toString("base64")}` } },
      ], { vision: true });
      assert.equal(result?.label?.toLowerCase(), "despecto", "The provider did not recognize the screenshot text.");
    } finally {
      await browser.close();
    }
  }],
  ...Object.entries(captions).map(([language, caption]) => [`Speech ${language}`, async () => {
    assert.ok(speechConfigured(), "Set GEMINI_API_KEY.");
    const { bytes, contentType } = await synthesize({ language, caption });
    const wav = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE";
    const mp3 = bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    assert.ok(bytes.length > 1000 && (contentType === "audio/wav" ? wav : mp3), "The provider did not return playable narration.");
  }]),
];

const selected = process.argv.includes("--speech") ? checks.slice(2) : checks;
for (const [name, check] of selected) {
  try {
    await check();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name} · ${error.message}`);
    process.exitCode = 1;
  }
}
