import {
  parseContent,
  type Content,
  type ContentFileKey,
  type ContentFiles,
  type ContentValidationError,
} from '@qa3elhamor/content-domain';
import { CONTENT_FILE_PATHS } from './content-files.js';

const isFileKey = (key: string): key is ContentFileKey => key in CONTENT_FILE_PATHS;

/** Rewrites `resume.items[0].id` as `content/resume.json → items[0].id`. */
const describeError = ({ path, message }: ContentValidationError): string => {
  const [, key = '', rest = ''] = /^([^.[]+)[.]?(.*)$/.exec(path) ?? [];
  const file = isFileKey(key) ? CONTENT_FILE_PATHS[key] : key;
  return `  ${file}${rest === '' ? '' : ` → ${rest}`}: ${message}`;
};

/** Thrown when the content files do not match the content model. */
export class ContentValidationFailure extends Error {
  constructor(readonly errors: readonly ContentValidationError[]) {
    super(
      `Invalid site content (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n` +
        errors.map(describeError).join('\n')
    );
    this.name = 'ContentValidationFailure';
  }
}

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

/**
 * Validates the content files and returns the frozen `Content`, or throws
 * `ContentValidationFailure` listing every problem. Throwing is deliberate: invalid content
 * must stop the build or the page load loudly rather than render a half-empty site.
 */
export function resolveContent(files: ContentFiles): Content {
  const result = parseContent(files);
  if (!result.ok) throw new ContentValidationFailure(result.error);
  return deepFreeze(result.value);
}
