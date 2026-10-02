import { LOCALES } from '@qa3elhamor/content-domain';
import { useLocale } from './locale-context';
import { directionOf } from './locale';
import { CHROME_COPY, LOCALE_NAMES } from './ui-strings';
import './language-toggle.css';

/**
 * The language switch: `EN | عربي`, one button per language, the current one pressed. Each
 * names its language in that language's own script (and `lang`), so a visitor who cannot read
 * the current one still finds theirs. Plain buttons: Tab reaches them, Enter or Space switches.
 *
 * `placement`: `chrome` floats in the dive's page chrome; `inline` sits in the flow (the page
 * view's masthead).
 */
export function LanguageToggle({
  placement = 'chrome',
}: {
  readonly placement?: 'chrome' | 'inline';
}) {
  const { locale, setLocale } = useLocale();
  return (
    <div
      className="language-toggle"
      data-placement={placement}
      role="group"
      aria-label={CHROME_COPY[locale].languageGroup}
    >
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          className="language-toggle__option"
          lang={option}
          dir={directionOf(option)}
          // The full name for screen readers, starting with the visible text (label in name).
          aria-label={LOCALE_NAMES[option].label}
          title={LOCALE_NAMES[option].name}
          aria-pressed={option === locale}
          onClick={() => {
            if (option !== locale) setLocale(option);
          }}
        >
          {LOCALE_NAMES[option].short}
        </button>
      ))}
    </div>
  );
}
