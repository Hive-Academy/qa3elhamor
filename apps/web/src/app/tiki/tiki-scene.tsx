import type { LandmarkNarration } from '@qa3elhamor/content-domain';
import type { LandmarkSceneProps } from '@qa3elhamor/landmarks-feature';
import type { ComponentType } from 'react';
import { createNarratedVisitScene } from '../narrators/narrated-visit';
import type { StopView } from '../narrators/stop-view';
import type { NarratorChoice } from '../narrators.config';
import {
  ExperienceRecord,
  type ExperienceRecordContent,
} from './experience-record';
import { jobObjects, jobReviews } from './job-objects';
import { StoneTablets } from './stone-tablets';
import { TIKI_VISIT_COPY } from './tiki-copy';
import { tikiLayout, type TabletSlot } from './tiki-layout';

export interface TikiSceneContent extends ExperienceRecordContent {
  readonly narration: LandmarkNarration;
  readonly narrator: NarratorChoice;
  readonly stop: StopView;
}

/**
 * The Tiki head's in-world scene (`LANDMARK_SCENES`), a narrated visit (`narrators/`): the
 * narrator reads the performance reviews while one carved stone tablet per job rises out of the
 * sand before the tiki. Picking a tablet brings it forward with its highlights and tech, and
 * the narrator reads that job's review (its `quip` in `content/resume.json`). The full record is
 * one tap away at the end of the tour, and its dialog is the fallback (`landmarks.config.ts`).
 */
export function createTikiScene(
  content: TikiSceneContent,
): ComponentType<LandmarkSceneProps> {
  const { entries, copy } = content;
  return createNarratedVisitScene<TabletSlot>({
    narration: content.narration,
    hints: jobReviews(entries),
    narrator: content.narrator,
    stop: content.stop,
    objects: (lang) => jobObjects(entries, lang),
    layout: tikiLayout,
    Objects: StoneTablets,
    shape: 'slab',
    // The tablets rise from the sand at the tiki's foot.
    doorHeight: 0.05,
    fullView: {
      render: ({ locale, dir }) => (
        <ExperienceRecord
          entries={entries}
          copy={copy}
          locale={locale}
          dir={dir}
          variant="in-world"
        />
      ),
      icon: <span className="tiki-record-icon" aria-hidden="true" />,
      doorHeight: 0.12,
    },
    words: TIKI_VISIT_COPY,
  });
}
