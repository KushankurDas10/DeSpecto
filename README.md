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

## What the checks cover

- **Repository** · Checks local README links, documented package scripts, and package script entry points. Git reads a bounded set of files from the default branch without checking out or running submitted code.
- **Website** · Captures the first desktop and mobile viewports and checks horizontal overflow, viewport settings, page titles, image descriptions, and form labels.
- **Fix previews** · Provides a diff when a broken README link has a unique replacement. Re-renders compatible website changes and reruns the check against the preview. Preview changes stay inside DeSpecto.

Jobs and evidence are held in memory. The server keeps up to 20 reports, and restarting it clears them.

## Optional model and voice

Set the variables in a local `.env` file or in the environment. The core checks work without external API credentials.

| Variable | Purpose |
| --- | --- |
| `AI_BASE_URL` | OpenAI-compatible API base with a `/chat/completions` endpoint, typically ending in `/v1` |
| `AI_MODEL` | Text model for source review and translation of additional findings |
| `AI_VISION_MODEL` | Model that accepts screenshot input for visual review |
| `AI_API_KEY` | API key for the model provider |
| `TTS_BASE_URL` and `TTS_MODEL` | Optional speech provider with an `/audio/speech` endpoint that returns MP3 |
| `TTS_API_KEY` | API key for the speech provider |
| `TTS_VOICE` | Default provider voice, falling back to `alloy` |
| `TTS_VOICE_EN`, `TTS_VOICE_HI`, `TTS_VOICE_TE` | Optional per-language voices |

Built-in findings have local captions in all three languages. If a speech provider is unavailable, the walkthrough uses an installed browser voice when possible and displays captions in every scene.
