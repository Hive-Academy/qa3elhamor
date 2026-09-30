import { renderHook } from '@testing-library/react';
import {
  siteTelemetry,
  trackLandmarkEvent,
  trackOverlayOpened,
  trackQualityTier,
  useSiteTelemetry,
} from './telemetry';

const listeners = new Set<() => void>();
const state = { maxProgress: 0, nearestWaypointId: null as string | null };
const fakeDive = {
  getState: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

vi.mock('@qa3elhamor/dive-feature', () => ({ useDive: () => fakeDive }));

describe('site telemetry', () => {
  it('is disabled when VITE_ANALYTICS_PROVIDER is unset', () => {
    expect(siteTelemetry().port.provider).toBe('none');
    expect(siteTelemetry()).toBe(siteTelemetry());
  });

  it('maps landmark kernel events onto the session', () => {
    const { session } = siteTelemetry();
    const clicked = vi.spyOn(session, 'landmarkClicked');
    const opened = vi.spyOn(session, 'overlayOpened');
    trackLandmarkEvent({ type: 'landmark_hover', landmarkId: 'reef', source: 'pointer' });
    trackLandmarkEvent({ type: 'landmark_open', landmarkId: 'reef', source: 'pointer' });
    trackLandmarkEvent({ type: 'landmark_close', landmarkId: 'reef', reason: 'escape' });
    trackOverlayOpened('complaints-wall');
    expect(clicked.mock.calls).toEqual([['reef']]);
    expect(opened.mock.calls).toEqual([['reef'], ['complaints-wall']]);
    clicked.mockRestore();
    opened.mockRestore();
  });

  it('receives opens through the production landmark port', async () => {
    const { reportLandmarkEvent } = await import('./landmark-ports');
    const clicked = vi.spyOn(siteTelemetry().session, 'landmarkClicked');
    reportLandmarkEvent({ type: 'landmark_open', landmarkId: 'wreck', source: 'keyboard' });
    expect(clicked).toHaveBeenCalledWith('wreck');
    clicked.mockRestore();
  });

  it('forwards the quality tier', () => {
    const resolved = vi.spyOn(siteTelemetry().session, 'qualityTierResolved');
    trackQualityTier('medium');
    expect(resolved).toHaveBeenCalledWith('medium');
  });

  it('feeds dive state changes to the session and unsubscribes on unmount', () => {
    const observe = vi.spyOn(siteTelemetry().session, 'observeDive');
    const { unmount } = renderHook(() => useSiteTelemetry());
    expect(observe).toHaveBeenCalledTimes(1);
    state.maxProgress = 0.5;
    state.nearestWaypointId = 'wreck';
    for (const listener of listeners) listener();
    expect(observe).toHaveBeenLastCalledWith({ maxProgress: 0.5, nearestWaypointId: 'wreck' });
    unmount();
    expect(listeners.size).toBe(0);
  });
});
