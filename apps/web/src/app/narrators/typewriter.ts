import { useEffect, useRef, useState } from 'react';

/** Characters a second, for ordinary letters: a brisk but readable speaking pace. */
export const TYPE_CPS = 42;

/** Extra beats (in characters' worth of time) after punctuation, so the typing breathes. */
const PAUSE_AFTER: Readonly<Record<string, number>> = {
  '.': 7,
  '!': 7,
  '?': 7,
  ':': 5,
  ';': 4,
  ',': 3,
  '،': 3,
  '؟': 7,
};

/** The time each character's arrival costs, in characters' worth, cumulative. */
function costs(text: string): number[] {
  const chars = Array.from(text);
  const out: number[] = [];
  let total = 0;
  chars.forEach((char, i) => {
    total += 1;
    out.push(total);
    // The pause belongs after the mark, unless the text ends there.
    if (i < chars.length - 1) total += PAUSE_AFTER[char] ?? 0;
  });
  return out;
}

/** Seconds to type `text` at `cps`. */
export function typingSeconds(text: string, cps = TYPE_CPS): number {
  const all = costs(text);
  return cps > 0 ? (all[all.length - 1] ?? 0) / cps : 0;
}

/**
 * How many characters (code points) of `text` show `seconds` after typing began: one per
 * `1 / cps`, with a pause after punctuation. Clamped to [0, length]; never NaN.
 */
export function typedLength(
  text: string,
  seconds: number,
  cps = TYPE_CPS,
): number {
  const all = costs(text);
  if (!(seconds > 0) || !(cps > 0)) return 0;
  const budget = seconds * cps;
  let count = 0;
  while (count < all.length && (all[count] ?? Infinity) <= budget) count += 1;
  return count;
}

/** Splits `text` after its first `count` code points: what is typed, and what is still to come. */
export function splitTyped(text: string, count: number): [string, string] {
  const chars = Array.from(text);
  return [chars.slice(0, count).join(''), chars.slice(count).join('')];
}

/**
 * Types `text` out while `typing`: returns how many characters show. Restarts whenever `take`
 * changes. Calls `onTyped` once when the end is reached. Not typing: the whole text shows.
 * `instant` (reduced motion, or a caller that wants no typing): the whole line shows at once,
 * and `onTyped` is still called, once per take, so the dialogue moves on as usual.
 */
export function useTypewriter(
  text: string,
  typing: boolean,
  take: number,
  onTyped: () => void,
  {
    cps = TYPE_CPS,
    instant = false,
  }: { readonly cps?: number; readonly instant?: boolean } = {},
): number {
  const total = Array.from(text).length;
  const [shown, setShown] = useState(typing && !instant ? 0 : total);
  const done = useRef(onTyped);
  useEffect(() => {
    done.current = onTyped;
  });

  useEffect(() => {
    if (!typing) {
      setShown(total);
      return undefined;
    }
    if (instant) {
      setShown(total);
      done.current();
      return undefined;
    }
    setShown(0);
    const start = performance.now();
    const timer = window.setInterval(() => {
      const count = typedLength(text, (performance.now() - start) / 1000, cps);
      setShown(count);
      if (count >= total) {
        window.clearInterval(timer);
        done.current();
      }
    }, 28);
    return () => window.clearInterval(timer);
  }, [text, typing, take, total, cps, instant]);

  return typing && !instant ? shown : total;
}
