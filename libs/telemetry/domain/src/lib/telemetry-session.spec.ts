import { EventDeduper, eventKey } from './dedupe.js';
import type { TelemetryEvent } from './events.js';
import { TelemetrySession, type TelemetrySink } from './telemetry-session.js';

function recordingSink() {
  const tracked: TelemetryEvent[] = [];
  const onExit: TelemetryEvent[] = [];
  const sink: TelemetrySink = {
    track: (event) => tracked.push(event),
    trackOnExit: (event) => onExit.push(event),
  };
  return { sink, tracked, onExit };
}

describe('TelemetrySession', () => {
  it('emits depth milestones from dive snapshots', () => {
    const { sink, tracked } = recordingSink();
    const session = new TelemetrySession(sink);
    session.observeDive({ maxProgress: 0.3, nearestWaypointId: null });
    session.observeDive({ maxProgress: 0.3, nearestWaypointId: 'reef' });
    session.observeDive({ maxProgress: 0.8, nearestWaypointId: 'wreck' });
    expect(tracked.map((e) => e.props)).toEqual([
      { milestone: 25 },
      { milestone: 50 },
      { milestone: 75 },
    ]);
  });

  it('fires drop-off once, on the exit path, with the last waypoint and bucket', () => {
    const { sink, tracked, onExit } = recordingSink();
    const session = new TelemetrySession(sink);
    session.observeDive({ maxProgress: 0.6, nearestWaypointId: 'wreck' });
    session.observeDive({ maxProgress: 0.6, nearestWaypointId: null });
    session.dropOff();
    session.dropOff();
    expect(onExit).toEqual([
      { name: 'dive_drop_off', props: { maxDepthBucket: 50, lastWaypointId: 'wreck' } },
    ]);
    expect(tracked.some((e) => e.name === 'dive_drop_off')).toBe(false);
  });

  it('re-arms the drop-off when the visit resumes from the bfcache', () => {
    const { sink, onExit } = recordingSink();
    const session = new TelemetrySession(sink);
    session.observeDive({ maxProgress: 0.3, nearestWaypointId: 'reef' });
    session.dropOff();
    session.resumeVisit();
    session.observeDive({ maxProgress: 0.9, nearestWaypointId: 'wreck' });
    session.dropOff();
    session.dropOff();
    expect(onExit.map((e) => e.props)).toEqual([
      { maxDepthBucket: 25, lastWaypointId: 'reef' },
      { maxDepthBucket: 75, lastWaypointId: 'wreck' },
    ]);
  });

  it('keeps the last valid waypoint when a later id is not a slug', () => {
    const { sink, onExit } = recordingSink();
    const session = new TelemetrySession(sink);
    session.observeDive({ maxProgress: 0.1, nearestWaypointId: 'reef' });
    session.observeDive({ maxProgress: 0.1, nearestWaypointId: 'Bad Id' });
    session.dropOff();
    expect(onExit[0]?.props).toEqual({ maxDepthBucket: 0, lastWaypointId: 'reef' });
  });

  it('reports "none" when the waypoint id is missing or not a slug', () => {
    const { sink, onExit } = recordingSink();
    const session = new TelemetrySession(sink);
    session.observeDive({ maxProgress: 0.1, nearestWaypointId: 'Not A Slug' });
    session.dropOff();
    expect(onExit[0]?.props).toEqual({ maxDepthBucket: 0, lastWaypointId: 'none' });
  });

  it('drops invalid UI signals instead of throwing', () => {
    const { sink, tracked } = recordingSink();
    const session = new TelemetrySession(sink);
    session.landmarkClicked('user typed this');
    session.overlayOpened('');
    expect(tracked).toEqual([]);
  });

  it('suppresses double fires within the window but allows later repeats', () => {
    let now = 0;
    const { sink, tracked } = recordingSink();
    const session = new TelemetrySession(sink, { now: () => now });
    session.landmarkClicked('reef');
    now = 200;
    session.landmarkClicked('reef');
    session.landmarkClicked('wreck');
    now = 1500;
    session.landmarkClicked('reef');
    expect(tracked.map((e) => e.props)).toEqual([
      { landmarkId: 'reef' },
      { landmarkId: 'wreck' },
      { landmarkId: 'reef' },
    ]);
  });

  it('reports the resolved quality tier once per visit', () => {
    const { sink, tracked } = recordingSink();
    const session = new TelemetrySession(sink);
    session.qualityTierResolved('high');
    session.qualityTierResolved('low');
    expect(tracked).toEqual([{ name: 'quality_tier_resolved', props: { tier: 'high' } }]);
  });
});

describe('EventDeduper', () => {
  it('keys events independently of property order', () => {
    const a = { name: 'dive_drop_off', props: { maxDepthBucket: 25, lastWaypointId: 'x' } };
    const b = { name: 'dive_drop_off', props: { lastWaypointId: 'x', maxDepthBucket: 25 } };
    expect(eventKey(a as TelemetryEvent)).toBe(eventKey(b as TelemetryEvent));
  });

  it('distinguishes values by type', () => {
    const num = { name: 'landmark_clicked', props: { landmarkId: 25 } };
    const str = { name: 'landmark_clicked', props: { landmarkId: '25' } };
    expect(eventKey(num as unknown as TelemetryEvent)).not.toBe(
      eventKey(str as unknown as TelemetryEvent)
    );
  });

  it('admits one event per milestone', () => {
    const deduper = new EventDeduper();
    const at = (milestone: 25 | 50): TelemetryEvent => ({
      name: 'dive_depth_reached',
      props: { milestone },
    });
    expect([at(25), at(25), at(50)].map((e) => deduper.admit(e))).toEqual([true, false, true]);
  });
});
