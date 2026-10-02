/**
 * The ambient-audio check, as a pure function over what the build contains: every audio file
 * stays under its per-file budget, and no page loads audio up front (the music downloads only
 * once the visitor turns sound on, through the `<audio>` element the sound engine creates).
 */

/** Files the check treats as audio. */
export const AUDIO_FILE = /\.(?:opus|ogg|oga|m4a|mp4a|aac|mp3|wav|flac|webm)$/i;

/** One built file and its size in bytes. */
export interface BuiltFile {
  readonly path: string;
  readonly bytes: number;
}

export interface AudioAudit {
  readonly lines: readonly string[];
  readonly violations: readonly string[];
}

const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

/**
 * `files`: every file in the build (dist-relative paths). `pages`: each up-front page's HTML by
 * name (`index.html`, ...). `upFront`: the dist paths each page loads before the visitor does
 * anything (its static JS, CSS and preloads), which must contain no audio either.
 */
export function auditAudio({
  files,
  pages,
  upFront,
  maxFileBytes,
}: {
  readonly files: readonly BuiltFile[];
  readonly pages: Readonly<Record<string, string>>;
  readonly upFront: readonly string[];
  readonly maxFileBytes: number;
}): AudioAudit {
  const lines: string[] = [];
  const violations: string[] = [];
  const audio = files.filter((file) => AUDIO_FILE.test(file.path));

  const largest = [...audio].sort((a, b) => b.bytes - a.bytes)[0];
  lines.push(
    `audio files    ${audio.length}${largest ? `, largest ${largest.path} ${kib(largest.bytes)}` : ''} of ${kib(maxFileBytes)} each`,
  );
  for (const file of audio) {
    if (file.bytes > maxFileBytes) {
      violations.push(
        `Audio ${file.path} is ${kib(file.bytes)}, over the ${kib(maxFileBytes)} per-file budget. ` +
          'Re-encode it (shorter loop, lower bitrate: docs/audio.md).',
      );
    }
  }

  const loadedUpFront: string[] = [];
  for (const [page, html] of Object.entries(pages)) {
    const referenced = audio.filter((file) => html.includes(file.path.split('/').at(-1) ?? file.path));
    const audioTags = /<(?:audio|video)\b|<link\b[^>]*\bas\s*=\s*["']?(?:audio|video)\b/i.test(html);
    if (referenced.length > 0 || audioTags) {
      loadedUpFront.push(page);
      violations.push(
        `${page} loads or preloads audio up front` +
          (referenced.length > 0 ? ` (${referenced.map((f) => f.path).join(', ')})` : '') +
          '. Audio must download only after the visitor turns sound on.',
      );
    }
  }
  const eager = upFront.filter((path) => AUDIO_FILE.test(path));
  if (eager.length > 0) {
    loadedUpFront.push(...eager);
    violations.push(`Audio is in the initial load: ${eager.join(', ')}.`);
  }
  lines.push(`audio up front ${loadedUpFront.length === 0 ? 'none' : loadedUpFront.join(', ')}`);
  return { lines, violations };
}
