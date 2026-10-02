import { narration, serviceItems } from '@qa3elhamor/content-data-access';
import {
  localize,
  type LandmarkNarration,
  type ServiceItem,
  type ServiceItemId,
} from '@qa3elhamor/content-domain';
import { describe, expect, it } from 'vitest';
import { visitScript } from '../narrators/visit-script';
import { menuComments, menuObjects } from './menu-objects';

const kelp: ServiceItem = {
  id: 'kelp' as ServiceItemId,
  menuName: { en: 'Kelp Shake', ar: 'ميلك شيك الطحالب' },
  title: { en: 'SaaS platforms' },
  description: { en: 'Platforms that hold.' },
  price: { en: 'Priced in kelp' },
  tags: ['Nx', 'NestJS'],
};
const patty: ServiceItem = {
  id: 'patty' as ServiceItemId,
  menuName: { en: 'Krabby Patty' },
  title: { en: 'Leadership' },
  description: { en: 'Teams that ship.' },
  tags: ['SDLC'],
};
/** First-strong isolated, as the copy wraps names in it. */
const iso = (text: string) => `⁨${text}⁩`;
const quiet: LandmarkNarration = { lines: [{ en: 'Welcome.' }] };

describe('menuObjects', () => {
  it('puts each service on the board as its dish, the real service under it', () => {
    const [shake] = menuObjects([kelp], 'en', quiet);
    expect(shake).toEqual({
      id: 'kelp',
      label: 'Kelp Shake',
      caption: ['SaaS platforms'],
      topic: `Price · ${iso('Kelp Shake')}`,
      detailLabel: `${iso('Kelp Shake')}, ${iso('SaaS platforms')}: what you get`,
      notes: ['Platforms that hold.'],
      chips: ['Nx', 'NestJS'],
    });
    const [arabic] = menuObjects([kelp], 'ar', quiet);
    expect(arabic?.label).toBe('ميلك شيك الطحالب');
    // An Arabic tag around a dish name: the name is isolated, so "·" stays between them.
    expect(arabic?.topic).toBe(`السعر · ${iso('ميلك شيك الطحالب')}`);
  });

  it('has the crab quote the price, unless the narration has its own line for the dish', () => {
    expect(menuComments([kelp, patty], quiet)).toEqual({
      kelp: kelp.price,
      patty: undefined,
    });
    const own: LandmarkNarration = {
      ...quiet,
      hints: { kelp: { en: 'Best seller.' } },
    };
    expect(menuComments([kelp], own)).toEqual({ kelp: { en: 'Best seller.' } });
    // The price is still on the dish, as a note, and the tag is just the dish.
    const [shake] = menuObjects([kelp], 'en', own);
    expect(shake?.topic).toBe('Kelp Shake');
    expect(shake?.notes).toEqual([
      'Platforms that hold.',
      `Price: ${iso('Priced in kelp')}`,
    ]);
  });

  it('keeps a dish with neither price nor line selectable, and silent', () => {
    const script = visitScript(quiet, 'en', menuComments([patty], quiet));
    expect(script.hints).toEqual({});
    expect(menuObjects([patty], 'en', quiet)[0]?.topic).toBe('Krabby Patty');
  });

  it('serves every real service, with the clerk commenting on each priced one', () => {
    const krusty = narration.landmarks['krusty-krab'];
    const objects = menuObjects(serviceItems, 'en', krusty);
    expect(objects.map((o) => o.id)).toEqual(serviceItems.map((s) => s.id));
    const script = visitScript(
      krusty,
      'en',
      menuComments(serviceItems, krusty),
    );
    for (const service of serviceItems)
      if (service.price && !krusty.hints?.[service.id])
        expect(script.hints[service.id]).toBe(localize(service.price, 'en'));
  });
});
