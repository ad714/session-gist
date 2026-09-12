import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_SECONDS } from "./audio";

export type RecorderState = "idle" | "starting" | "recording";

export type MicError = { message: string; denied: boolean };

const CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

export const BANDS = 21;

const QUIET: number[] = Array.from({ length: BANDS }, () => 0);

export function useRecorder(onFinish: (blob: Blob, seconds: number) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(QUIET);
  const [error, setError] = useState<MicError | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const meterStop = useRef<(() => void) | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const finish = useRef(onFinish);

  useEffect(() => {
    finish.current = onFinish;
  }, [onFinish]);

  const teardown = useCallback(() => {
    meterStop.current?.();
    meterStop.current = null;
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
    setLevels(QUIET);
  }, []);

  useEffect(() => teardown, [teardown]);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setState("starting");

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("idle");
      setError({
        message: "This browser cannot record audio. Upload a file instead, or try current Chrome or Safari.",
        denied: false,
      });
      return;
    }

    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (cause) {
      setState("idle");
      setError(micFailure(cause));
      return;
    }

    stream.current = media;
    chunks.current = [];

    const mimeType = CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
    let instance: MediaRecorder;
    try {
      instance = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    } catch {
      teardown();
      setState("idle");
      setError({ message: "This browser could not start a recording. Upload a file instead.", denied: false });
      return;
    }

    instance.ondataavailable = (event) => {
      if (event.data.size) chunks.current.push(event.data);
    };

    instance.onstop = () => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      const blob = new Blob(chunks.current, { type: instance.mimeType || "audio/webm" });
      teardown();
      setState("idle");
      setSeconds(0);
      if (blob.size === 0) {
        setError({ message: "Nothing was captured. Check the microphone and try again.", denied: false });
        return;
      }
      finish.current(blob, elapsed);
    };

    recorder.current = instance;
    startedAt.current = Date.now();
    instance.start(1000);
    setSeconds(0);
    setState("recording");
    meterStop.current = startMeter(media, setLevels);

    ticker.current = setInterval(() => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) stop();
    }, 200);
  }, [stop, teardown]);

  return { state, seconds, levels, error, start, stop, clearError: () => setError(null) };
}

function startMeter(media: MediaStream, onLevels: (values: number[]) => void): () => void {
  let audio: AudioContext;
  try {
    audio = new AudioContext();
  } catch {
    return () => {};
  }

  const analyser = audio.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.7;
  audio.createMediaStreamSource(media).connect(analyser);

  const spectrum = new Uint8Array(analyser.frequencyBinCount);
  const edges = Array.from({ length: BANDS + 1 }, (_, index) =>
    Math.round(2 * Math.pow(44 / 2, index / BANDS)),
  );
  const smoothed = Array.from({ length: BANDS }, () => 0);
  let frame = 0;
  let last = 0;

  const read = () => {
    analyser.getByteFrequencyData(spectrum);
    for (let band = 0; band < BANDS; band++) {
      const from = edges[band];
      const to = Math.max(edges[band + 1], from + 1);
      let sum = 0;
      for (let bin = from; bin < to; bin++) sum += spectrum[bin] ?? 0;
      const value = Math.min(1, sum / (to - from) / 190);
      smoothed[band] = Math.max(value, smoothed[band] * 0.78);
    }
    const now = performance.now();
    if (now - last > 55) {
      last = now;
      onLevels([...smoothed]);
    }
    frame = requestAnimationFrame(read);
  };

  frame = requestAnimationFrame(read);

  return () => {
    cancelAnimationFrame(frame);
    audio.close().catch(() => {});
  };
}

function micFailure(cause: unknown): MicError {
  const name = cause instanceof Error ? cause.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return { message: "Microphone access was blocked for this page.", denied: true };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return {
      message:
        "No microphone was found. Connect one, or pick one in your system sound settings, then press record again.",
      denied: false,
    };
  }
  if (name === "NotReadableError") {
    return {
      message: "Your microphone is being used by another app. Close that app, then press record again.",
      denied: false,
    };
  }
  return { message: "We could not start the microphone. Check its permission, then press record again.", denied: true };
}
