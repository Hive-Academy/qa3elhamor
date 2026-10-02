import { localize, type Locale, type LandmarkNarration } from '@qa3elhamor/content-domain';
import type { LandmarkSceneProps } from '@qa3elhamor/landmarks-feature';
import type { ComponentType } from 'react';
import { createNarratedVisitScene } from '../narrators/narrated-visit';
import type { StopView } from '../narrators/stop-view';
import type { VisitObject } from '../narrators/visit-types';
import type { NarratorChoice } from '../narrators.config';
import {
  CitizenshipCardInWorld,
  type CitizenshipCardContent,
} from '../overlays/citizenship-card';
import { fillCopy } from '../overlays/overlay-copy';
import { PINEAPPLE_VISIT_COPY } from './pineapple-copy';
import { pineappleLayout } from './pineapple-layout';
import { SkillBubbles, type SkillBubbleSlot } from './skill-bubbles';
import './pineapple.css';

export interface PineappleSceneContent extends CitizenshipCardContent {
  readonly narration: LandmarkNarration;
  readonly narrator: NarratorChoice;
  readonly stop: StopView;
}

/** The skill groups (`content/site.json`) as the visit's objects, in the visitor's language. */
export const skillGroupObjects = (
  profile: Pick<CitizenshipCardContent['profile'], 'skills'>,
  lang: Locale,
): VisitObject[] =>
  profile.skills.map((group) => {
    const label = localize(group.label, lang);
    return {
      id: group.id,
      label,
      detailLabel: fillCopy(PINEAPPLE_VISIT_COPY[lang].skillsOf, { group: label }),
      chips: group.skills,
    };
  });

/**
 * The Pineapple's in-world scene (`LANDMARK_SCENES`), a narrated visit (`narrators/`): the
 * narrator gives the tour while the owner's skill groups drift out of the door as glowing
 * bubbles; the narrator comments on the one the visitor picks (the narration's `hints`). The
 * full Citizenship Card is one tap away at the end of the tour, and its dialog stays the
 * fallback (`landmarks.config.ts`).
 */
export function createPineappleScene(
  content: PineappleSceneContent,
): ComponentType<LandmarkSceneProps> {
  return createNarratedVisitScene<SkillBubbleSlot>({
    narration: content.narration,
    narrator: content.narrator,
    stop: content.stop,
    objects: (lang) => skillGroupObjects(content.profile, lang),
    layout: (view, count, ground) => {
      const { narrator, bubbles } = pineappleLayout(view, count, ground);
      return { narrator, slots: bubbles };
    },
    Objects: SkillBubbles,
    fullView: {
      render: ({ locale, dir }) => (
        <CitizenshipCardInWorld {...content} locale={locale} dir={dir} />
      ),
      icon: <span className="pa-card-icon" aria-hidden="true" />,
    },
    words: PINEAPPLE_VISIT_COPY,
  });
}
