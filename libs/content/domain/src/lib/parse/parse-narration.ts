import type { LocalizedText } from '../localized-text.js';
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
