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
    assert.ok(speechConfigured(), "Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.");
    const audio = await synthesize({ language, caption });
    const mp3 = audio?.subarray(0, 3).toString() === "ID3" || (audio?.[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
    assert.ok(audio?.length > 1000 && mp3, "The provider did not return an MP3 scene.");
  }]),
];

for (const [name, check] of checks) {
  try {
    await check();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name} · ${error.message}`);
    process.exitCode = 1;
  }
}
