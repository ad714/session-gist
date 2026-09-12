import type { Term } from "./cloud";

export type Analysis = { terms: Term[]; transcript: string };

export function analyse(
  mp3: Blob,
  onUpload: (percent: number) => void,
  onSent: () => void,
): Promise<Analysis> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", mp3, "session.mp3");
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "json");
    form.append("language", "en");
    form.append("temperature", "0");

    const request = new XMLHttpRequest();
    request.open("POST", "/api/analyze");
    request.timeout = 120000;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onUpload(Math.round((event.loaded / event.total) * 100));
    };
    request.upload.onload = () => {
      onUpload(100);
      onSent();
    };
    request.onerror = () =>
      reject(new Error("We could not reach the server. Check your connection and try again."));
    request.ontimeout = () =>
      reject(new Error("The server took too long to answer. Try again in a moment."));

    request.onload = () => {
      const payload = parse(request.responseText);
      if (request.status >= 200 && request.status < 300 && Array.isArray(payload.terms)) {
        resolve({ terms: payload.terms as Term[], transcript: String(payload.transcript ?? "") });
        return;
      }
      const message =
        typeof payload.error === "string"
          ? payload.error
          : `The server answered ${request.status}. Try again.`;
      reject(new Error(message));
    };

    request.send(form);
  });
}

function parse(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
