/**
 * Deploy guard: fails the build when the contact form is configured but broken, so the site
 * never ships a Bureau form that silently does nothing.
 *
 *   npm run deploy:check-contact
 *
 * Reads the same `VITE_*` variables Vite inlines at build time and validates them with the app's
 * own `contactConfigProblems()`, so the rule is single-sourced. An unset or `none` provider is
 * valid (the form shows its "not wired yet" state); a set-but-wrong one is not.
 */
import { contactConfigProblems } from '../../apps/web/src/app/overlays/complaint-scroll/contact-submitters';

const problems = contactConfigProblems({
  VITE_CONTACT_PROVIDER: process.env['VITE_CONTACT_PROVIDER'],
  VITE_WEB3FORMS_ACCESS_KEY: process.env['VITE_WEB3FORMS_ACCESS_KEY'],
  VITE_FORMSPREE_FORM_ID: process.env['VITE_FORMSPREE_FORM_ID'],
});

const provider = (process.env['VITE_CONTACT_PROVIDER'] ?? '').trim() || 'none';

if (problems.length > 0) {
  // Names and reasons only; never echo a key or form id.
  console.error(`Contact form is misconfigured (VITE_CONTACT_PROVIDER="${provider}"):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('Fix the repository variables/secrets (see docs/deploy.md) or unset VITE_CONTACT_PROVIDER.');
  process.exit(1);
}

console.log(
  provider === 'none'
    ? 'Contact form: no provider configured (the Bureau form will show its pending state).'
    : `Contact form: provider "${provider}" is configured.`,
);
