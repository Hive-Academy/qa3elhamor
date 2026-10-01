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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
