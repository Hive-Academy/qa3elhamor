/**
 * The one distinction between a contact message and a wall post.
 *
 * Contact and the public wall are the same aggregate - everything is a complaint filed with
 * the municipality - and visibility decides where it is routed. Visibility is fixed at
 * submission: no operation in this library changes it, so a private complaint can never be
 * published.
 */
export const VISIBILITIES = ['private', 'public'] as const;

export type Visibility = (typeof VISIBILITIES)[number];

/** Where a complaint of a given visibility is routed. */
export type ComplaintDestination = 'owner-inbox' | 'public-wall';

export const isVisibility = (value: unknown): value is Visibility =>
  typeof value === 'string' && (VISIBILITIES as readonly string[]).includes(value);

export const destinationOf = (visibility: Visibility): ComplaintDestination =>
  visibility === 'private' ? 'owner-inbox' : 'public-wall';
