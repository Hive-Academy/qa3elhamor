import { CanvasTexture, SRGBColorSpace } from 'three';

/*
 * Painted underwater signage: dense words (a tablet's inscription, a chalked menu row, a
 * bureau's heading) drawn by the browser's own 2D canvas onto a texture. The canvas shapes and
 * lays out Arabic right to left by itself, uses the page's own fonts, and costs one texture per
 * sign instead of a glyph mesh per letter. Decorative: the words must also exist as HTML.
 */

/** How the words are put on the surface. */
export type SignStyle =
  /** Cut into stone: dark grooves with a lit lower lip, on a transparent canvas (a decal). */
  | 'carved'
  /** Chalk on a slate: soft, slightly broken strokes, on a transparent canvas (a decal). */
  | 'chalk'
  /** Painted on a weathered board: its own planks, a painted frame and lettering. */
  | 'painted'
  /** Ink on old parchment: its own paper, a ruled border and a wax seal. */
  | 'parchment';

/** One run of text: a title, a caption line. Wraps to `maxLines`, ending in "…" if it must. */
export interface SignText {
  readonly text: string;
  /** Size in sign pixels (before the pixel-ratio scale). */
  readonly size: number;
  /** CSS font-weight. */
  readonly weight?: number;
  readonly family: string;
  readonly color?: string;
  readonly maxLines?: number;
  /** Letter spacing in px (ignored for Arabic, which is cursive). */
  readonly tracking?: number;
  readonly uppercase?: boolean;
}

export interface SignSpec {
  /** Logical size in sign pixels; the canvas is `pixelRatio` times bigger. */
  readonly width: number;
  readonly height: number;
  readonly style: SignStyle;
  readonly lines: readonly SignText[];
  /** Space between runs, in sign pixels. Default a quarter of the first run's size. */
  readonly gap?: number;
  /** Space kept clear at the edges, in sign pixels. Default 6% of the width. */
  readonly padding?: number;
  readonly pixelRatio?: number;
  /** Seeds the weathering, so each sign of a set looks a little different. */
  readonly seed?: number;
}

const ARABIC = /\p{Script=Arabic}/u;

/** Whether `text` reads right to left (its first strong character is Arabic). */
export function isRtlText(text: string): boolean {
  for (const char of text) {
    if (ARABIC.test(char)) return true;
    if (/\p{L}/u.test(char)) return false;
  }
  return false;
}

export const signFont = ({
  size,
  weight = 600,
  family,
}: Pick<SignText, 'size' | 'weight' | 'family'>): string =>
  `${weight} ${Math.round(size)}px ${family}`;

/**
 * Greedy word wrap of `text` into at most `maxLines` lines no wider than `maxWidth` (as
 * `measure` says). A word wider than a line is kept whole (the caller's size is too big); the
 * last line ends in "…" when words are left over. Pure: `measure` is the canvas's.
 */
export function wrapSignText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: (value: string) => number,
): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let index = 0;
  for (; index < words.length; index++) {
    const word = words[index] as string;
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) {
    lines.push(current);
    index = words.length;
  }
  if (index < words.length && lines.length > 0) {
    let last = `${lines[lines.length - 1]}…`;
    while (measure(last) > maxWidth && last.includes(' '))
      last = `${last.slice(0, last.lastIndexOf(' '))}…`;
    lines[lines.length - 1] = last;
  }
  return lines.slice(0, Math.max(maxLines, 1));
}

/** A tiny deterministic noise source (no Math.random: a redraw paints the same sign). */
function rng(seed: number): () => number {
  let s = Math.floor(Math.abs(seed) * 9973) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface LaidRun {
  readonly run: SignText;
  readonly font: string;
  readonly lines: readonly string[];
  readonly lineHeight: number;
  readonly rtl: boolean;
}

function layoutRuns(ctx: CanvasRenderingContext2D, spec: SignSpec, maxWidth: number): LaidRun[] {
  return spec.lines
    .filter((run) => run.text.trim().length > 0)
    .map((run) => {
      const rtl = isRtlText(run.text);
      const font = signFont(run);
      ctx.font = font;
      setTracking(ctx, rtl ? 0 : (run.tracking ?? 0));
      const text = run.uppercase && !rtl ? run.text.toUpperCase() : run.text;
      const lines = wrapSignText(
        text,
        maxWidth,
        run.maxLines ?? 2,
        (value) => ctx.measureText(value).width,
      );
      return {
        run,
        font,
        lines,
        lineHeight: run.size * (rtl ? 1.45 : 1.18),
        rtl,
      };
    });
}

/** Canvas letter spacing where the browser has it (a no-op elsewhere). */
function setTracking(ctx: CanvasRenderingContext2D, px: number): void {
  const withSpacing = ctx as CanvasRenderingContext2D & {
    letterSpacing?: string;
  };
  if ('letterSpacing' in withSpacing) withSpacing.letterSpacing = `${px}px`;
}

function drawBackground(ctx: CanvasRenderingContext2D, spec: SignSpec, random: () => number): void {
  const { width: w, height: h, style } = spec;
  if (style === 'painted') {
    // Planks, each its own shade, with grain and a dark seam.
    const planks = Math.max(2, Math.round(h / 70));
    const plank = h / planks;
    for (let i = 0; i < planks; i++) {
      const shade = 0.82 + random() * 0.2;
      ctx.fillStyle = `rgb(${Math.round(150 * shade)}, ${Math.round(98 * shade)}, ${Math.round(52 * shade)})`;
      ctx.fillRect(0, i * plank, w, plank);
      ctx.strokeStyle = 'rgba(60, 32, 12, 0.35)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 7; g++) {
        const y = i * plank + random() * plank;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(
          w * 0.3,
          y + (random() - 0.5) * 8,
          w * 0.7,
          y + (random() - 0.5) * 8,
          w,
          y,
        );
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40, 20, 8, 0.55)';
      ctx.fillRect(0, i * plank, w, 2);
    }
    // A painted frame, chipped by the sea.
    ctx.strokeStyle = '#f2d27a';
    ctx.lineWidth = Math.max(4, w * 0.012);
    ctx.strokeRect(w * 0.035, h * 0.06, w * 0.93, h * 0.88);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc(random() * w, random() * h, 1 + random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  if (style === 'parchment') {
    const paper = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.2,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.7,
    );
    paper.addColorStop(0, '#f6ecd2');
    paper.addColorStop(1, '#d9c296');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120, 84, 40, 0.08)';
    for (let i = 0; i < 160; i++)
      ctx.fillRect(random() * w, random() * h, 1 + random() * 2, 1 + random() * 2);
    ctx.strokeStyle = '#7a4b2a';
    ctx.lineWidth = Math.max(2, w * 0.006);
    ctx.strokeRect(w * 0.03, h * 0.08, w * 0.94, h * 0.84);
    ctx.lineWidth = 1;
    ctx.strokeRect(w * 0.045, h * 0.12, w * 0.91, h * 0.76);
  }
}

