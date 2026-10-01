import type { CSSProperties } from 'react';
import { useQuality, useQualityFrameStats } from './quality-context.js';

const STYLE: CSSProperties = {
  position: 'fixed',
  left: 8,
  bottom: 8,
  zIndex: 50,
  padding: '2px 6px',
  font: '11px/1.4 ui-monospace, monospace',
  color: '#d8f4ff',
  background: 'rgba(6, 16, 31, 0.7)',
  borderRadius: 4,
  pointerEvents: 'none',
};

/**
 * A development diagnostic: tier, whether it is final, and the last window's median fps and
 * 90th-percentile frame time. Render it behind `import.meta.env.DEV`; it is not a user control
 * and is hidden from assistive technology.
 */
export function QualityReadout() {
  const { tier, settled, source, reasons } = useQuality();
  const stats = useQualityFrameStats();
  const fps = stats && stats.frames > 0 ? Math.round(1000 / stats.p50Ms) : null;
  const p90 = stats && stats.frames > 0 ? stats.p90Ms.toFixed(1) : null;
  return (
    <div
      style={STYLE}
      aria-hidden="true"
      data-testid="quality-readout"
      data-tier={tier}
      data-settled={settled}
      title={reasons.join('\n')}
    >
      {tier}
      {source === 'override' ? ' (override)' : settled ? ' (final)' : ' …'}
      {fps !== null && ` · ${fps} fps · p90 ${p90} ms`}
    </div>
  );
}
