import type { Credit } from '@qa3elhamor/content-domain';
import type { AudioSource } from '@qa3elhamor/world-audio';
import type { AudioConfig } from '../../site.config';

/** The music's sources as URLs under the deploy base (`import.meta.env.BASE_URL`), or null. */
export const musicSources = (
  config: AudioConfig,
  baseUrl: string,
): readonly AudioSource[] | null => {
  if (!config.music) return null;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return config.music.sources.map((source) => ({
    ...source,
    url: `${base}${source.url.replace(/^\/+/, '')}`,
  }));
};

/** Whether the site plays anything at all: no sound button otherwise. */
export const soundConfigured = (config: AudioConfig): boolean =>
  config.music !== null || config.ambience;

/** The editorial credit the music names (`creditId`), or null when there is no music. */
export const musicCredit = (
  config: AudioConfig,
  credits: readonly Credit[],
): Credit | null => {
  const id = config.music?.creditId;
  return id === undefined ? null : (credits.find((credit) => credit.id === id) ?? null);
};
