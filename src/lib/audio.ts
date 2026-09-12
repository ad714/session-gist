import { Mp3Encoder } from "@breezystack/lamejs";

export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_SECONDS = 600;

const TARGET_RATE = 16000;
const TARGET_KBPS = 32;
const SILENCE_PEAK = 0.008;
const BLOCK = 1152;

const BY_EXT: Record<string, string> = {
  mp3: "MP3",
  wav: "WAV",
  m4a: "M4A",
  aac: "AAC",
  ogg: "OGG",
  oga: "OGG",
  webm: "WEBM",
  flac: "FLAC",
};

const BY_MIME: Record<string, string> = {
  "audio/mpeg": "MP3",
  "audio/mp3": "MP3",
  "audio/wav": "WAV",
  "audio/wave": "WAV",
  "audio/x-wav": "WAV",
  "audio/mp4": "M4A",
  "audio/x-m4a": "M4A",
  "audio/aac": "AAC",
  "audio/ogg": "OGG",
  "application/ogg": "OGG",
  "audio/webm": "WEBM",
  "audio/flac": "FLAC",
  "audio/x-flac": "FLAC",
};

export const ACCEPTED_LABELS = "MP3, WAV, M4A, AAC, OGG, WEBM, FLAC";

export type FailureCode = "format" | "size" | "duration" | "silent" | "decode";

export class AudioError extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function formatLabel(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (BY_EXT[ext]) return BY_EXT[ext];
  return BY_MIME[file.type.toLowerCase()] ?? null;
}

export function checkFile(file: File): AudioError | null {
  const label = formatLabel(file);
  if (!label) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const named = ext ? `.${ext} files are not supported.` : "That file type is not supported.";
    return new AudioError("format", `${named} Use one of ${ACCEPTED_LABELS}.`);
  }
  if (file.size > MAX_BYTES) {
    return new AudioError(
      "size",
      `That file is ${formatBytes(file.size)}. The limit is 25 MB, so please trim it or export at a lower bitrate.`,
    );
  }
  if (file.size === 0) {
    return new AudioError("format", "That file is empty.");
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function readDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement("audio");
    const url = URL.createObjectURL(blob);
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 5000);
    el.preload = "metadata";
    el.onerror = () => done(null);
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) return done(el.duration);
      el.ontimeupdate = () => {
        el.ontimeupdate = null;
        done(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
      };
      el.currentTime = 1e101;
    };
    el.src = url;
  });
}

export async function prepare(
  blob: Blob,
  onProgress: (percent: number) => void,
): Promise<{ mp3: Blob; seconds: number }> {
  const samples = await decodeToMono(blob);
  const seconds = samples.length / TARGET_RATE;

  if (seconds > MAX_SECONDS + 1) {
    throw new AudioError(
      "duration",
      `That audio is ${formatClock(seconds)} long. The limit is 10 minutes, so please trim it first.`,
    );
  }
  if (peakOf(samples) < SILENCE_PEAK) {
    throw new AudioError(
      "silent",
      "We could not hear anything in that audio. Check that the right microphone was picked up, then try again.",
    );
  }

  const encoder = new Mp3Encoder(1, TARGET_RATE, TARGET_KBPS);
  const parts: Uint8Array[] = [];
  const pcm = new Int16Array(BLOCK);

  for (let offset = 0; offset < samples.length; offset += BLOCK) {
    const end = Math.min(offset + BLOCK, samples.length);
    for (let i = offset; i < end; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      pcm[i - offset] = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
    }
    const encoded = encoder.encodeBuffer(pcm.subarray(0, end - offset));
    if (encoded.length) parts.push(new Uint8Array(encoded));
    if (offset % (BLOCK * 150) === 0) {
      onProgress(Math.round((offset / samples.length) * 100));
      await nextFrame();
    }
  }

  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  onProgress(100);

  return { mp3: new Blob(parts as BlobPart[], { type: "audio/mpeg" }), seconds };
}

async function decodeToMono(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer();
  const context = new OfflineAudioContext(1, 1, TARGET_RATE);
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(bytes);
  } catch {
    throw new AudioError(
      "decode",
      "We could not read that audio. The file may be damaged, or in a format this browser cannot open.",
    );
  }
  const mono = mixDown(buffer);
  return buffer.sampleRate === TARGET_RATE ? mono : resample(mono, buffer.sampleRate, TARGET_RATE);
}

function mixDown(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const first = buffer.getChannelData(0);
  if (channels === 1) return first;
  const out = new Float32Array(first.length);
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < out.length; i++) out[i] += data[i] / channels;
  }
  return out;
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const next = index + 1 < input.length ? input[index + 1] : input[index];
    out[i] = input[index] * (1 - fraction) + next * fraction;
  }
  return out;
}

function peakOf(samples: Float32Array): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i]);
    if (value > max) max = value;
  }
  return max;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
