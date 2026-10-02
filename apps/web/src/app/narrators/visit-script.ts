import {
  localize,
  type LandmarkNarration,
  type Locale,
  type LocalizedText,
} from '@qa3elhamor/content-domain';
import type { DialogueScript } from './dialogue';

/**
 * Where the narrator's comments on the content objects come from:
 * - `'narration'`: the landmark's `hints` in `content/narration.json`, keyed by object id (the
 *   Pineapple's skill groups);
 * - a record of lines by object id, supplied by the content the objects are built from (the
 *   Tiki reads each job's performance-review `quip` from `content/resume.json`). An object with
 *   no line is still selectable; the narrator just has nothing to add.
 */
export type HintSource = 'narration' | Readonly<Record<string, LocalizedText | undefined>>;

/** The narrator's script for one landmark, in the visitor's language. */
export function visitScript(
  narration: LandmarkNarration,
  lang: Locale,
  source: HintSource = 'narration',
): DialogueScript {
  const lines = source === 'narration' ? (narration.hints ?? {}) : source;
  const hints: Record<string, string> = {};
  for (const [id, text] of Object.entries(lines))
    if (text) hints[id] = localize(text, lang);
  return {
    lines: narration.lines.map((line) => localize(line, lang)),
    hints,
    farewell: narration.farewell && localize(narration.farewell, lang),
  };
}
