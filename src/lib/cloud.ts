import cloud from "d3-cloud";

export type Term = { term: string; weight: number };

export type Placed = {
  text: string;
  weight: number;
  size: number;
  x: number;
  y: number;
  colour: string;
};

const TONES = [
  { floor: 70, colour: "#141412" },
  { floor: 45, colour: "#3d3d36" },
  { floor: 25, colour: "#6e6e64" },
  { floor: 0, colour: "#a3a399" },
];

const LEAD_COLOUR = "#141412";

export function displayFont(): string {
  if (typeof window === "undefined") return "Georgia, serif";
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-display")
    .trim();
  return value || "Georgia, serif";
}

export async function layoutCloud(terms: Term[], width: number, height: number): Promise<Placed[]> {
  if (!terms.length || width < 40 || height < 40) return [];

  const font = displayFont();
  await ensureFont(font);

  const longest = terms.reduce((most, entry) => Math.max(most, entry.term.length), 1);
  const widthBound = (width * 1.6) / longest;
  const ceiling = Math.min(Math.max(Math.min(width / 8, widthBound), 20), 76);
  const floorSize = Math.max(ceiling * 0.26, 12);

  let best: Omit<Placed, "colour">[] = [];

  for (let attempt = 0; attempt < 5; attempt++) {
    const shrink = 1 - attempt * 0.15;
    const sized = terms.map((entry) => ({
      text: entry.term,
      weight: entry.weight,
      size: sizeFor(entry.weight, floorSize, ceiling) * shrink,
    }));

    const placed = await run(sized, width, height, font);
    if (placed.length > best.length) best = placed;
    if (best.length === terms.length) break;
  }

  const lead = terms[0]?.term;
  return centre(best, font).map((word) => ({
    ...word,
    colour: word.text === lead ? LEAD_COLOUR : toneFor(word.weight),
  }));
}

function centre<T extends { text: string; size: number; x: number; y: number }>(
  words: T[],
  font: string,
): T[] {
  const context = document.createElement("canvas").getContext("2d");
  if (!context || !words.length) return words;

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const word of words) {
    context.font = `700 ${word.size}px ${font}`;
    const metrics = context.measureText(word.text);
    const half = metrics.width / 2;
    const ascent = metrics.actualBoundingBoxAscent || word.size * 0.75;
    const descent = metrics.actualBoundingBoxDescent || word.size * 0.25;
    left = Math.min(left, word.x - half);
    right = Math.max(right, word.x + half);
    top = Math.min(top, word.y - ascent);
    bottom = Math.max(bottom, word.y + descent);
  }

  if (!Number.isFinite(left) || !Number.isFinite(top)) return words;

  const shiftX = (left + right) / 2;
  const shiftY = (top + bottom) / 2;
  return words.map((word) => ({ ...word, x: word.x - shiftX, y: word.y - shiftY }));
}

type CloudWord = { text: string; size: number; x?: number; y?: number };

function run(
  sized: { text: string; weight: number; size: number }[],
  width: number,
  height: number,
  font: string,
): Promise<Omit<Placed, "colour">[]> {
  return new Promise((resolve) => {
    const weights = new Map(sized.map((entry) => [entry.text, entry.weight]));
    cloud<CloudWord>()
      .size([width, height])
      .words(sized.map((entry) => ({ text: entry.text, size: entry.size })))
      .padding(width < 420 ? 2 : 4)
      .rotate(() => 0)
      .font(font)
      .fontWeight(700)
      .fontSize((word) => word.size ?? 12)
      .spiral("archimedean")
      .random(seeded())
      .on("end", (placed) => {
        resolve(
          placed.map((word) => ({
            text: word.text ?? "",
            weight: weights.get(word.text ?? "") ?? 1,
            size: word.size ?? 12,
            x: word.x ?? 0,
            y: word.y ?? 0,
          })),
        );
      })
      .start();
  });
}

function seeded(): () => number {
  let state = 0x2f6e2b1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function sizeFor(weight: number, floorSize: number, ceiling: number): number {
  const share = Math.min(1, Math.max(0, weight / 100));
  return floorSize + (ceiling - floorSize) * Math.pow(share, 0.75);
}

function toneFor(weight: number): string {
  return TONES.find((tone) => weight >= tone.floor)?.colour ?? TONES[TONES.length - 1].colour;
}

async function ensureFont(font: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.load(`700 48px ${font}`);
    await document.fonts.ready;
  } catch {
    return;
  }
}

export function drawToCanvas(
  words: Placed[],
  width: number,
  height: number,
  scale: number,
  background: string,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const font = displayFont();
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.translate(canvas.width / 2, canvas.height / 2);

  for (const word of words) {
    context.font = `700 ${word.size * scale}px ${font}`;
    context.fillStyle = word.colour;
    context.fillText(word.text, word.x * scale, word.y * scale);
  }

  return canvas;
}
