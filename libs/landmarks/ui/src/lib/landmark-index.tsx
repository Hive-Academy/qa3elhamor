import type { InputSource } from '@qa3elhamor/landmarks-domain';
import './landmark-index.css';

/** The list button for a landmark (ids are slugs, so no escaping), e.g. to send focus back to it. */
export const landmarkIndexButton = (
  id: string,
  root: ParentNode = document,
): HTMLElement | null =>
  root.querySelector<HTMLElement>(`.lmk-index__item[data-landmark-id="${id}"]`);

export interface LandmarkIndexItem {
  readonly id: string;
  readonly label: string;
  readonly caption?: string;
}

export interface LandmarkIndexProps {
  readonly items: readonly LandmarkIndexItem[];
  /** Accessible name of the list, e.g. "Landmarks". */
  readonly label: string;
  /** The hovered or focused landmark, highlighted to match the scene. */
  readonly activeId?: string | null;
  readonly onActivate: (id: string, source: InputSource) => void;
  readonly onHover?: (id: string, source: InputSource) => void;
  readonly onUnhover?: (id: string) => void;
  readonly dir?: 'ltr' | 'rtl';
  readonly lang?: string;
}

/**
 * Every landmark as a real button: the keyboard and screen-reader route to the same overlays
 * the scene opens (the canvas itself is `aria-hidden`), and a way in without WebGL. Focusing
 * or pointing at an entry highlights its landmark in the scene.
 */
export function LandmarkIndex({
  items,
  label,
  activeId,
  onActivate,
  onHover,
  onUnhover,
  dir,
  lang,
}: LandmarkIndexProps) {
  return (
    <nav className="lmk-index" aria-label={label} dir={dir} lang={lang}>
      <ul className="lmk-index__list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="lmk-index__item"
              data-landmark-id={item.id}
              data-active={activeId === item.id ? '' : undefined}
              // `detail` is 0 for a click synthesised from Enter/Space.
              onClick={(event) =>
                onActivate(item.id, event.detail === 0 ? 'keyboard' : 'pointer')
              }
              onFocus={() => onHover?.(item.id, 'keyboard')}
              onBlur={() => onUnhover?.(item.id)}
              onPointerEnter={() => onHover?.(item.id, 'pointer')}
              onPointerLeave={() => onUnhover?.(item.id)}
            >
              <span className="lmk-index__label">{item.label}</span>
              {item.caption && (
                <span className="lmk-index__caption">{item.caption}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