function drawRunLine(
  ctx: CanvasRenderingContext2D,
  style: SignStyle,
  text: string,
  x: number,
  y: number,
  run: SignText,
  random: () => number,
): void {
  const size = run.size;
  if (style === 'carved') {
    // The groove's shadowed upper wall, its lit lower lip, then the groove itself.
    ctx.fillStyle = 'rgba(255, 244, 214, 0.55)';
    ctx.fillText(text, x, y + size * 0.045);
    ctx.fillStyle = 'rgba(30, 18, 6, 0.6)';
    ctx.fillText(text, x, y - size * 0.03);
    ctx.fillStyle = run.color ?? '#4a3519';
    ctx.fillText(text, x, y);
    return;
  }
  if (style === 'chalk') {
    // A few passes, each a hair off, so the strokes look dragged rather than printed.
    ctx.fillStyle = run.color ?? '#f2f7ef';
    for (let pass = 0; pass < 3; pass++) {
      ctx.globalAlpha = pass === 0 ? 0.9 : 0.35;
      ctx.fillText(text, x + (random() - 0.5) * size * 0.04, y + (random() - 0.5) * size * 0.04);
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (style === 'painted') {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.strokeStyle = 'rgba(40, 18, 6, 0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = run.color ?? '#fff3cf';
    ctx.fillText(text, x, y);
    return;
  }
  ctx.fillStyle = run.color ?? '#2a2118';
  ctx.fillText(text, x, y);
}

/** Chalk dust: the strokes broken up a little, as chalk on a rough slate is. */
function breakChalk(ctx: CanvasRenderingContext2D, spec: SignSpec, random: () => number): void {
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  const specks = Math.round((spec.width * spec.height) / 260);
  for (let i = 0; i < specks; i++)
    ctx.fillRect(random() * spec.width, random() * spec.height, 1.4, 1.4);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Paints `spec` onto a 2D context already sized `spec.width * pixelRatio` by
 * `spec.height * pixelRatio`. The runs stack, centred both ways, each wrapped to the width.
 */
export function drawSign(ctx: CanvasRenderingContext2D, spec: SignSpec): void {
  const ratio = spec.pixelRatio ?? 1;
  const random = rng(spec.seed ?? 1);
  ctx.save();
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, spec.width, spec.height);
  drawBackground(ctx, spec, random);

  const padding = spec.padding ?? spec.width * 0.06;
  const runs = layoutRuns(ctx, spec, spec.width - 2 * padding);
  const gap = spec.gap ?? (spec.lines[0]?.size ?? 16) * 0.25;
  const total =
    runs.reduce((sum, run) => sum + run.lines.length * run.lineHeight, 0) +
    gap * Math.max(runs.length - 1, 0);
  let y = (spec.height - total) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const laid of runs) {
    ctx.font = laid.font;
    ctx.direction = laid.rtl ? 'rtl' : 'ltr';
    setTracking(ctx, laid.rtl ? 0 : (laid.run.tracking ?? 0));
    for (const line of laid.lines) {
      drawRunLine(ctx, spec.style, line, spec.width / 2, y + laid.lineHeight / 2, laid.run, random);
      y += laid.lineHeight;
    }
    y += gap;
  }
  setTracking(ctx, 0);
  if (spec.style === 'chalk') breakChalk(ctx, spec, random);
  ctx.restore();
}

/**
 * Paints `spec` onto `texture`'s canvas, resizing it to the spec, and flags the upload. For a
 * locale change, a font that arrived late, or a new pixel ratio.
 */
export function redrawSignTexture(texture: CanvasTexture, spec: SignSpec): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ratio = spec.pixelRatio ?? 1;
  const width = Math.max(1, Math.round(spec.width * ratio));
  const height = Math.max(1, Math.round(spec.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    // A new size needs a new GPU texture: three re-allocates on the next upload after dispose.
    texture.dispose();
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  drawSign(ctx, spec);
  texture.needsUpdate = true;
}

/**
 * A texture painted from `spec`. Null where the browser has no 2D canvas (the sign then stays
 * blank; its words are in the HTML). `anisotropy` should come from the quality profile.
 */
export function createSignTexture(
  spec: SignSpec,
  {
    anisotropy = 4,
    doc = document,
  }: { readonly anisotropy?: number; readonly doc?: Document } = {},
): CanvasTexture | null {
  const canvas = doc.createElement('canvas');
  if (!canvas.getContext('2d')) return null;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  redrawSignTexture(texture, spec);
  return texture;
}
