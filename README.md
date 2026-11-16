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

- **Repository** · Checks relative README links, package commands in their documented working directory, and script entry points. It flags missing root READMEs for runnable packages. Git reads a bounded set of files from the default branch without checking out or running submitted code.
- **Website** · Captures the first desktop and mobile viewports and checks horizontal overflow, viewport settings, page titles, image descriptions, and form labels.
- **Fix previews** · Provides a downloadable patch when a broken README link has a unique replacement. Re-renders compatible website changes and reruns the check against the preview. Preview changes stay inside DeSpecto.

Jobs and evidence are held in memory. The server keeps up to 20 reports, and restarting it clears them.

## AI review and narration

Create a local `.env` at the repository root. Get an [OpenRouter API key](https://openrouter.ai/settings/keys) with credit for [Qwen3.6](https://openrouter.ai/qwen/qwen3.6-35b-a3b). Create an [Azure Speech resource](https://learn.microsoft.com/azure/ai-services/speech-service/get-started-text-to-speech?pivots=programming-language-rest) and copy either key and the region from its **Keys and Endpoint** page.

```dotenv
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=your_openrouter_key
AI_MODEL=qwen/qwen3.6-35b-a3b
AI_VISION_MODEL=qwen/qwen3.6-35b-a3b
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_speech_resource_region
```

Run `npm run check:providers` to verify text review, image review, and audio in English, Hindi, and Telugu. This command makes short billable requests to the configured providers. Restart the app after changing `.env`.

The text and vision models can use another compatible chat completions API through `AI_BASE_URL`. To use another speech provider with an OpenAI-compatible MP3 endpoint, set `TTS_BASE_URL`, `TTS_MODEL`, and `TTS_API_KEY` in place of the Azure variables. Set `TTS_VOICE_EN`, `TTS_VOICE_HI`, or `TTS_VOICE_TE` to override the voices for either provider.

Built-in checks and captions work without credentials. The browser can speak captions when it has an installed voice for the selected language.

## Download a walkthrough

Install FFmpeg with H.264 support and make it available on `PATH`, or set `FFMPEG_PATH` to its executable. Restart DeSpecto, open an audit's **Walkthrough** tab, select the language, and choose **Export MP4**. Download the finished video from the same tab. Export burns in the captions and evidence highlights and uses provider audio to time available narration. The server retains the most recent export.

## Level 1 verification

Run `npm run evaluate` for the built-in baseline. The suite completed on 10 public GitHub repositories and 5 public websites. It checked screenshot coordinates, confirmed that the W3C accessibility examples produced different image findings, rechecked the demo website's fix, and verified that Git accepts a generated README patch. Provider checks run separately through `npm run check:providers`.

For the demo, audit the GitHub example and open a finding's source link. Audit the website example, open **Walkthrough**, select Telugu, then return to the finding and choose **Show fix** to compare the original mobile viewport against the rechecked preview.
