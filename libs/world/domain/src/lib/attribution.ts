import type { SourceModelId } from './asset-manifest.js';

/**
 * A licence obligation attached to a bundled asset.
 *
 * Every model in `assets/` is CC-BY-4.0, which requires visible credit wherever the work is
 * shared. That makes attribution a shipping requirement, not documentation: the site is in
 * breach without it. Credits are therefore modelled as data next to the manifest that lists
 * the assets, so a model cannot be added without its credit coming along.
 *
 * The `asset-attribution-ui` roadmap item renders these in-world.
 */
export interface Attribution {
  readonly title: string;
  readonly author: string;
  readonly authorUrl: string;
  readonly sourceUrl: string;
  readonly license: 'CC-BY-4.0';
  readonly licenseUrl: string;
}

/** The exact credit string the licence requires, as mandated by the source `license.txt`. */
export const creditLine = (attribution: Attribution): string =>
  `This work is based on "${attribution.title}" (${attribution.sourceUrl}) by ` +
  `${attribution.author} (${attribution.authorUrl}) licensed under ` +
  `${attribution.license} (${attribution.licenseUrl})`;

const CC_BY_4 = {
  license: 'CC-BY-4.0',
  licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
} as const;

/**
 * Credits for the four models bundled in `assets/`, transcribed from their `license.txt`
 * files and keyed by source model. Every web asset derived from a model (the map's landmarks
 * included) is a derivative work carrying that model's credit. Adding a model to
 * `SOURCE_MODELS` without its credit here fails to type-check, and the manifest test asserts
 * the pairing.
 */
export const ATTRIBUTIONS: Readonly<Record<SourceModelId, Attribution>> = {
  'bikini-bottom-map': {
    title: 'Bikini Bottom Map 3D Model',
    author: 'spongebob.evolution',
    authorUrl: 'https://sketchfab.com/spongebob.evolution',
    sourceUrl:
      'https://sketchfab.com/3d-models/bikini-bottom-map-3d-model-8951fa974ac94e97b83e05ff01c92b3b',
    ...CC_BY_4,
  },
  'pineapple-interior': {
    title: 'Sbfbb-SpongeBob House',
    author: 'Sajin Mickey Firey fan 1342 from Cheryl hill',
    authorUrl: 'https://sketchfab.com/cherylhill28',
    sourceUrl:
      'https://sketchfab.com/3d-models/sbfbb-spongebob-house-80e59e8223e24c3bb96e0404587f96ea',
    ...CC_BY_4,
  },
  'spongebob-character': {
    title: 'Sponge On The Run: SpongeBob Base Model',
    author: 'NickBob',
    authorUrl: 'https://sketchfab.com/nickbob',
    sourceUrl:
      'https://sketchfab.com/3d-models/sponge-on-the-run-spongebob-base-model-539d085105f74f70a93310e2f4246b88',
    ...CC_BY_4,
  },
  'patrick-character': {
    title: 'Sponge On The Run: Patrick Base Model (Textured)',
    author: 'NickBob',
    authorUrl: 'https://sketchfab.com/nickbob',
    sourceUrl:
      'https://sketchfab.com/3d-models/sponge-on-the-run-patrick-base-model-textured-9254a020fb76477ab4be69ee353e3fcb',
    ...CC_BY_4,
  },
};
