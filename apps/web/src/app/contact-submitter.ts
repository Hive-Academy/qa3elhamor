import { createContactSubmitter } from './overlays/complaint-scroll';
import { SITE } from '../site.config';

/**
 * The site's one contact submitter: the provider chosen by `VITE_CONTACT_PROVIDER`, created once
 * per page load so every surface carrying the Bureau form (the dive's dialog, the page view)
 * sends through the same adapter and a misconfiguration warns once, not once per surface.
 * Deliveries arrive from `SITE.brand.contactFromName` (`site.config.ts`).
 */
export const CONTACT_SUBMITTER = createContactSubmitter(import.meta.env, {
  fromName: SITE.brand.contactFromName,
});
