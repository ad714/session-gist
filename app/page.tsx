"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Cloud from "@/components/Cloud";
import Recorder from "@/components/Recorder";
import Uploader from "@/components/Uploader";
import { MAX_SECONDS, checkFile, formatBytes, formatClock, prepare, readDuration } from "@/lib/audio";
import { type Analysis, analyse } from "@/lib/analyse";
import { useRecorder } from "@/lib/useRecorder";
import styles from "./page.module.css";

type Source = {
  blob: Blob;
  name: string;
  bytes: number;
  seconds: number | null;
};

type Phase = "idle" | "review" | "preparing" | "uploading" | "analysing" | "done" | "failed";

export default function Page() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<Source | null>(null);
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const onRecorded = useCallback((blob: Blob, seconds: number) => {
    setSource({ blob, name: "Session recording", bytes: blob.size, seconds });
    setPhase("review");
  }, []);

  const recorder = useRecorder(onRecorded);

  const playback = useMemo(() => (source ? URL.createObjectURL(source.blob) : ""), [source]);

  useEffect(() => {
    if (!playback) return;
    return () => URL.revokeObjectURL(playback);
  }, [playback]);

  const reset = () => {
    setSource(null);
    setAnalysis(null);
    setMessage("");
    setPercent(0);
    setPhase("idle");
    recorder.clearError();
  };

  const onPick = async (file: File) => {
    recorder.clearError();
    const problem = checkFile(file);
    if (problem) {
      setSource(null);
      setMessage(problem.message);
      setPhase("failed");
      return;
    }
    const seconds = await readDuration(file);
    if (seconds !== null && seconds > MAX_SECONDS + 1) {
      setSource(null);
      setMessage(
        `That file is ${formatClock(seconds)} long. The limit is 10 minutes, so please trim it first.`,
      );
      setPhase("failed");
      return;
    }
    setSource({ blob: file, name: file.name, bytes: file.size, seconds });
    setMessage("");
    setPhase("review");
  };

  const start = async () => {
    if (!source) return;
    try {
      setPercent(0);
      setPhase("preparing");
      const { mp3 } = await prepare(source.blob, setPercent);

      setPercent(0);
      setPhase("uploading");
      const result = await analyse(mp3, setPercent, () => setPhase("analysing"));

      setAnalysis(result);
      setPhase("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Try again.");
      setPhase("failed");
    }
  };

  const working = phase === "preparing" || phase === "uploading" || phase === "analysing";
  const live = recorder.state === "recording";

  return (
    <main className={`${styles.page} ${phase === "idle" ? styles.centred : ""}`}>
      <header className={styles.head}>
        <h1 className={styles.wordmark}>Session Gist</h1>
        <p className={styles.purpose}>
          Record or upload a mentorship session. Get back the words it was actually about.
        </p>
      </header>

      {phase === "idle" && (
        <>
          <section className={styles.doors} aria-label="Choose a recording or a file">
            <Recorder
              live={live}
              starting={recorder.state === "starting"}
              seconds={recorder.seconds}
              levels={recorder.levels}
              onStart={recorder.start}
              onStop={recorder.stop}
            />
            {!live && (
              <>
                <p className={styles.or}>or</p>
                <Uploader disabled={recorder.state !== "idle"} onPick={onPick} />
              </>
            )}
          </section>
          {recorder.error && (
            <p className={styles.alert} role="alert">
              {recorder.error}
            </p>
          )}
          <p className={styles.limits}>English audio. Nothing is stored after you close the page.</p>
        </>
      )}

      {phase === "review" && source && (
        <section className={styles.panel} aria-label="Check the audio before analysing">
          <p className={styles.fileName}>{source.name}</p>
          <p className={styles.fileFacts}>
            {formatBytes(source.bytes)}
            {source.seconds !== null ? ` · ${formatClock(source.seconds)}` : ""}
          </p>
          {playback && <audio className={styles.player} src={playback} controls preload="metadata" />}
          <div className={styles.row}>
            <button type="button" className={styles.primary} onClick={start}>
              Analyse this
            </button>
            <button type="button" className={styles.quiet} onClick={reset}>
              Discard
            </button>
          </div>
        </section>
      )}

      {working && (
        <section className={styles.panel} aria-label="Working">
          <p className={styles.stepLabel} role="status">
            {phase === "preparing" && "Preparing audio"}
            {phase === "uploading" && "Sending to the AI service"}
            {phase === "analysing" && "Transcribing and picking out the key terms"}
          </p>
          <div className={styles.track}>
            {phase === "analysing" ? (
              <span className={styles.sweep} />
            ) : (
              <span className={styles.fill} style={{ width: `${percent}%` }} />
            )}
          </div>
          <p className={styles.note}>
            {phase === "analysing"
              ? "This usually takes a few seconds. It can take longer for a full session."
              : `${percent}%`}
          </p>
        </section>
      )}

      {phase === "done" && analysis && (
        <section className={styles.result} aria-label="Result">
          <Cloud terms={analysis.terms}>
            <button type="button" className={styles.quiet} onClick={reset}>
              Analyse another session
            </button>
          </Cloud>
          <details className={styles.transcript}>
            <summary>Transcript</summary>
            <p>{analysis.transcript}</p>
          </details>
        </section>
      )}

      {phase === "failed" && (
        <section className={styles.panel} aria-label="Something went wrong">
          <p className={styles.alert} role="alert">
            {message}
          </p>
          <div className={styles.row}>
            {source ? (
              <button type="button" className={styles.primary} onClick={start}>
                Try again
              </button>
            ) : null}
            <button type="button" className={styles.quiet} onClick={reset}>
              Start over
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
