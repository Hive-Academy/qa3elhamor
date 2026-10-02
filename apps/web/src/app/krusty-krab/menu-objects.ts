import {
  localize,
  type LandmarkNarration,
  type Locale,
  type LocalizedText,
  type ServiceItem,
} from '@qa3elhamor/content-domain';
import type { VisitObject } from '../narrators/visit-types';
import { fillCopy } from '../overlays/overlay-copy';
import { KRUSTY_VISIT_COPY } from './krusty-copy';

/**
 * A name inside a sentence of the other direction (an English dish in an Arabic tag): wrapped
 * in first-strong isolates, so the separator and the words around it keep their order.
 */
const isolate = (text: string): string => `⁨${text}⁩`;

/**
 * What the crab clerk says about a dish: the Krusty Krab's narration hint for that service id
 * when `content/narration.json` has one, otherwise the dish's playful price (`price` in
 * `content/services.json`). A service with neither is still selectable, and silent.
 */
export const menuComments = (
  services: readonly ServiceItem[],
  narration: LandmarkNarration,
): Readonly<Record<string, LocalizedText | undefined>> =>
  Object.fromEntries(
    services.map((service) => [
      service.id,
      narration.hints?.[service.id] ?? service.price,
    ]),
  );

/**
 * The services (`content/services.json`) as rows on the Krusty Krab's menu board: the dish's
 * menu name, the real service under it. Selecting one shows its description and tags; the price
 * is the crab's comment, or (when the narration has its own line for the dish) a note.
 */
export function menuObjects(
  services: readonly ServiceItem[],
  lang: Locale,
  narration: LandmarkNarration,
): VisitObject[] {
  const words = KRUSTY_VISIT_COPY[lang];
  return services.map((service) => {
    const dish = localize(service.menuName, lang);
    const title = localize(service.title, lang);
    const ownLine = narration.hints?.[service.id] !== undefined;
    const price = service.price && localize(service.price, lang);
    const notes = [localize(service.description, lang)];
    if (ownLine && price)
      notes.push(fillCopy(words.priceNote, { price: isolate(price) }));
    return {
      id: service.id,
      label: dish,
      caption: [title],
      topic:
        ownLine || !price
          ? dish
          : fillCopy(words.priceOf, { dish: isolate(dish) }),
      detailLabel: fillCopy(words.detailOf, {
        dish: isolate(dish),
        service: isolate(title),
      }),
      notes,
      chips: service.tags,
    };
  });
}
