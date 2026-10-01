import type { ShippedCredit } from '@qa3elhamor/world-domain';
import { useId } from 'react';
import { creditSegments } from './credit-segments.js';
import './credits.css';

export interface CreditsListProps {
  /** The credits to list; `shippedCredits()` from `@qa3elhamor/world-domain`. */
  readonly credits: readonly ShippedCredit[];
  /** Accessible name of the list. Default "Asset credits". */
  readonly label?: string;
  readonly className?: string;
}

/**
 * Every credit as an accessible list. Each item's text is the licence line verbatim, with the
 * source, author and licence URLs inside it as working links that open in a new tab. Works
 * without WebGL, so it is the complete record of attribution the site shows.
 */
export function CreditsList({ credits, label = 'Asset credits', className }: CreditsListProps) {
  const newTabHint = useId();

  return (
    <>
      <ul className={['world-credits__list', className].filter(Boolean).join(' ')} aria-label={label}>
        {credits.map((credit) => (
          <li key={credit.sourceModel} className="world-credits__item" lang="en" dir="ltr">
            <p className="world-credits__line">
              {creditSegments(credit).map((segment, index) =>
                segment.kind === 'link' ? (
                  <a
                    key={index}
                    href={segment.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-describedby={newTabHint}
                  >
                    {segment.text}
                  </a>
                ) : (
                  segment.text
                ),
              )}
            </p>
          </li>
        ))}
      </ul>
      {/* Visually hidden, not `hidden`: it must stay in the accessibility tree. */}
      <span id={newTabHint} className="world-credits__visually-hidden">
        Opens in a new tab
      </span>
    </>
  );
}
