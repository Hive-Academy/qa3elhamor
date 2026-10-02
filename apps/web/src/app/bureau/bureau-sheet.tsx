import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { BureauScroll, type BureauScrollProps } from './bureau-scroll';

/** The stage's "Back to the dive" bar at the bottom, and a margin at the top (CSS px). */
const BAR_PX = 86;
const TOP_PX = 8;
/** Rods, the "Roll it back up" button and the gaps between them, around the sheet of paper. */
const PAPER_CHROME_PX = 112;
/** Never smaller than this, even with the keyboard up on a short phone: it scrolls inside. */
const MIN_SHEET_PX = 220;

/** The height the visitor can actually see: the visual viewport shrinks under a keyboard. */
export function useVisibleHeight(layoutHeight: number): number {
  const [visible, setVisible] = useState(
    () => window.visualViewport?.height ?? layoutHeight,
  );
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const update = () => setVisible(viewport.height);
    update();
    // iOS reports the keyboard as a visual-viewport scroll as well as a resize.
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
  return visible;
}

/** The sheet's height for a layout viewport `layoutHeight` tall, of which `visible` shows. */
export const sheetHeightFor = (layoutHeight: number, visible: number): number =>
  Math.max(Math.min(layoutHeight - BAR_PX, visible) - TOP_PX * 2, MIN_SHEET_PX);

/**
 * On a phone the scroll is a sheet over the scene rather than paper in the world: typing on a
 * small screen wins over the effect. It comes out rolled and unrolls at once, fits between the
 * top of the screen and the stage bar, and shrinks to what the on-screen keyboard leaves, so the
 * field being typed in stays in view (its own paper scrolls, never the page).
 */
export function BureauSheet({
  layoutHeight,
  state,
  ...scroll
}: Omit<BureauScrollProps, 'presentation'> & {
  readonly layoutHeight: number;
}) {
  const visible = useVisibleHeight(layoutHeight);
  const height = sheetHeightFor(layoutHeight, visible);
  // Mounted rolled, then unrolled on the next frame, so the paper visibly unrolls.
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const shown = state === 'unrolled' && !arrived ? 'rolled' : state;
  return (
    <div
      className="bureau-sheet"
      style={
        {
          '--bureau-sheet-h': `${height}px`,
          '--bureau-sheet-paper': `${height - PAPER_CHROME_PX}px`,
        } as CSSProperties
      }
    >
      <BureauScroll {...scroll} state={shown} presentation="sheet" />
    </div>
  );
}

/** The notice wall's "Back to the President" button and the gap above it. */
const BOARD_CHROME_PX = 64;

/**
 * On a phone the public notice wall is a sheet over the scene too, sized like the scroll's, so
 * its cork board scrolls inside itself and its way back stays above the stage bar.
 */
export function BureauWallSheet({
  layoutHeight,
  children,
}: {
  readonly layoutHeight: number;
  readonly children: ReactNode;
}) {
  const visible = useVisibleHeight(layoutHeight);
  const height = sheetHeightFor(layoutHeight, visible);
  return (
    <div
      className="bureau-sheet"
      style={
        {
          '--bureau-sheet-h': `${height}px`,
          '--bureau-sheet-paper': `${height - BOARD_CHROME_PX}px`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
