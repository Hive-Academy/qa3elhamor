import { useDiveState } from '@qa3elhamor/dive-feature';

/** Formats a depth for display: "−142 m" with a true minus sign, "0 m" at the surface. */
export const formatDepth = (metres: number): string => (metres > 0 ? `−${metres} m` : '0 m');

/**
 * A quiet depth readout in the corner, driven by the observable dive state. It re-renders
 * only when the rounded value changes, never per frame. It is not a live region: announcing
 * every metre while scrolling would drown out everything else for a screen-reader user.
 */
export function DepthGauge() {
  const metres = useDiveState((s) => Math.round(s.depth));
  const percent = useDiveState((s) => Math.round(s.depthRatio * 100));

  return (
    <div className="depth-gauge">
      <span className="depth-gauge__label">Depth</span>
      <span className="depth-gauge__value" data-testid="depth-value">
        {formatDepth(metres)}
      </span>
      <span className="depth-gauge__track" aria-hidden="true">
        <span className="depth-gauge__fill" style={{ transform: `scaleY(${percent / 100})` }} />
      </span>
    </div>
  );
}
