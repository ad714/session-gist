"use client";

import { useRef, useState } from "react";
import { ACCEPTED_LABELS } from "@/lib/audio";
import styles from "@/app/page.module.css";

type Props = {
  disabled: boolean;
  onPick: (file: File) => void;
};

export default function Uploader({ disabled, onPick }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onPick(file);
  };

  return (
    <div
      className={`${styles.door} ${styles.drop} ${over ? styles.dropOver : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!disabled) take(event.dataTransfer.files);
      }}
    >
      <p className={styles.doorTitle}>Upload a file</p>
      <div className={styles.doorBody}>
        <p className={styles.note}>Drop it here, or</p>
        <button type="button" className={styles.link} onClick={() => input.current?.click()} disabled={disabled}>
          choose a file
        </button>
      </div>
      <p className={styles.formats}>{ACCEPTED_LABELS} · up to 25 MB</p>
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.webm,.flac"
        className={styles.hiddenInput}
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
