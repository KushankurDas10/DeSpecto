# DeSpecto

DeSpecto performs automated, evidence-driven audits of public GitHub repositories and live websites. Repository findings correlate directly with exact source lines at the audited commit, while website findings precisely pinpoint browser-measured regions across desktop and mobile captures. Every audit features an interactive narrated walkthrough available in English, Hindi, or Telugu.

## Run locally

Ensure Node.js 22.9 or newer and Git are installed, then execute:

```sh
npm ci
npx playwright install chromium
npm start
```

Navigate to [http://127.0.0.1:3000](http://127.0.0.1:3000). The workspace includes curated public examples for both audit types. Selecting the website example demonstrates an interactive mobile layout remediation through **Show fix**.

## What the checks cover

- **Repository** · Evaluates relative README links, verifies documented package commands within their designated working directories, and inspects script entry points. It detects absent root README files across runnable packages. Git queries a strictly bounded set of files from the default branch without ever checking out or executing submitted code.
- **Website** · Traverses public pages to ensure lazy-loaded assets resolve, capturing comprehensive desktop and mobile screenshots up to 12,000 pixels in height. Automated evaluations assess horizontal layout overflow, mobile viewport configurations, document titles, image descriptions, accessible form labels, and WCAG text contrast over solid backgrounds. An optional AI review further evaluates visual layout and occlusion at the fold.
- **Fix previews** · Generates a downloadable unified diff patch whenever a broken README link has an unambiguous target. For websites, it dynamically injects and re-renders compatible DOM corrections, instantly rechecking the criteria against the preview. All preview transformations remain contained entirely within DeSpecto.

Generated audit reports, fix previews, and visual evidence persist across server restarts within the git-ignored `.despecto/` directory. The server maintains a sliding window of up to 20 audits. Configure `REPORT_DIR` to designate an alternative storage path.

## AI review and narration

Create a local `.env` file at the repository root. For intelligent visual and text review, obtain an [OpenRouter API key](https://openrouter.ai/settings/keys) provisioned with credit for [Qwen3.6](https://openrouter.ai/qwen/qwen3.6-35b-a3b). For voice narration, generate a [Gemini API key](https://aistudio.google.com/api-keys) via Google AI Studio. Gemini 3.8 Flash TTS seamlessly articulates English, Hindi, and Telugu within the [Gemini free tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts), subject to standard project quotas.

```dotenv
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=your_openrouter_key
AI_MODEL=qwen/qwen3.6-35b-a3b
AI_VISION_MODEL=qwen/qwen3.6-35b-a3b
GEMINI_API_KEY=your_google_ai_studio_key
```

Run `npm run check:providers -- --speech` to test narration isolation. Run `npm run check:providers` to comprehensively validate text, vision, and speech integrations. These utilities dispatch concise validation requests to verify connectivity. Restart DeSpecto whenever changes are made to `.env`.

Text and vision evaluations are compatible with any OpenAI-compliant chat completions endpoint specified via `AI_BASE_URL`. Alternatively, an OpenAI-compatible MP3 speech endpoint can be integrated by supplying `TTS_BASE_URL`, `TTS_MODEL`, and `TTS_API_KEY` instead of `GEMINI_API_KEY`. Customize regional voice assignments with `TTS_VOICE_EN`, `TTS_VOICE_HI`, or `TTS_VOICE_TE` (defaulting to `Charon` under Gemini).

Core heuristic audits and closed captions operate entirely without third-party credentials. Modern browsers can synthesize spoken captions natively when supported system voices exist for the selected locale.

## Download a walkthrough

Ensure FFmpeg is compiled with H.264 support and accessible on your system `PATH`, or explicitly define `FFMPEG_PATH` pointing to the executable. After restarting DeSpecto, navigate to an audit's **Walkthrough** tab and select your preferred narration language. The camera and spotlight smoothly pan and track across each flagged item as the narration unfolds. Selecting **Show fix** on an eligible finding inserts an animated before-and-after scene directly into the timeline. Selecting **Export MP4** compiles these synchronized movements, caption tracks, and synthesized voiceovers into a standalone video. The server caches recent exports for immediate playback.

## Level 1 verification

Execute `npm run evaluate` to run the baseline verification suite. The evaluation suite rigorously benchmarks across 10 public GitHub repositories and 5 public websites—validating screenshot bounding boxes, confirming that contrasting W3C accessibility demos yield distinct findings, re-auditing live layout remediations, and asserting that Git cleanly applies generated README patches. Provider checks run independently via `npm run check:providers`.

For an interactive demonstration, audit the sample GitHub repository and navigate directly to a finding's highlighted source line. Next, audit the sample website, open **Walkthrough**, switch narration to Telugu, and select **Show fix** on the mobile viewport finding to view a side-by-side comparison of the initial layout against the verified preview.
