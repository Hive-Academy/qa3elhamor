import type { LocalizedText } from '../localized-text.js';
import type { SkillGroup } from '../site-profile.js';
import {
  NARRATION_LANDMARKS,
  NARRATION_LIMITS,
  type LandmarkNarration,
  type Narration,
  type NarrationLandmarkId,
} from '../narration.js';
import {
  checkUniqueIds,
  childPath,
  itemPath,
  optionalText,
  readList,
  readObject,
  readRecord,
  requiredId,
  requiredObject,
  requiredText,
  textItem,
  type ContentReader,
  type Fields,
  type ItemReader,
} from './reader.js';

const { minLines, maxLines, maxEnLength } = NARRATION_LIMITS;

/** Reports English text longer than one speech bubble holds. */
function checkLength(r: ContentReader, text: LocalizedText | undefined, path: string): void {
  if (text !== undefined && text.en.length > maxEnLength) {
    r.fail(
      path,
      `must be at most ${maxEnLength} characters in English, got ${text.en.length}`
    );
  }
}

interface Hint {
  readonly id: string;
  readonly text: LocalizedText;
}

/**
 * The file stores hints as a list of `{ id, text }` (the CMS has no map widget); the domain
 * exposes them as a record keyed by id.
 */
const readHint =
  (r: ContentReader): ItemReader<Hint> =>
  (value, path) => {
    const fields = readObject(r, value, path, ['id', 'text']);
    const text = requiredText(r, fields, path, 'text');
    checkLength(r, text, childPath(path, 'text'));
    return { id: requiredId<'NarrationHint'>(r, fields, path), text };
  };

const LANDMARK_KEYS = ['lines', 'hints', 'farewell'];

const readLandmark =
  (r: ContentReader, landmarks: Fields, landmarksPath: string) =>
  (key: NarrationLandmarkId): LandmarkNarration => {
    const fields = requiredObject(r, landmarks, landmarksPath, key, LANDMARK_KEYS);
    const path = childPath(landmarksPath, key);

    const linesPath = childPath(path, 'lines');
    const lines = readList(r, fields, path, 'lines', textItem(r), { min: minLines });
    if (lines.length > maxLines) {
      r.fail(linesPath, `expected at most ${maxLines} item(s), got ${lines.length}`);
    }
    lines.forEach((line, index) => checkLength(r, line, itemPath(linesPath, index)));

    const hintList = readList(r, fields, path, 'hints', readHint(r), { optional: true });
    checkUniqueIds(r, hintList, childPath(path, 'hints'));

    const farewell = optionalText(r, fields, path, 'farewell');
    checkLength(r, farewell, childPath(path, 'farewell'));

    return {
      lines,
      ...(hintList.length > 0 && {
        hints: Object.fromEntries(hintList.map((hint) => [hint.id, hint.text])),
      }),
      ...(farewell !== undefined && { farewell }),
    };
  };

/** Reads `content/narration.json`: `{ landmarks: { <landmark id>: { lines, hints?, farewell? } } }`. */
export function readNarrationFile(r: ContentReader, value: unknown, path: string): Narration {
  const file = readObject(r, value, path, ['landmarks']);
  const landmarks = requiredObject(r, file, path, 'landmarks', NARRATION_LANDMARKS);
  return {
    landmarks: readRecord<NarrationLandmarkId, LandmarkNarration>(
      NARRATION_LANDMARKS,
      readLandmark(r, landmarks, childPath(path, 'landmarks'))
    ),
  };
}

/**
 * Cross-file: the pineapple's hints are keyed by skill group id (`site.profile.skills`), one per
 * group. A group without a hint leaves the narrator silent when the visitor picks its bubble; a
 * hint naming no group is never said. Both are errors, so the build stops on them.
 *
 * Both sides are optional (a site may have no skill groups, or no pineapple hints at all, and
 * the narrator then says nothing about the bubbles); once both exist, they must pair up.
 *
 * Run only once every file has read cleanly: a malformed id is then reported once, as itself,
 * rather than again as a pairing problem.
 */
export function checkSkillHints(
  r: ContentReader,
  skills: readonly SkillGroup[],
  narration: Narration
): void {
  const path = 'narration.landmarks.pineapple.hints';
  const hints = narration.landmarks.pineapple.hints;
  if (skills.length === 0 || hints === undefined) return;
  const groups = new Set<string>(skills.map((group) => group.id));
  for (const group of skills) {
    if (!Object.hasOwn(hints, group.id)) {
      r.fail(path, `no hint for skill group "${group.id}" (site.profile.skills)`);
    }
  }
  for (const id of Object.keys(hints)) {
    if (!groups.has(id)) {
      r.fail(path, `hint "${id}" matches no skill group in site.profile.skills`);
    }
  }
}
