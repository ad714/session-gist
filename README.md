# Session Gist

Record or upload a mentorship session, and get back the words it was actually about.

One screen. Two ways in, one pipeline: the audio is converted in the browser, transcribed by an
AI service, reduced to the terms that dominated the conversation, and drawn as a word cloud you
can download as a PNG.

Live: <LIVE_URL>

## What works

All four required parts work end to end on the live URL.

- **Record in the browser.** Start and stop, a red stop glyph and a ring that fills toward the 10
  minute cap, a running timer, and a level meter driven by a real frequency analysis of the
  microphone. Playback before you commit, and discard to record again.
- **Upload a file.** File picker and drag and drop. Name, size and duration are shown before you
  commit. Anything that is not an accepted format is refused with a message that names the
  extension and lists what is accepted.
- **AI analysis.** Groq transcribes the audio, then a second model reads the transcript and picks
  out the terms the session actually dwelt on, with a weight for each.
- **Word cloud.** Rendered as SVG, sized and toned by weight, downloadable as a PNG.

Limits are enforced and stated in the UI before you wait: 10 minutes or 25 MB, whichever comes
first.

Session only. Nothing is stored, there are no accounts, and closing the tab discards everything.

### Verified failure cases

Each of these was triggered deliberately and produces a message that says what happened and what
to do next, never a frozen screen or a console error:

- Microphone permission denied, missing, or already in use by another app
- A file over 25 MB (refused before any upload, naming the actual size)
- A file in an unsupported format
- Audio with no audible sound in it (caught in the browser, before any upload)
- The AI service failing, rate limiting, timing out, or the server having no API key

## Run it locally

```
git clone <REPO_URL>
cd session-gist
npm install
cp .env.example .env.local
```

Put a Groq API key in `.env.local`. A free key is available at https://console.groq.com/keys

```
GROQ_API_KEY=gsk_your_key_here
```

Then:

```
npm run dev
```

Open http://localhost:3000

To build for production: `npm run build` then `npm start`.

## The AI service, and why

**Groq**, using two models:

- `whisper-large-v3-turbo` for transcription
- `openai/gpt-oss-120b` to read the transcript and return weighted terms as strict JSON

Groq was chosen because it has a genuinely free tier that needs no card, and because it is fast.
Transcription is the slowest step in this app, and it is the one the user is sitting and waiting
through, so latency mattered more than anything else on offer.

The second model call is the point of the feature. Counting word frequencies would put "think",
"going" and "really" at the top of every session. Instead the model is asked to weight terms by
how much the session was genuinely about them, to merge plurals, case and obvious variants, and
to drop filler and backchannel. The response is constrained with a JSON schema so the shape is
guaranteed rather than hoped for.

## Decisions worth defending

**The browser converts the audio to 16 kHz mono MP3 before uploading.** This is the least obvious
piece of the build and the one that makes the stated limits achievable. Vercel caps a serverless
request body at 4.5 MB, and the brief allows files up to 25 MB, so passing the original file
straight through would fail with a 413 on exactly the large sessions the tool exists for. The
audio is decoded, mixed to mono, resampled to 16 kHz and encoded to a 32 kbps MP3 in the browser
first. A 10 minute session lands at roughly 2.4 MB. This is also what Groq's own documentation
recommends for speech, and it makes uploading over a phone connection far quicker. The cost is a
few seconds of work on the user's device, which is shown as a real progress bar rather than a
spinner.

**The word cloud is horizontal only, and weight controls tone as well as size.** Rotated words
look busier but are slower to read, and the brief asks for a result that is readable in a glance.
Dominant terms are large and near black; terms that barely came up are small and light grey, so
they recede instead of competing. Size alone was not enough separation on a white background.

**Deliberately not built:** accounts, saved history, speaker separation, live transcription while
recording, and multiple languages. Section 05 of the brief rules these out, and each one would
have taken time away from the four parts that are actually marked.

## Not my own code

- **Next.js 16 / React 19** for the app and the one API route
- **d3-cloud** for the word cloud layout algorithm
- **@breezystack/lamejs** for MP3 encoding in the browser
- **Sentient** by the Indian Type Foundry, a free licensed typeface from Fontshare, self hosted in
  the repo so there is no third party font request

No UI kit, no CSS framework and no component library. The interface is small enough that a
dependency would have been more weight than it was worth. Everything else is written for this
project.

## AI coding tools

Yes, throughout. I used Claude Code to write and refactor the implementation, and drove it
against a brief I set: the product decisions, the palette, the failure behaviour, the scope cuts
and the review of what it produced are mine. Every failure path listed above was triggered and
checked in a real browser rather than assumed, including the 25 MB refusal and the denied
microphone.

## With another week

- Let the user remove a word from the cloud and re-render without paying for a second analysis
- Keep the last few analyses in the browser so a mentor can come back to one
- Split audio longer than 10 minutes into chunks and transcribe them in sequence instead of
  refusing the file
- Stem and merge terms server side as well, so near duplicates from the model collapse into one
- A proper test suite around the audio conversion, which is the part most likely to break quietly
