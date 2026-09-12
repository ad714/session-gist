# Session Gist

Record or upload a mentorship session, and get back the words it was actually about.

One screen. Two ways in, one pipeline: the audio is prepared in the browser, transcribed by an AI
service, reduced to the terms that dominated the conversation, and drawn as a word cloud you can
download as a PNG.

Live: <LIVE_URL>

## What works

All four required parts work end to end on the live URL.

- **Record in the browser.** Start and stop, a red stop glyph and a ring that fills toward the 10
  minute cap, a running timer, and a meter driven by a real frequency analysis of the microphone.
  Playback before you commit, and discard to record again.
- **Upload a file.** File picker and drag and drop. Name, size and duration are shown before you
  commit. Anything that is not an accepted format is refused with a message that names the
  extension and lists what is accepted.
- **AI analysis.** Groq transcribes the audio, then a second model reads the transcript and picks
  out the terms the session actually dwelt on, with a weight for each. The subject matter can be
  anything; nothing about the analysis assumes a topic.
- **Word cloud.** Rendered as SVG, sized and toned by weight, downloadable as a PNG, and the words
  can be copied as text.

Limits are enforced and stated in the UI before you wait: 10 minutes or 25 MB, whichever comes
first.

Two of the optional extras in section 06 are in: the transcript is shown beside the cloud and can
be copied, and the words themselves can be copied. The rest were left out on purpose.

Session only. There are no accounts, and closing the tab discards everything. The one exception is
that a finished result is held in `sessionStorage` for the life of the tab, so that a phone
dropping the page out of memory while you are in another app does not throw the analysis away. It
is cleared the moment you start another session.

### Failure cases, each one triggered and checked

None of these produce a frozen screen, a silent failure, or a raw console error:

- Microphone permission denied, missing, or already in use by another app. A denial also offers
  the exact steps for the browser you are actually in, since the control sits in a different place
  in Chrome, Safari, Firefox and on a phone
- A file over 25 MB, refused before any upload, naming the actual size
- A file in an unsupported format
- Audio with no audible sound in it, caught in the browser before any upload
- The AI service failing, rate limiting, timing out, or the server having no API key

## Run it locally

```
git clone <REPO_URL>
cd session-gist
npm install
cp .dev.vars.example .dev.vars
```

Put a Groq API key in `.dev.vars`. A free key, no card needed, from https://console.groq.com/keys

```
GROQ_API_KEY=gsk_your_key_here
```

The file is called `.dev.vars` rather than `.env` because that is how Cloudflare Workers reads
secrets in local development. It is gitignored, and `.dev.vars.example` is the committed template.

```
npm run dev
```

Open http://localhost:5173

One command runs both the app and the Worker, because the Cloudflare Vite plugin runs the Worker
inside the dev server.

Other commands: `npm run build`, `npm run typecheck`, `npm run lint`.

## Deploying

```
npm run deploy
```

That builds and runs `wrangler deploy`. Set the key on the deployed Worker once, separately:

```
npx wrangler secret put GROQ_API_KEY
```

The key is never in the repo and never reaches the browser. It lives only as a Worker secret, and
the browser talks only to `/api/analyze` on the same origin.

## The AI service, and why

**Groq**, using two models:

- `whisper-large-v3-turbo` for transcription
- `openai/gpt-oss-120b` to read the transcript and return weighted terms as strict JSON

Groq has a genuinely free tier that needs no card, and it is fast. Transcription is the slowest
step and the one the user sits and waits through, so latency mattered more than anything else on
offer.

The second model call is the point of the feature. Counting word frequencies would put "think",
"going" and "really" at the top of every session. Instead the model is asked to weight terms by
how much the session was genuinely about them, to merge plurals, case and obvious variants, and to
drop filler and backchannel. The response is constrained with a JSON schema, so the shape is
guaranteed rather than hoped for.

## Decisions worth defending

