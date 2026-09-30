import {
  LINK_KINDS,
  SITE_COPY_KEYS,
  type Avatar,
  type ContactLink,
  type SiteCopy,
  type SiteProfile,
  type SkillGroup,
} from '../site-profile.js';
import {
  ASSET_URL,
  LINK_URL,
  checkUniqueIds,
  childPath,
  readList,
  readObject,
  readRecord,
  requiredEnum,
  requiredId,
  requiredObject,
  requiredText,
  requiredUrl,
  optionalText,
  stringItem,
  textItem,
  type ContentReader,
  type Fields,
} from './reader.js';

const readSkillGroup =
  (r: ContentReader) =>
  (value: unknown, path: string): SkillGroup => {
    const fields = readObject(r, value, path, ['id', 'label', 'skills']);
    return {
      id: requiredId<'SkillGroup'>(r, fields, path),
      label: requiredText(r, fields, path, 'label'),
      skills: readList(r, fields, path, 'skills', stringItem(r), { min: 1 }),
    };
  };

const readLink =
  (r: ContentReader) =>
  (value: unknown, path: string): ContactLink => {
    const fields = readObject(r, value, path, ['kind', 'label', 'url']);
    const link: ContactLink = {
      kind: requiredEnum(r, fields, path, 'kind', LINK_KINDS),
      label: requiredText(r, fields, path, 'label'),
      url: requiredUrl(r, fields, path, 'url', LINK_URL),
    };
    if (link.kind === 'email' && link.url !== '' && !link.url.startsWith('mailto:')) {
      r.fail(childPath(path, 'url'), 'an email link must be a "mailto:" URL');
    }
    return link;
  };

function readAvatar(r: ContentReader, fields: Fields, path: string): Avatar | undefined {
  if (fields['avatar'] === undefined || fields['avatar'] === null) return undefined;
  const at = childPath(path, 'avatar');
  const avatar = readObject(r, fields['avatar'], at, ['src', 'alt']);
  return {
    src: requiredUrl(r, avatar, at, 'src', ASSET_URL),
    alt: requiredText(r, avatar, at, 'alt'),
  };
}

function readProfile(r: ContentReader, site: Fields, path: string): SiteProfile {
  const at = childPath(path, 'profile');
  const fields = requiredObject(r, site, path, 'profile', [
    'name',
    'headline',
    'bio',
    'location',
    'avatar',
    'skills',
    'links',
  ]);
  const skills = readList(r, fields, at, 'skills', readSkillGroup(r), { optional: true });
  checkUniqueIds(r, skills, childPath(at, 'skills'));
  return {
    name: requiredText(r, fields, at, 'name'),
    headline: requiredText(r, fields, at, 'headline'),
    bio: readList(r, fields, at, 'bio', textItem(r), { min: 1 }),
    location: optionalText(r, fields, at, 'location'),
    avatar: readAvatar(r, fields, at),
    skills,
    links: readList(r, fields, at, 'links', readLink(r), { optional: true }),
  };
}

function readCopy(r: ContentReader, site: Fields, path: string): SiteCopy {
  const at = childPath(path, 'copy');
  const fields = requiredObject(r, site, path, 'copy', SITE_COPY_KEYS);
  return readRecord(SITE_COPY_KEYS, (key) => requiredText(r, fields, at, key));
}

/** Reads `content/site.json`: `{ profile, copy }`. */
export function readSiteFile(
  r: ContentReader,
  value: unknown,
  path: string
): { readonly profile: SiteProfile; readonly copy: SiteCopy } {
  const site = readObject(r, value, path, ['profile', 'copy']);
  return { profile: readProfile(r, site, path), copy: readCopy(r, site, path) };
}
