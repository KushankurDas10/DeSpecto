# DeSpecto

DeSpecto audits a public website or GitHub repository and turns its findings into a chaptered video. A website finding opens on the desktop or phone screenshot where the issue appeared. A repository finding links to the relevant lines at the exact commit that was audited.

## Try the hackathon demo

Start DeSpecto locally, then choose **Watch sample audit** on the home page. The bundled CERN audit includes its screenshots, a verified fix, captions, and an English recording. It works without provider keys or a local video render.

1. Play the walkthrough and jump to **Missing mobile viewport setting**. The recording shows how small the original page appeared on a phone.
2. Open **Findings** and compare the original capture with the verified viewport fix.
3. Open **Redesign studio** and choose **Playful**, **Editorial**, or **Minimal**. The sample keeps CERN’s original link labels and destinations.
4. Return to the workspace to inspect a public URL of your own, or use **Inspect lit/lit** to try a repository audit.

## Run locally

Use Node.js 22.9 or newer, npm, and Git. Run these commands in a terminal.

```sh
git clone https://github.com/KushankurDas10/DeSpecto.git
cd DeSpecto
npm ci
npx playwright install chromium
npm start
```

Open the [local workspace](http://127.0.0.1:3000). The recorded demo is also available directly at [/sample](http://127.0.0.1:3000/sample). To render new MP4s, install FFmpeg with an H.264 encoder and put it on your PATH, or set `FFMPEG_PATH` to its executable before starting DeSpecto.

For a production run, use `npm run build` followed by `npm run start:production`. Run one Node process so audit polling and video requests reach the process that owns the job. The server binds to `127.0.0.1:3000` by default. Set `HOST` or `PORT` to override it.

## What you can inspect

| Workflow | What DeSpecto does |
| --- | --- |
| Website audit | Opens the public page in Chromium at desktop and mobile sizes, scrolls to load lazy content, and captures up to 12,000 pixels of page height. Checks include horizontal overflow, missing viewport settings, image descriptions, form labels, and text contrast on solid backgrounds. Optional visual review examines the top of each capture. |
| Repository audit | Reads a bounded set of files from the default branch using Git. Checks README links, documented package commands in their working directory, missing script entry points, and missing root READMEs for runnable packages. The submitted project’s code is never executed. |
| Fix preview | **Show fix** re-renders supported website changes and reruns the original check. A broken README link with a unique replacement can produce a downloadable patch. You decide whether to apply the change to the original project. |
| Redesign studio | Reuses captured headings, copy, image regions, and link destinations. The model can arrange sections and choose colors within the selected direction. If model guidance is unavailable, the studio can still render a theme from the captured content. The preview does not reproduce the original site’s custom scripts. |
| Walkthrough | Select a narration language and choose **Create walkthrough**. Seek by chapter, adjust playback speed, toggle captions, or download the MP4. Where available, **Show fix** in the chapter list adds a before-and-after comparison to the cut. |

## Configure live review and narration

Copy [.env.example](.env.example) to `.env` in the repository root, enter the values you need, and restart the server. The built-in checks and recorded sample work without credentials. Keep the populated file local.

| Setting | Purpose |
| --- | --- |
| `AI_BASE_URL` | Chat completions base URL. The example uses OpenRouter. |
| `AI_API_KEY` | Provider credential. [Create an OpenRouter key](https://openrouter.ai/settings/keys). |
| `AI_MODEL` | Text model ID available to your provider account. |
| `AI_VISION_MODEL` | Image-capable model ID for visual review and studio guidance. |
| `GEMINI_API_KEY` | Server-side narration credential. [Create a Gemini key in Google AI Studio](https://aistudio.google.com/api-keys). |
| `GEMINI_TTS_MODEL` | Speech model ID. The configured default is in [.env.example](.env.example). |

Gemini uses Charon for English, Kore for Hindi, and Sulafat for Telugu. If narration is unavailable, the player indicates which chapters rely on captions. For a compatible MP3 speech service, configure `TTS_BASE_URL`, `TTS_MODEL`, and optionally `TTS_API_KEY` and `TTS_VOICE`. A configured Gemini key takes precedence.

## Storage and verification

Completed reports, screenshots, and saved fix previews persist in `.despecto/`. Set `REPORT_DIR` to use a different directory. The server retains up to 20 reports and keeps recent video renders in memory. **Remove** in audit history deletes a saved audit after confirmation.

| Command | What it checks |
| --- | --- |
| `npm run typecheck` | Strict TypeScript across the app and workers. |
| `npm run build` | The Next.js production build. |
| `npm run evaluate` | The repository fixture and live baseline across 10 public repositories and 5 websites. Requires Git, Chromium, and network access. |
| `npm run check:providers -- --speech` | Live narration in English, Hindi, and Telugu. |
| `npm run check:providers` | Live text, image, and speech responses. Calls the configured providers. |

The sample shares the report, player, and studio components with live audits. When a redesign changes what the sample demonstrates, update its saved data in `app/sample/` and its media in `public/sample/` together.
