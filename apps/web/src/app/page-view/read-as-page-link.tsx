import type { Locale } from '@qa3elhamor/content-domain';
import { useEffect, useRef } from 'react';
import { pageText } from './page-copy';
import { hrefFor } from './presentation';
import './read-as-page-link.css';

/**
 * "Skip the dive: read it as a page", for everyone: keyboard-first visitors, the motion-sensitive,
 * recruiters in a hurry. A real link to `?view=page` (shareable, opens in a new tab on a modified
 * click); a plain click switches in place.
 *
 * `focusOnMount`: the visitor just came back from the page (its link, or Back/Forward). The
 * control they used is gone, so focus lands here, the dive's first stop and the way out again,
 * instead of being stranded on `<body>`.
 */
export function ReadAsPageLink({
  onActivate,
  focusOnMount = false,
  locale = 'en',
  className,
}: {
  readonly onActivate: () => void;
  readonly focusOnMount?: boolean;
  readonly locale?: Locale;
  readonly className?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  return (
    <a
      ref={ref}
      className={['read-as-page', className].filter(Boolean).join(' ')}
      href={hrefFor(window.location, 'page')}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        onActivate();
      }}
    >
      {pageText(locale)('readAsPage')}
    </a>
  );
}
