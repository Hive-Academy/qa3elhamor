import type { LandmarkOverlayProps } from '@qa3elhamor/landmarks-ui';

/**
 * Stand-in for a landmark's real overlay (landmark-pineapple, landmark-bureau, ...). It proves
 * the wiring end to end; each landmark item replaces its entry in `LANDMARK_OVERLAYS`.
 */
export function ComingSoonOverlay({ locale }: LandmarkOverlayProps) {
  return locale === 'ar' ? (
    <p>هذا المبنى تحت الإنشاء. عُد قريبًا.</p>
  ) : (
    <p>This office is still under construction. Check back soon.</p>
  );
}
