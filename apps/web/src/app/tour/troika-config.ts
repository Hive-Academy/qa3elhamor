import { configureTextBuilder } from 'troika-three-text';

/*
 * troika (drei's `<Text>`, under `OceanText`) typesets in a Web Worker it builds from a blob:
 * URL, which the site's Content-Security-Policy refuses as a script source (script-src 'self').
 * Typesetting the few short strings the dive shows on the main thread costs little, so the
 * worker is turned off here, once, before any SDF text asks for a font: this module is imported
 * for its effect by `dive-shell.tsx`, ahead of the scene. It also never falls back to troika's
 * CDN font (every `OceanText` passes a self-hosted `fontUrl`).
 */
configureTextBuilder({ useWorker: false, defaultFontURL: null });
