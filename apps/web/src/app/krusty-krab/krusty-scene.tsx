import type { LandmarkNarration } from '@qa3elhamor/content-domain';
import type { LandmarkSceneProps } from '@qa3elhamor/landmarks-feature';
import type { ComponentType } from 'react';
import { createNarratedVisitScene } from '../narrators/narrated-visit';
import type { StopView } from '../narrators/stop-view';
import type { NarratorChoice } from '../narrators.config';
import { KRUSTY_VISIT_COPY } from './krusty-copy';
import { krustyLayout, type MenuRowSlot } from './krusty-layout';
import { MenuBoard } from './menu-board';
import { menuComments, menuObjects } from './menu-objects';
import { ServicesMenu, type ServicesMenuContent } from './services-menu';

export interface KrustySceneContent extends ServicesMenuContent {
  readonly narration: LandmarkNarration;
  readonly narrator: NarratorChoice;
  readonly stop: StopView;
}

/**
 * The Krusty Krab's in-world scene (`LANDMARK_SCENES`), a narrated visit (`narrators/`): the
 * crab clerk talks through today's menu while a wooden menu board rises beside the restaurant
 * and flips over to show one row per service (`content/services.json`). Picking a row brings it
 * forward with the service's description and tags, its dish spins up over the board, and the
 * crab quotes the price. The full menu is one tap away at the end of the tour, and its dialog is
 * the fallback (`landmarks.config.ts`).
 */
export function createKrustyScene(
  content: KrustySceneContent,
): ComponentType<LandmarkSceneProps> {
  const { services, copy, narration } = content;
  return createNarratedVisitScene<MenuRowSlot>({
    narration,
    hints: menuComments(services, narration),
    narrator: content.narrator,
    stop: content.stop,
    objects: (lang) => menuObjects(services, lang, narration),
    layout: krustyLayout,
    Objects: MenuBoard,
    shape: 'slab',
    fullView: {
      render: ({ locale, dir }) => (
        <ServicesMenu
          services={services}
          copy={copy}
          locale={locale}
          dir={dir}
          variant="in-world"
        />
      ),
      icon: <span className="krusty-menu-icon" aria-hidden="true" />,
      doorHeight: 0.3,
    },
    words: KRUSTY_VISIT_COPY,
  });
}