**No framework.** This is one page and one endpoint. It has no routing, no server rendering and
nothing to hydrate. Next.js would have meant adding an adapter whose only job is to undo Next on a
platform that does not need it, and that adapter would be the most likely thing to break the live
URL. Vite builds the page, one Worker file answers the one request.

**The browser converts the audio to 16 kHz mono MP3 before uploading.** This is the least obvious
part of the build. A 10 minute session arrives at roughly 2.4 MB instead of 25 MB. Three reasons:
Groq's free tier caps audio uploads at 25 MB, so a large original sits right at the edge;
uploading 25 MB over a phone connection is slow, and this is meant to be usable on a phone; and
Cloudflare's free plan allows only 10 ms of CPU per request, so the Worker must never do heavy
work on the body. Downsampling to 16 kHz mono is also exactly what Groq's own documentation
recommends for speech. The cost is a few seconds of work on the user's device, shown as a real
progress bar rather than a spinner.

**The Worker forwards the upload instead of parsing it.** It reads the body as bytes and passes
them straight to Groq with the key attached, rather than decoding the multipart form. Parsing a
few MB of multipart could exceed the 10 ms CPU limit and return a Cloudflare 1102 error, which
would look to the user exactly like the flaky API failure this brief asks you to handle properly.
The trade-off is that the browser sets the transcription parameters in the form body, so the
endpoint trusts its own client more than it otherwise would. For an unauthenticated evaluation app
on a free key that is an acceptable trade. With real users I would put size and rate limits in
front of it and validate the fields.

**The cloud is a summary, not a word count.** The transcript is never shown as the cloud. A model
reads it and returns concepts, which is why a term like "audience retention" can appear when the
speaker actually said "my retention drops off around the forty second mark". The terms are an
abstraction of what was discussed rather than the words that happened to be spoken.

**Nothing assumes a subject.** An early version described the input to the model as a mentorship
session with a school student, and it returned nothing at all for a recording about starting a
YouTube channel. The brief describes mentoring as the setting, not as a filter, so the prompt now
describes the input only as a recorded spoken session.

**The recording never depends on a repaint.** An earlier version measured the cloud with a
ResizeObserver, which browsers do not fire for a backgrounded tab, so the result rendered as a
plain list until you returned to the page. Anyone waiting on a long transcription switches tabs,
so the measurement now happens synchronously and the layout needs no frame at all.

**The word cloud is horizontal only, and weight controls tone as well as size.** Rotated words
look busier but are slower to read, and the brief asks for a result readable in a glance. Dominant
terms are large and near black; terms that barely came up are small and light grey, so they recede
instead of competing. Size alone was not enough separation on a white background.

**Deliberately not built:** accounts, saved history, speaker separation, live transcription while
recording, and multiple languages. Section 05 rules these out, and each would have taken time from
the four parts that are actually marked.

## Not my own code

- **React 19** and **Vite** for the page and the build
- **@cloudflare/vite-plugin** and **wrangler** to run and deploy the Worker
- **d3-cloud** for the word cloud layout algorithm
- **@breezystack/lamejs** for MP3 encoding in the browser
- **Sentient** by the Indian Type Foundry, a free licensed typeface from Fontshare, self hosted in
  the repo so there is no third party font request

No UI kit, no CSS framework and no component library. The interface is small enough that a
dependency would have been more weight than it was worth. Everything else is written for this
project.

## AI coding tools

Yes, throughout. I used Claude Code to write and refactor the implementation, against a brief I
set: the product decisions, the palette, the failure behaviour, the scope cuts and the review of
what it produced are mine. Every failure path listed above was triggered in a real browser and
checked, including the 25 MB refusal and the denied microphone, rather than assumed to work.

## With another week

- Let the user remove a word from the cloud and re-render without paying for a second analysis
- Keep the last few analyses in the browser so a mentor can come back to one
- Split audio longer than 10 minutes into chunks and transcribe them in sequence instead of
  refusing the file
- A test suite around the audio conversion, which is the part most likely to break quietly
