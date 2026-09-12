import { useEffect, useRef, useState } from "react";
import { type Placed, type Term, drawToCanvas, layoutCloud } from "@/lib/cloud";
import styles from "@/app.module.css";

const INSET = 26;

export default function Cloud({ terms, children }: { terms: Term[]; children?: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [render, setRender] = useState<{ words: Placed[]; width: number; height: number } | null>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      clearTimeout(timer);
      timer = setTimeout(() => {
        setBox((current) => {
          const width = Math.round(rect.width);
          const height = Math.round(rect.height);
          return current.width === width && current.height === height ? current : { width, height };
        });
      }, 140);
    });
    observer.observe(node);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!box.width || !box.height || !terms.length) return;
    const run = ++token.current;
    const width = box.width;
    const height = box.height;
    layoutCloud(terms, width - INSET, height - INSET).then((placed) => {
      if (run !== token.current) return;
      setRender({ words: placed, width, height });
    });
  }, [terms, box]);

  const download = () => {
    if (!render?.words.length) return;
    const surface = readToken("--surface", "#ffffff");
    const canvas = drawToCanvas(render.words, render.width, render.height, 2, surface);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `session-gist-${stamp()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const strongest = terms
    .slice(0, 5)
    .map((entry) => entry.term)
    .join(", ");

  return (
    <>
      <div className={styles.stage} ref={host}>
        {render && render.words.length > 0 ? (
          <svg
            className={styles.cloudSvg}
            viewBox={`0 0 ${render.width} ${render.height}`}
            role="img"
            aria-label={`Word cloud of the session. Strongest terms: ${strongest}.`}
          >
            <g transform={`translate(${render.width / 2}, ${render.height / 2})`}>
              {render.words.map((word) => (
                <text
                  key={word.text}
                  x={word.x}
                  y={word.y}
                  textAnchor="middle"
                  fontSize={word.size}
                  fontWeight={700}
                  fill={word.colour}
                >
                  {word.text}
                </text>
              ))}
            </g>
          </svg>
        ) : (
          <ul className={styles.fallbackList}>
            {terms.map((entry) => (
              <li key={entry.term}>{entry.term}</li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.stageActions}>
        <button type="button" className={styles.primary} onClick={download} disabled={!render?.words.length}>
          Download PNG
        </button>
        {children}
      </div>
    </>
  );
}

function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function stamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}
