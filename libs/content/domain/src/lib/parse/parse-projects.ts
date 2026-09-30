import {
  PROJECT_LINK_KINDS,
  type ProjectItem,
  type ProjectLink,
  type ProjectMedia,
} from '../project-item.js';
import { optionalPeriod, readCollectionFile } from './parse-collections.js';
import {
  ASSET_URL,
  WEB_URL,
  childPath,
  optionalBoolean,
  optionalInteger,
  optionalText,
  readList,
  readObject,
  requiredEnum,
  requiredId,
  requiredText,
  requiredUrl,
  stringItem,
  textItem,
  type ContentReader,
  type Fields,
  type ItemReader,
} from './reader.js';

const readProjectLink =
  (r: ContentReader): ItemReader<ProjectLink> =>
  (value, path) => {
    const fields = readObject(r, value, path, ['kind', 'label', 'url']);
    return {
      kind: requiredEnum(r, fields, path, 'kind', PROJECT_LINK_KINDS),
      label: optionalText(r, fields, path, 'label'),
      url: requiredUrl(r, fields, path, 'url', WEB_URL),
    };
  };

function readMedia(r: ContentReader, fields: Fields, path: string): ProjectMedia | undefined {
  if (fields['media'] === undefined || fields['media'] === null) return undefined;
  const at = childPath(path, 'media');
  const media = readObject(r, fields['media'], at, ['src', 'alt']);
  return {
    src: requiredUrl(r, media, at, 'src', ASSET_URL),
    alt: requiredText(r, media, at, 'alt'),
  };
}

const readProjectItem =
  (r: ContentReader): ItemReader<ProjectItem> =>
  (value, path) => {
    const fields = readObject(r, value, path, [
      'id',
      'title',
      'summary',
      'description',
      'highlights',
      'role',
      'period',
      'tech',
      'links',
      'media',
      'featured',
      'order',
    ]);
    return {
      id: requiredId<'ProjectItem'>(r, fields, path),
      title: requiredText(r, fields, path, 'title'),
      summary: requiredText(r, fields, path, 'summary'),
      description: optionalText(r, fields, path, 'description'),
      highlights: readList(r, fields, path, 'highlights', textItem(r), { optional: true }),
      role: optionalText(r, fields, path, 'role'),
      period: optionalPeriod(r, fields, path),
      tech: readList(r, fields, path, 'tech', stringItem(r), { optional: true }),
      links: readList(r, fields, path, 'links', readProjectLink(r), { optional: true }),
      media: readMedia(r, fields, path),
      featured: optionalBoolean(r, fields, path, 'featured') ?? false,
      order: optionalInteger(r, fields, path, 'order'),
    };
  };

/** Reads `content/projects.json`: `{ items: [...] }`. */
export const readProjectsFile = (r: ContentReader, value: unknown, path: string) =>
  readCollectionFile(r, value, path, readProjectItem(r));
