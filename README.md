# DeSpecto

DeSpecto checks public GitHub repositories and websites. Repository findings link to source lines at the audited commit. Website findings point to browser-measured regions in desktop or mobile screenshots. Each audit has a walkthrough in English, Hindi, or Telugu.

## Run locally

Install Node.js 22.9 or newer and Git, then run:

```sh
npm ci
npx playwright install chromium
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The workspace includes public examples for both audit types. The website example can demonstrate a mobile layout fix using **Show fix**.

`npm start` runs the Next.js development server. For a production build, run `npm run build` and then `npm run start:production`. Use one Node process for the audit queue.

## What the checks cover

- **Repository** · Checks relative README links, package commands in their documented working directory, and script entry points. It flags missing root READMEs for runnable packages. Git reads a bounded set of files from the default branch without checking out or running submitted code.
- **Website** · Scrolls through public pages to load lazy content, then captures desktop and mobile screenshots up to 12,000 pixels tall. Checks include overflow, viewport settings, page titles, image descriptions, form labels, and text contrast on solid backgrounds. Optional AI review inspects the top of each capture.
- **Fix previews** · Provides a downloadable patch when a broken README link has a unique replacement. Re-renders compatible website changes and reruns the check against the preview. Preview changes stay inside DeSpecto.

Completed reports, fix previews, and screenshots are saved in the ignored `.despecto/` directory and survive server restarts. The server keeps up to 20 reports. Set `REPORT_DIR` to use a different local directory.

## AI review and narration

Copy `.env.example` to `.env` at the repository root. For AI review, get an [OpenRouter API key](https://openrouter.ai/settings/keys) with credit for [Qwen3.6](https://openrouter.ai/qwen/qwen3.6-35b-a3b). For narration, get a [Gemini API key](https://aistudio.google.com/api-keys) in Google AI Studio. Gemini 3.8 Flash TTS supports English, Hindi, and Telugu on the [Gemini free tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts), subject to project limits.

```dotenv
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=your_openrouter_key
AI_MODEL=qwen/qwen3.6-35b-a3b
AI_VISION_MODEL=qwen/qwen3.6-35b-a3b
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_TTS_MODEL=gemini-3.8-flash-tts
```

Run `npm run check:providers -- --speech` to verify narration alone. Run `npm run check:providers` to also verify text and image review. These commands send short requests to the configured providers. Restart the app after changing `.env`.

The text and vision models can use another compatible chat completions API through `AI_BASE_URL`. For an OpenAI-compatible MP3 speech endpoint, set `TTS_BASE_URL`, `TTS_MODEL`, and `TTS_API_KEY` in place of `GEMINI_API_KEY`. Gemini uses Charon for English, Kore for Hindi, and Sulafat for Telugu throughout the walkthrough. Compatible speech endpoints use the single `TTS_VOICE` preset configured on the server.

Built-in checks and captions work without credentials. The browser can speak captions when it has an installed voice for the selected language.

## Download a walkthrough

Install FFmpeg with H.264 support and make it available on `PATH`, or set `FFMPEG_PATH` to its executable. Restart DeSpecto, open an audit’s **Walkthrough** tab, select a language, then choose **Create walkthrough**. Use the chapter list to jump to a finding. **Show fix** adds the before-and-after comparison next to the finding in the cut. **Download MP4** saves the same video with its caption track and chapter markers. Recently rendered videos stay in server memory.

## Level 1 verification

Run `npm run evaluate` for the built-in baseline. The suite completed on 10 public GitHub repositories and 5 public websites. It checked screenshot coordinates, confirmed that the W3C accessibility examples produced different image findings, rechecked the demo website's fix, and verified that Git accepts a generated README patch. Provider checks run separately through `npm run check:providers`.

For the demo, audit the GitHub example and open a finding's source link. Audit the website example, open **Walkthrough**, select Telugu, then return to the finding and choose **Show fix** to compare the original mobile viewport against the rechecked preview.

The home page’s **Watch sample audit** opens a recorded CERN audit in the shared report, player and redesign studio. Keep the sample in sync with every audit redesign. Refresh its saved evidence, design examples and recording whenever the illustrated finding or walkthrough changes.
