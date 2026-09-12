import { NextResponse } from "next/server";

export const maxDuration = 60;

const GROQ = "https://api.groq.com/openai/v1";
const TRANSCRIBE_MODEL = "whisper-large-v3-turbo";
const TERMS_MODEL = "openai/gpt-oss-120b";
const BODY_CEILING = 4.4 * 1024 * 1024;
const MAX_TERMS = 45;

const INSTRUCTIONS = `You are given the transcript of a recorded one-to-one mentorship session between a mentor and a school student. Identify what the session was actually about.

Return JSON in exactly this shape:
{"terms":[{"term":"study timetable","weight":100},{"term":"exam nerves","weight":64}]}

Rules:
- Pick the topics, skills, subjects, concerns and named things the session genuinely dwelt on.
- Weight by how much the session was about that term, not by how many times the word appears. The single most dominant term gets 100. Terms mentioned once in passing sit below 20.
- Merge case, plurals and obvious variants of the same idea into one canonical term, lower case.
- Each term is one to three words.
- Exclude filler, greetings, backchannel and stopwords: um, yeah, okay, like, you know, sort of, I mean, right, so, actually, basically.
- Exclude generic verbs and pleasantries that carry no subject matter.
- Return between 10 and 40 terms. If the transcript carries no real content, return {"terms":[]}.`;

export async function POST(request: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return fail(500, "The server has no GROQ_API_KEY set. Add it to .env.local and restart.");
  }

  let audio: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("audio");
    if (value instanceof File) audio = value;
  } catch {
    return fail(400, "We could not read the uploaded audio.");
  }

  if (!audio || audio.size === 0) {
    return fail(400, "No audio reached the server. Try again.");
  }
  if (audio.size > BODY_CEILING) {
    return fail(413, "That audio is too large to send. Trim it and try again.");
  }

  let transcript: string;
  try {
    transcript = await transcribe(audio, key);
  } catch (error) {
    return fromFailure(error, "transcribe");
  }

  if (!transcript.trim() || transcript.trim().length < 12) {
    return fail(422, "We could not make out any speech in that audio. Check the microphone and try again.");
  }

  let terms: { term: string; weight: number }[];
  try {
    terms = await extractTerms(transcript, key);
  } catch (error) {
    return fromFailure(error, "terms");
  }

  if (!terms.length) {
    return fail(422, "There was speech in that audio, but not enough of it to find any real topics.");
  }

  return NextResponse.json({ terms, transcript: transcript.trim() });
}

async function transcribe(audio: File, key: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, audio.name || "session.mp3");
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "json");
  form.append("language", "en");
  form.append("temperature", "0");

  const response = await fetch(`${GROQ}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) throw await upstream(response);
  const data = (await response.json()) as { text?: string };
  return data.text ?? "";
}

async function extractTerms(transcript: string, key: string) {
  const response = await fetch(`${GROQ}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TERMS_MODEL,
      temperature: 0.2,
      reasoning_effort: "low",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "session_terms",
          strict: true,
          schema: {
            type: "object",
            properties: {
              terms: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    term: { type: "string" },
                    weight: { type: "integer" },
                  },
                  required: ["term", "weight"],
                  additionalProperties: false,
                },
              },
            },
            required: ["terms"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        { role: "system", content: INSTRUCTIONS },
        { role: "user", content: transcript.slice(0, 40000) },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) throw await upstream(response);

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  return normalise(raw);
}

function normalise(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The AI service returned something we could not read.");
  }

  const list = Array.isArray(parsed)
    ? parsed
    : ((parsed as { terms?: unknown }).terms ?? []);
  if (!Array.isArray(list)) return [];

  const merged = new Map<string, number>();
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.term !== "string") continue;
    const term = record.term.trim().toLowerCase().replace(/\s+/g, " ");
    if (!term || term.length > 40) continue;
    const rawWeight = Number(record.weight);
    const weight = Number.isFinite(rawWeight) ? Math.min(100, Math.max(1, Math.round(rawWeight))) : 1;
    merged.set(term, Math.max(merged.get(term) ?? 0, weight));
  }

  return [...merged.entries()]
    .map(([term, weight]) => ({ term, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_TERMS);
}

async function upstream(response: Response): Promise<Error> {
  let detail = "";
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? "";
  } catch {
    detail = "";
  }
  const error = new Error(detail || `Upstream responded ${response.status}`);
  error.name = `upstream:${response.status}`;
  return error;
}

function fromFailure(error: unknown, stage: "transcribe" | "terms") {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";

  if (name === "TimeoutError" || name === "AbortError") {
    return fail(504, "The AI service took too long to answer. Try again in a moment.");
  }

  const status = Number(name.startsWith("upstream:") ? name.slice(9) : 0);
  if (status === 401 || status === 403) {
    return fail(502, "The AI service rejected our key. The key on the server needs checking.");
  }
  if (status === 429) {
    return fail(429, "The AI service is rate limiting us right now. Wait a minute and try again.");
  }
  if (status === 413) {
    return fail(413, "The AI service refused the file for being too large.");
  }
  if (status >= 500) {
    return fail(502, "The AI service is having problems. Try again in a moment.");
  }
  if (status === 400 && message) {
    return fail(502, `The AI service refused the request: ${message}`);
  }

  const where = stage === "transcribe" ? "transcribing the audio" : "picking out the key terms";
  return fail(502, `Something went wrong ${where}. Try again.`);
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
