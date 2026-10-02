/// <reference types="vite/client" />

/**
 * Build-time environment variables consumed by the Bureau contact form adapter.
 * Vite inlines these at build time; they are safe to expose because the provider keys are
 * public by design (see `docs/contact.md`).
 */
interface ImportMetaEnv {
  readonly VITE_CONTACT_PROVIDER?: 'web3forms' | 'formspree' | 'none';
  readonly VITE_WEB3FORMS_ACCESS_KEY?: string;
  readonly VITE_FORMSPREE_FORM_ID?: string;
  /** `true` swaps in the bundled SpongeBob/Patrick narrators (`narrators.config.ts`). */
  readonly VITE_BUNDLED_CHARACTERS?: string;
  /**
   * The complaints wall API root (`/api`, or `https://wall.example.org/api`). Unset = the
   * public wall is off: nothing of it renders and nothing calls it (`app/wall/wall-env.ts`).
   */
  readonly VITE_WALL_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
