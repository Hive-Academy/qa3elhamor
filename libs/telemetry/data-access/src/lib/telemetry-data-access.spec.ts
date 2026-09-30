import type { TelemetryEvent } from '@qa3elhamor/telemetry-domain';
import {
  PLAUSIBLE_SCRIPT_SRC,
  UMAMI_SCRIPT_SRC,
  resolveAnalyticsConfig,
  type PlausibleConfig,
  type UmamiConfig,
} from './analytics-config.js';
import { NoopAnalytics } from './analytics-port.js';
import type { AnalyticsRuntime } from './script-analytics.js';
import { createAnalytics, createTelemetryClient } from './telemetry-client.js';

const WEBSITE_ID = '0b6c2c5e-1f7a-4a3e-9d8b-2f4b9c1d7e10';
const PLAUSIBLE = resolveAnalyticsConfig({
  VITE_ANALYTICS_PROVIDER: 'plausible',
  VITE_ANALYTICS_DOMAIN: 'qa3elhamor.example',
}) as PlausibleConfig;
const UMAMI = resolveAnalyticsConfig({
  VITE_ANALYTICS_PROVIDER: 'umami',
  VITE_ANALYTICS_WEBSITE_ID: WEBSITE_ID,
}) as UmamiConfig;

const CLICK: TelemetryEvent = { name: 'landmark_clicked', props: { landmarkId: 'reef' } };
const DEPTH: TelemetryEvent = { name: 'dive_depth_reached', props: { milestone: 25 } };

type Globals = Window & { plausible?: unknown; umami?: unknown };

function runtime(signals: { doNotTrack?: string; globalPrivacyControl?: boolean } = {}) {
  const sendBeacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true);
  const navigator = { language: 'en', sendBeacon, ...signals } as unknown as Navigator;
  const rt: AnalyticsRuntime = { window, document, navigator };
  return { rt, sendBeacon };
}

const injected = (): HTMLScriptElement[] => Array.from(document.head.querySelectorAll('script'));
const fire = (type: 'load' | 'error'): void => {
  for (const script of injected()) script.dispatchEvent(new Event(type));
};
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** jsdom's Blob has no `text()`; FileReader is the portable way to read it back. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function beaconBody(sendBeacon: ReturnType<typeof runtime>['sendBeacon'], call = 0) {
  const [url, data] = sendBeacon.mock.calls[call] ?? [];
  const blob = data as Blob;
  return { url, type: blob.type, body: JSON.parse(await readBlob(blob)) as Record<string, unknown> };
}

afterEach(() => {
  document.head.innerHTML = '';
  delete (window as Globals).plausible;
  delete (window as Globals).umami;
  vi.useRealTimers();
});

describe('resolveAnalyticsConfig', () => {
  it('defaults to none so an unconfigured fork sends nothing', () => {
    expect(resolveAnalyticsConfig({}).provider).toBe('none');
    expect(resolveAnalyticsConfig({ VITE_ANALYTICS_PROVIDER: 'none' }).provider).toBe('none');
    expect(resolveAnalyticsConfig({ VITE_ANALYTICS_PROVIDER: 'ga4' }).provider).toBe('none');
  });

  it('pins the official script URLs and derives the event endpoints', () => {
    expect(PLAUSIBLE).toEqual({
      provider: 'plausible',
      domain: 'qa3elhamor.example',
      scriptSrc: PLAUSIBLE_SCRIPT_SRC,
      eventEndpoint: 'https://plausible.io/api/event',
    });
    expect(UMAMI.scriptSrc).toBe(UMAMI_SCRIPT_SRC);
    expect(UMAMI.eventEndpoint).toBe('https://cloud.umami.is/api/send');
  });

  it('lowercases the Plausible domain, which Plausible matches exactly', () => {
    expect(
      resolveAnalyticsConfig({
        VITE_ANALYTICS_PROVIDER: 'plausible',
        VITE_ANALYTICS_DOMAIN: 'Example.ORG',
      })
    ).toMatchObject({ domain: 'example.org' });
  });

  it('disables itself on missing ids and insecure script overrides', () => {
    expect(resolveAnalyticsConfig({ VITE_ANALYTICS_PROVIDER: 'plausible' }).provider).toBe('none');
    expect(
      resolveAnalyticsConfig({ VITE_ANALYTICS_PROVIDER: 'umami', VITE_ANALYTICS_WEBSITE_ID: 'x' })
        .provider
    ).toBe('none');
    expect(
      resolveAnalyticsConfig({
        VITE_ANALYTICS_PROVIDER: 'umami',
        VITE_ANALYTICS_WEBSITE_ID: WEBSITE_ID,
        VITE_ANALYTICS_SCRIPT_SRC: 'http://stats.example.org/script.js',
      }).provider
    ).toBe('none');
    const selfHosted = resolveAnalyticsConfig({
      VITE_ANALYTICS_PROVIDER: 'umami',
      VITE_ANALYTICS_WEBSITE_ID: WEBSITE_ID,
      VITE_ANALYTICS_SCRIPT_SRC: 'https://stats.example.org/u.js',
    });
    expect(selfHosted).toMatchObject({ eventEndpoint: 'https://stats.example.org/api/send' });
  });
});

