/**
 * The cache tag every wall listing response carries (`Cache-Tag`, `Netlify-Cache-Tag`), so a
 * CDN can drop all cached wall pages at once instead of waiting for them to expire.
 */
export const WALL_CACHE_TAG = 'complaints-wall';

/**
 * Removes cached copies of the public wall from shared caches (CDN edges).
 *
 * Called after a moderation decision takes a complaint OFF the wall (an approved complaint
 * rejected or deleted), so withdrawn text stops being served before `WALL_CACHE_HEADERS`
 * would let it expire. Approving needs no purge: a new complaint appearing up to a minute late
 * harms nobody. An implementation must not throw for an unreachable CDN in a way that undoes
 * the decision: the moderation handler has already committed it, reports a purge failure and
 * still answers 200.
 */
export interface CachePurger {
  purgeWall(): Promise<void>;
}

/**
 * The default: nothing to purge. Correct when no shared cache sits in front of the API (local
 * dev, a host without CDN caching); on a CDN it means withdrawn complaints can stay visible
 * for the cache window documented on `WALL_CACHE_HEADERS`. Replace it in the composition root
 * with the host's purge call (docs/security.md, "CDN purge").
 */
export const noopCachePurger: CachePurger = {
  purgeWall: () => Promise.resolve(),
};
