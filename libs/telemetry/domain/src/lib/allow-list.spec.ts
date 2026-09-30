import { isTelemetrySlug, sanitizeEvent } from './allow-list.js';

describe('sanitizeEvent', () => {
  it('accepts every catalogued event with valid props', () => {
    const valid = [
      { name: 'dive_depth_reached', props: { milestone: 50 } },
      { name: 'landmark_clicked', props: { landmarkId: 'sunken-ship' } },
      { name: 'overlay_opened', props: { overlayKey: 'complaints_wall' } },
      { name: 'dive_drop_off', props: { maxDepthBucket: 0, lastWaypointId: 'none' } },
      { name: 'quality_tier_resolved', props: { tier: 'medium' } },
    ];
    for (const event of valid) expect(sanitizeEvent(event)).toEqual(event);
  });

  it('returns a copy, not the caller object', () => {
    const input = { name: 'landmark_clicked', props: { landmarkId: 'reef' } };
    const out = sanitizeEvent(input);
    expect(out).not.toBe(input);
    expect(out?.props).not.toBe(input.props);
  });

  it('rejects unknown events and unknown or missing props', () => {
    expect(sanitizeEvent({ name: 'pageview_custom', props: {} })).toBeNull();
    expect(
      sanitizeEvent({ name: 'landmark_clicked', props: { landmarkId: 'reef', email: 'a' } })
    ).toBeNull();
    expect(sanitizeEvent({ name: 'landmark_clicked', props: {} })).toBeNull();
    expect(sanitizeEvent({ name: 'landmark_clicked' })).toBeNull();
    expect(sanitizeEvent({ name: 'toString', props: {} })).toBeNull();
    expect(sanitizeEvent(null)).toBeNull();
    expect(sanitizeEvent('landmark_clicked')).toBeNull();
  });

  it('rejects values outside their enumeration', () => {
    expect(sanitizeEvent({ name: 'dive_depth_reached', props: { milestone: 33 } })).toBeNull();
    expect(sanitizeEvent({ name: 'dive_depth_reached', props: { milestone: '50' } })).toBeNull();
    expect(sanitizeEvent({ name: 'quality_tier_resolved', props: { tier: 'ultra' } })).toBeNull();
  });

  it('rejects free text, PII-shaped and oversized ids', () => {
    for (const landmarkId of [
      'Sunken Ship',
      'someone@example.com',
      'https://example.com/x',
      '../etc',
      '',
      'a'.repeat(65),
      42,
    ]) {
      expect(sanitizeEvent({ name: 'landmark_clicked', props: { landmarkId } })).toBeNull();
    }
  });
});

describe('isTelemetrySlug', () => {
  it('accepts kebab and snake case slugs', () => {
    expect(isTelemetrySlug('coral-garden-2')).toBe(true);
    expect(isTelemetrySlug('wall_overlay')).toBe(true);
    expect(isTelemetrySlug('-leading')).toBe(false);
  });
});