describe('createAnalytics', () => {
  it('is a no-op when unconfigured, outside a browser, or on DNT / GPC', () => {
    expect(createAnalytics({ provider: 'none', reason: 'x' }, runtime().rt)).toBeInstanceOf(
      NoopAnalytics
    );
    expect(createAnalytics(PLAUSIBLE, null)).toBeInstanceOf(NoopAnalytics);
    expect(createAnalytics(PLAUSIBLE, runtime({ doNotTrack: '1' }).rt)).toBeInstanceOf(
      NoopAnalytics
    );
    expect(createAnalytics(UMAMI, runtime({ globalPrivacyControl: true }).rt)).toBeInstanceOf(
      NoopAnalytics
    );
    expect(createAnalytics(PLAUSIBLE, runtime({ doNotTrack: '0' }).rt).provider).toBe('plausible');
  });

  it('the no-op adapter injects nothing and sends nothing', async () => {
    const { rt, sendBeacon } = runtime({ doNotTrack: '1' });
    const port = createAnalytics(PLAUSIBLE, rt);
    await port.load();
    port.track(CLICK);
    port.trackOnExit(CLICK);
    expect(injected()).toHaveLength(0);
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

describe('Plausible adapter', () => {
  it('injects one async pinned script and queues events until it loads', async () => {
    const plausible = vi.fn();
    const port = createAnalytics(PLAUSIBLE, runtime().rt);
    port.track(DEPTH);
    port.track(CLICK);
    expect(injected()).toHaveLength(0); // tracking alone never injects the script
    void port.load();

    const scripts = injected();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.src).toBe(PLAUSIBLE_SCRIPT_SRC);
    expect(scripts[0]?.async).toBe(true);
    expect(scripts[0]?.getAttribute('data-domain')).toBe('qa3elhamor.example');
    expect(plausible).not.toHaveBeenCalled();

    (window as Globals).plausible = plausible;
    fire('load');
    await flush();
    expect(plausible.mock.calls).toEqual([
      ['dive_depth_reached', { props: { milestone: 25 } }],
      ['landmark_clicked', { props: { landmarkId: 'reef' } }],
    ]);

    port.track(CLICK);
    void port.load();
    expect(plausible).toHaveBeenCalledTimes(3);
    expect(injected()).toHaveLength(1);
  });

  it('sends the exit event to the Events API by sendBeacon as text/plain', async () => {
    const { rt, sendBeacon } = runtime();
    const port = createAnalytics(PLAUSIBLE, rt);
    port.trackOnExit({
      name: 'dive_drop_off',
      props: { maxDepthBucket: 50, lastWaypointId: 'wreck' },
    });
    const sent = await beaconBody(sendBeacon);
    expect(sent.url).toBe('https://plausible.io/api/event');
    expect(sent.type).toBe('text/plain');
    expect(sent.body).toEqual({
      name: 'dive_drop_off',
      url: `${window.location.origin}${window.location.pathname}`,
      domain: 'qa3elhamor.example',
      referrer: null,
      props: { maxDepthBucket: 50, lastWaypointId: 'wreck' },
    });
  });

  it('flushes still-queued events on the exit path', () => {
    const { rt, sendBeacon } = runtime();
    const port = createAnalytics(PLAUSIBLE, rt);
    port.track(DEPTH);
    port.trackOnExit(CLICK);
    expect(sendBeacon).toHaveBeenCalledTimes(2);
  });

  it('goes silent when the script is blocked', async () => {
    const { rt, sendBeacon } = runtime();
    const port = createAnalytics(PLAUSIBLE, rt);
    port.track(CLICK);
    void port.load();
    fire('error');
    await flush();
    port.track(CLICK);
    port.trackOnExit(CLICK);
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

describe('Umami adapter', () => {
  it('injects the script with data-website-id and calls umami.track(name, data)', async () => {
    const track = vi.fn();
    const port = createAnalytics(UMAMI, runtime().rt);
    port.track(CLICK);
    void port.load();
    const [script] = injected();
    expect(script?.src).toBe(UMAMI_SCRIPT_SRC);
    expect(script?.getAttribute('data-website-id')).toBe(WEBSITE_ID);

    (window as Globals).umami = { track };
    fire('load');
    await flush();
    expect(track).toHaveBeenCalledWith('landmark_clicked', { landmarkId: 'reef' });

    port.trackOnExit(DEPTH);
    expect(track).toHaveBeenLastCalledWith('dive_depth_reached', { milestone: 25 });
  });

  it('posts to /api/send with keepalive when leaving before the script loaded', () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null)));
    const original = window.fetch;
    window.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const port = createAnalytics(UMAMI, runtime().rt);
      port.trackOnExit(CLICK);
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://cloud.umami.is/api/send');
      expect(init.keepalive).toBe(true);
      expect(init.credentials).toBe('omit');
      expect(JSON.parse(init.body as string)).toMatchObject({
        type: 'event',
        payload: { website: WEBSITE_ID, name: 'landmark_clicked', data: { landmarkId: 'reef' } },
      });
    } finally {
      window.fetch = original;
    }
  });
});

describe('createTelemetryClient', () => {
  it('loads the script lazily and sends drop-off once on pagehide', async () => {
    vi.useFakeTimers();
    const { rt, sendBeacon } = runtime();
    const client = createTelemetryClient(PLAUSIBLE, rt);
    const stop = client.start();
    client.session.qualityTierResolved('high'); // an early event must not defeat the idle load
    expect(injected()).toHaveLength(0);
    vi.advanceTimersByTime(1500);
    expect(injected()).toHaveLength(1);

    client.session.observeDive({ maxProgress: 0.8, nearestWaypointId: 'wreck' });
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));
    vi.useRealTimers(); // FileReader in beaconBody schedules on real timers.
    const dropOffs = [];
    for (let i = 0; i < sendBeacon.mock.calls.length; i++) {
      const { body } = await beaconBody(sendBeacon, i);
      if (body['name'] === 'dive_drop_off') dropOffs.push(body['props']);
    }
    expect(dropOffs).toEqual([{ maxDepthBucket: 75, lastWaypointId: 'wreck' }]);

    stop();
    client.session.resumeVisit();
    const sent = sendBeacon.mock.calls.length;
    window.dispatchEvent(new Event('pagehide'));
    expect(sendBeacon).toHaveBeenCalledTimes(sent); // listener removed by cleanup
    expect(document.cookie).toBe('');
  });

  it('re-arms the drop-off after a bfcache restore (pageshow persisted)', async () => {
    const { rt, sendBeacon } = runtime();
    const client = createTelemetryClient(PLAUSIBLE, rt);
    const stop = client.start();
    const pageshow = (persisted: boolean): Event =>
      Object.assign(new Event('pageshow'), { persisted });

    client.session.observeDive({ maxProgress: 0.3, nearestWaypointId: 'reef' });
    window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    window.dispatchEvent(pageshow(false)); // an ordinary load does not re-arm
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(pageshow(true));
    client.session.observeDive({ maxProgress: 0.8, nearestWaypointId: 'wreck' });
    window.dispatchEvent(new Event('pagehide'));
    stop();

    const bodies = [];
    for (let i = 0; i < sendBeacon.mock.calls.length; i++) {
      bodies.push((await beaconBody(sendBeacon, i)).body);
    }
    expect(bodies.filter((b) => b['name'] === 'dive_drop_off').map((b) => b['props'])).toEqual([
      { maxDepthBucket: 25, lastWaypointId: 'reef' },
      { maxDepthBucket: 75, lastWaypointId: 'wreck' },
    ]);
  });

  it('does nothing when analytics is off', () => {
    const client = createTelemetryClient({ provider: 'none', reason: 'x' }, runtime().rt);
    const stop = client.start();
    client.session.landmarkClicked('reef');
    expect(injected()).toHaveLength(0);
    stop();
  });
});
