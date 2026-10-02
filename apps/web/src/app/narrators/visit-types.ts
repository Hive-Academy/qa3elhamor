import type { LandmarkNarration, Locale } from '@qa3elhamor/content-domain';
import type { ComponentType, ReactNode, RefObject } from 'react';
import type { NarratorChoice } from '../narrators.config';
import type { SelectSource } from './object-selection';
import type { ScreenInsets } from './screen-placement';
import type { StopView } from './stop-view';
import type { Vec3, ViewFrame } from './view-layout';
import type { NarratorPlacement } from './visit-layout';
import type { HintSource } from './visit-script';

/*
 * The narrated-visit kit's contract. A landmark supplies its narration, its content objects (as
 * DOM views, a layout and a 3D component) and its full view; the kit does the rest (narrator,
 * speech bubble, dialogue, selection, labels, panel, leaving, the full view's flight).
 */

/** One content object as the visitor reads it: its label, and what selecting it shows. */
export interface VisitObject {
  readonly id: string;
  /** The label's main line (and the start of its accessible name). */
  readonly label: string;
  /** Smaller lines under it on the label: the Tiki's company and dates. */
  readonly caption?: readonly string[];
  /** The bubble's topic tag while the narrator comments on it. Default `label`. */
  readonly topic?: string;
  /** The accessible name of what selecting it shows ("Backend: skills"). */
  readonly detailLabel: string;
  /** Sentences shown when selected (the Tiki's highlights). */
  readonly notes?: readonly string[];
  /** Short chips shown when selected (skills, tech). */
  readonly chips: readonly string[];
}

/** Words a landmark's visit adds to the kit's own (`NARRATOR_COPY`). */
export interface VisitWords {
  /** The end-of-tour action that opens the full view. */
  readonly openFull: string;
  /** The accessible name of the objects' label list. */
  readonly objectsList: string;
}

/** The composition for one viewport: the narrator's post and one slot per object. */
export interface VisitLayout<Slot> {
  readonly narrator: NarratorPlacement;
  /**
   * Other spots to try, in order, when the first is hidden behind the town or off screen
   * (`narrator-post.ts`). The kit always adds a last resort: the first spot, nearer the visitor.
   */
  readonly narratorAlternatives?: readonly NarratorPlacement[];
  readonly slots: readonly Slot[];
}

/** What the landmark's 3D objects component is given. It draws them, and keeps their DOM over them. */
export interface VisitObjectsProps<Slot> {
  /** One object per id, in order. */
  readonly ids: readonly string[];
  readonly slots: readonly Slot[];
  /** The point on the landmark facing the visitor (world), kept current by the kit. */
  readonly door: { readonly current: Vec3 };
  /** True: out around the landmark. False: put away (back in the door, down into the sand). */
  readonly out: boolean;
  readonly selected: string | null;
  readonly reducedMotion: boolean;
  /** Pointer picks on the meshes; gate them with `acceptsPick`. */
  readonly onPick: (id: string, source: SelectSource) => void;
  /** The objects' DOM labels, by index: place them with `placeObjectDom` every frame. */
  readonly labels: RefObject<(HTMLElement | null)[]>;
  /** The selected object's detail panel (desktop); null on narrow screens. */
  readonly panel: RefObject<HTMLElement | null>;
  /** Screen space kept clear for the page chrome. */
  readonly insets: ScreenInsets;
  /**
   * The objects' words drawn in the water (SDF text or painted signage) instead of over them in
   * the DOM; null shows the DOM labels' text. Either way the DOM labels stay the buttons.
   */
  readonly oceanLabels?: OceanLabels | null;
}

/** What an objects component needs to draw its own labels in the water. */
export interface OceanLabels {
  /** The objects as the visitor reads them, in `ids` order. */
  readonly objects: readonly VisitObject[];
  /** The SDF text's font (`OceanText fontUrl`). */
  readonly fontUrl: string;
  /** Texture filtering for painted labels, from the quality profile. */
  readonly anisotropy: number;
  /** The page's direction: painted signs set their words by their own script anyway. */
  readonly locale: Locale;
  /** The font failed: the page goes back to the DOM labels. */
  readonly onError: (error: unknown) => void;
}

export interface VisitFullView {
  /**
   * The landmark's full content (the Pineapple's Citizenship Card, the Tiki's record): real DOM
   * that flies out of the landmark when the visitor asks for it. Its first `article` takes focus.
   */
  readonly render: (props: {
    readonly locale: string;
    readonly dir: 'ltr' | 'rtl';
  }) => ReactNode;
  /** A small glyph on the "open" action. */
  readonly icon?: ReactNode;
  /** Where on the model it comes out (fraction of its height). Default 0.16. */
  readonly doorHeight?: number;
  /** Screen pixels it settles above the viewport centre. Default 40. */
  readonly liftPx?: number;
}

/** Everything a landmark gives `createNarratedVisitScene`. */
export interface NarratedVisitDefinition<Slot> {
  /** The landmark's lines and farewell (`content/narration.json`). */
  readonly narration: LandmarkNarration;
  /** Where the comments on objects come from. Default: the narration's `hints`. */
  readonly hints?: HintSource;
  readonly narrator: NarratorChoice;
  /** The dive stop's resting view, the visit is composed for. */
  readonly stop: StopView;
  /** The content objects, in the visitor's language. */
  readonly objects: (lang: Locale) => readonly VisitObject[];
  /** The composition for the stop's view on this viewport. */
  readonly layout: (
    view: ViewFrame,
    count: number,
    ground: number,
  ) => VisitLayout<Slot>;
  /** The 3D objects. */
  readonly Objects: ComponentType<VisitObjectsProps<Slot>>;
  readonly fullView: VisitFullView;
  readonly words: Readonly<Record<Locale, VisitWords>>;
  /** The labels' shape over the objects: round (bubbles) or a slab (tablets). Default round. */
  readonly shape?: 'round' | 'slab';
  /** Where the objects come from on the model (fraction of its height). Default 0.16. */
  readonly doorHeight?: number;
}
