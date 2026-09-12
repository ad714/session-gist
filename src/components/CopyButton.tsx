import { useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  label: string;
  className: string;
};

export default function CopyButton({ text, label, className }: Props) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    setState((await write(text)) ? "done" : "failed");
    timer.current = setTimeout(() => setState("idle"), 2000);
  };

  return (
    <button type="button" className={className} onClick={copy}>
      {state === "done" ? "Copied" : state === "failed" ? "Could not copy" : label}
    </button>
  );
}

async function write(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyWrite(text);
  }
}

function legacyWrite(text: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-2000px";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
