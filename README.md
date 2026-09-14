# Session Gist

Record or upload a mentorship session, and get back the words it was actually about.

Live: https://session-gist.session-gist.workers.dev

## What works

All four required parts, end to end.

- **Record in the browser.** Start and stop, a ring that fills toward the 10 minute cap, a running
  timer, and a meter driven by a real frequency analysis of the microphone. Playback and discard
  before you commit.
- **Upload a file.** Picker and drag and drop. Name, size and duration shown before you commit.
  Anything else is refused with a message that names the extension and lists what is accepted.
- **AI analysis.** Groq transcribes the audio, then a second model reads the transcript and picks
  out the terms the session dwelt on, with a weight for each. The subject can be anything.
- **Word cloud.** Rendered as SVG, sized and toned by weight, downloadable as a PNG. The words and
  the transcript can both be copied.

Limits are enforced and stated in the UI before you wait: 10 minutes or 25 MB, whichever comes
first.

Handled without a frozen screen or a raw console error: microphone denied, missing, or in use by
another app, with instructions for the browser you are actually in; a file over 25 MB, refused
before any upload; an unsupported format; audio with nothing audible in it, caught in the browser;
and the AI service failing, rate limiting, timing out, or the key being absent on the server.

Session only, no accounts. The one exception is that a finished result is held in `sessionStorage`
for the life of the tab, so a phone dropping the page out of memory does not throw the analysis
away. It clears the moment you start another session.

## Run it locally

```
git clone https://github.com/ad714/session-gist.git
cd session-gist
npm install
cp .dev.vars.example .dev.vars
```

Put a Groq API key in `.dev.vars`. Free, no card, from https://console.groq.com/keys

```
GROQ_API_KEY=gsk_your_key_here
```

```
npm run dev
```

Open http://localhost:5173. One command runs both the page and the Worker, because the Cloudflare
Vite plugin runs the Worker inside the dev server.

The file is `.dev.vars` rather than `.env` because that is how Cloudflare Workers reads secrets in
local development. It is gitignored, and `.dev.vars.example` is the committed template.

Also available: `npm run build`, `npm run typecheck`, `npm run lint`.

## Deploying

`npm run deploy` builds and runs `wrangler deploy`. Set the key on the deployed Worker once:

```
npx wrangler secret put GROQ_API_KEY
```

The key is never in the repo and never reaches the browser. It lives only as a Worker secret, and
the browser talks only to `/api/analyze` on the same origin.

## The AI service, and why

**Groq**, using two models: `whisper-large-v3-turbo` to transcribe, and `openai/gpt-oss-120b` to
read the transcript and return weighted terms as strict JSON.

Groq has a genuinely free tier that needs no card, and it is fast. Transcription is the slowest
step and the one the user sits and waits through, so latency mattered more than anything else on
offer.

The second call is the point of the feature. Counting frequencies would put "think", "going" and
"really" at the top of every session. The model returns concepts instead, which is why a term like
"audience retention" can appear when the speaker actually said "my retention drops off around the
forty second mark". The response is constrained with a JSON schema, so the shape is guaranteed
rather than hoped for.

## Three decisions

**No framework.** One page, one endpoint, no routing and nothing to hydrate. Next.js would have
meant adding an adapter whose only job is to undo Next on a platform that does not need it, and
that adapter is the most likely thing to break the live URL. Vite builds the page, one Worker file
answers the one request.

**The browser converts the audio to 16 kHz mono MP3 before uploading.** A 10 minute session
arrives at roughly 2.4 MB instead of 25 MB. Groq's free tier caps uploads at 25 MB, uploading that
much over a phone connection is slow, and Cloudflare's free plan allows only 10 ms of CPU per
request, so the Worker forwards the body as bytes rather than parsing the multipart form. 16 kHz
mono is also what Groq's own documentation recommends for speech. The cost is a few seconds of
work on the user's device, shown as a real progress bar rather than a spinner.

**Deliberately not built:** accounts, saved history, speaker separation, live transcription while
recording, and multiple languages. Section 05 rules these out, and each would have taken time from
the four parts that are actually marked.

## Not my own code

- **React 19** and **Vite** for the page and the build
- **@cloudflare/vite-plugin** and **wrangler** to run and deploy the Worker
- **d3-cloud** for the word cloud layout algorithm
- **@breezystack/lamejs** for MP3 encoding in the browser
- **Sentient** by the Indian Type Foundry, a free licensed typeface from Fontshare, self hosted so
  there is no third party font request

No UI kit, no CSS framework and no component library. Everything else is written for this project.

## AI coding tools

Yes, throughout. I used Claude Code to write and refactor the implementation against a brief I
set. The product decisions, the palette, the failure behaviour, the scope cuts and the review of
what it produced are mine.

## With another week

- Let the user remove a word from the cloud and re-render without paying for a second analysis
- Keep the last few analyses in the browser so a mentor can come back to one
- Split audio longer than 10 minutes into chunks and transcribe them in sequence instead of
  refusing the file
- A test suite around the audio conversion, which is the part most likely to break quietly
