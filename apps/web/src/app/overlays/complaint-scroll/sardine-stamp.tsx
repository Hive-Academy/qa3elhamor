import { useId } from 'react';

/**
 * The Sardine Municipal Stamp (ختم الرئيس السرديني): a round rubber stamp with its legend
 * set on the rim and a sardine in the middle. Decorative: the words it carries are always
 * also present as real text next to it.
 */
export function SardineStamp({
  legend,
  className,
}: {
  readonly legend: string;
  readonly className?: string;
}) {
  const rimId = `${useId()}-rim`;
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path
          id={rimId}
          d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0"
        />
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" strokeWidth="4" />
      <circle cx="60" cy="60" r="36" fill="none" strokeWidth="2" />
      <text
        className="sardine-stamp__legend"
        fontSize="8.5"
        letterSpacing="0.4"
      >
        <textPath href={`#${rimId}`} startOffset="25%" textAnchor="middle">
          ★ {legend} ★
        </textPath>
      </text>
      {/* The sardine: a slim body, a forked tail, one resigned eye. */}
      <path
        className="sardine-stamp__fill"
        d="M34 60c8-8 24-11 38-6l10-8v28l-10-8c-14 5-30 2-38-6z"
        strokeWidth="2"
      />
      <circle className="sardine-stamp__eye" cx="42" cy="58" r="2" />
      <path d="M50 54c2 4 2 8 0 12" fill="none" strokeWidth="1.5" />
    </svg>
  );
}
