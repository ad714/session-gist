import { MAX_SECONDS, formatClock } from "@/lib/audio";
import { BANDS } from "@/lib/useRecorder";
import styles from "@/app.module.css";

const RING = 44;
const CIRCUMFERENCE = 2 * Math.PI * RING;

type Props = {
  live: boolean;
  starting: boolean;
  seconds: number;
  levels: number[];
  onStart: () => void;
  onStop: () => void;
};

export default function Recorder({ live, starting, seconds, levels, onStart, onStop }: Props) {
  const used = Math.min(1, seconds / MAX_SECONDS);
  const remaining = Math.max(0, MAX_SECONDS - seconds);

  return (
    <div className={styles.door}>
      <p className={styles.doorTitle}>{live ? "Recording" : "Record the session"}</p>

      <div className={styles.doorBody}>
        <button
        type="button"
        className={styles.dial}
        onClick={live ? onStop : onStart}
        disabled={starting}
        aria-label={live ? "Stop recording" : "Start recording"}
      >
        <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={RING} className={styles.ringTrack} />
          {live && (
            <circle
              cx="50"
              cy="50"
              r={RING}
              className={styles.ringFill}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - used)}
              transform="rotate(-90 50 50)"
            />
          )}
        </svg>
        <span className={live ? styles.stopGlyph : styles.recordGlyph} aria-hidden="true" />
        </button>

        {live && (
          <>
            <p className={styles.clock}>{formatClock(seconds)}</p>
            <div className={styles.meter} aria-hidden="true">
              {Array.from({ length: BANDS }, (_, index) => (
                <span key={index} style={{ height: `${3 + (levels[index] ?? 0) * 30}px` }} />
              ))}
            </div>
          </>
        )}
      </div>

      <p className={styles.note}>
        {live
          ? `${formatClock(remaining)} left of the 10 minute limit`
          : starting
            ? "Waiting for the microphone."
            : "Up to 10 minutes."}
      </p>
    </div>
  );
}
