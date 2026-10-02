/**
 * The visitor's sound choice, as it is persisted between visits.
 *
 * - `on`: they turned sound on; it resumes at the first user activation of a later visit
 *   (browsers still require a gesture before audio may start).
 * - `off`: they muted it; nothing plays until they turn it back on.
 * - `unset`: no choice yet. The dive may start sound at the first activation; the page view and
 *   `prefers-reduced-motion` never do (`autoStartAllowed`).
 */
export type SoundPreference = 'on' | 'off' | 'unset';

/** Reads a stored value. Anything unknown (absent, corrupted, an old format) is `unset`. */
export const parseSoundPreference = (raw: string | null | undefined): SoundPreference =>
  raw === 'on' || raw === 'off' ? raw : 'unset';

/** The value to store, or `null` to remove the key (`unset` is never written). */
export const serializeSoundPreference = (preference: SoundPreference): string | null =>
  preference === 'unset' ? null : preference;
