/**
 * The one part of troika-three-text (drei's `<Text>`, under `OceanText`) the site calls itself.
 * troika ships no types.
 */
declare module 'troika-three-text' {
  export interface TroikaTextBuilderConfig {
    /** false: typeset and build SDFs on the main thread instead of a blob: worker. */
    readonly useWorker?: boolean;
    readonly defaultFontURL?: string | null;
    readonly sdfGlyphSize?: number;
  }
  /** Must run before the first font request; later calls are ignored (with a warning). */
  export function configureTextBuilder(config: TroikaTextBuilderConfig): void;
}
