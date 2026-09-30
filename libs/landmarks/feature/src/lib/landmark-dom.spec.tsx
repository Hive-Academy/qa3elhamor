import {
  createLandmarkRegistry,
  type LandmarkDefinition,
  type LandmarkRegistry,
} from '@qa3elhamor/landmarks-domain';
import type { LandmarkOverlayProps } from '@qa3elhamor/landmarks-ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  LandmarkProvider,
  useLandmarkActions,
  type LandmarkEvent,
} from './landmark-context.js';
import { LandmarkNav, LandmarkOverlays } from './landmark-dom.js';
import { ModelBoundary } from './landmark-layer.js';

const definitions: LandmarkDefinition[] = [
  {
    id: 'pineapple',
    model: 'landmark-pineapple',
    position: [0, 0, 0],
    waypoint: 'wp-pineapple',
    overlay: 'about',
    label: { en: 'The Pineapple', ar: 'بيت الأناناس' },
    caption: 'About',
  },
  {
    id: 'bureau',
    model: 'landmark-bureau',
    position: [1, 0, 0],
    waypoint: 'wp-bureau',
    overlay: 'contact',
    label: 'Bureau',
  },
  {
    id: 'wall',
    model: 'landmark-wall',
    position: [2, 0, 0],
    waypoint: 'wp-wall',
    presentation: 'in-world',
    scene: 'board',
    label: 'Complaints Wall',
    caption: 'Hover a note to read it',
  },
];

/** Stands in for clicks on models and beacons: inside an aria-hidden, untabbable canvas. */
function CanvasStandIn() {
  const { activate } = useLandmarkActions();
  return (
    <div aria-hidden="true">
      {definitions.map((d) => (
        <button
          key={d.id}
          type="button"
          tabIndex={-1}
          onClick={() => activate(d.id, 'pointer')}
        >
          {`3d-${d.id}`}
        </button>
      ))}
    </div>
  );
}

const clickInCanvas = (id: string) =>
  fireEvent.click(screen.getByText(`3d-${id}`));

function registry(): LandmarkRegistry {
  const result = createLandmarkRegistry(definitions);
  if (!result.ok) throw new Error('bad fixture');
  return result.value;
}

const About = ({ title, onClose }: LandmarkOverlayProps) => (
  <div>
    <p>About overlay for {title}</p>
    <button type="button" onClick={onClose}>
      Done
    </button>
  </div>
);
const Contact = () => <p>Contact overlay</p>;

function setup(locale = 'en') {
  const camera = { focus: vi.fn(), release: vi.fn() };
  const events: LandmarkEvent[] = [];
  const view = render(
    <LandmarkProvider
      registry={registry()}
      camera={camera}
      locale={locale}
      onLandmarkEvent={(e) => events.push(e)}
    >
      <CanvasStandIn />
      <LandmarkNav />
      <LandmarkOverlays overlays={{ about: About, contact: Contact }} />
    </LandmarkProvider>,
  );
  return { camera, events, ...view };
}

describe('landmark wiring', () => {
  it('opens a landmark from the keyboard list: camera focus, overlay, events', () => {
    const { camera, events } = setup();
    const button = screen.getByRole('button', { name: /The Pineapple/ });
    act(() => button.focus());
    fireEvent.click(button, { detail: 0 });

    expect(camera.focus).toHaveBeenCalledWith('wp-pineapple');
    expect(screen.getByRole('dialog', { name: 'The Pineapple' })).toBeTruthy();
    expect(screen.getByText('About overlay for The Pineapple')).toBeTruthy();
    expect(events).toEqual([
      { type: 'landmark_hover', landmarkId: 'pineapple', source: 'keyboard' },
      { type: 'landmark_open', landmarkId: 'pineapple', source: 'keyboard' },
    ]);
  });

  it('releases the camera on Esc and returns focus to the list', () => {
    const { camera, events } = setup();
    const button = screen.getByRole('button', { name: 'Bureau' });
    act(() => button.focus());
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(camera.release).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(events).toContainEqual({
      type: 'landmark_close',
      landmarkId: 'bureau',
      reason: 'escape',
    });
  });

  it('lets an overlay close itself', () => {
    const { camera } = setup();
    fireEvent.click(screen.getByRole('button', { name: /The Pineapple/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(camera.release).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders Arabic labels right-to-left', () => {
    setup('ar');
    expect(screen.getByRole('navigation').getAttribute('dir')).toBe('rtl');
    fireEvent.click(screen.getByRole('button', { name: /بيت الأناناس/ }));
    expect(
      screen.getByRole('dialog', { name: 'بيت الأناناس' }).getAttribute('dir'),
    ).toBe('rtl');
  });

  it('releases the camera if torn down with an overlay open', () => {
    const { camera, unmount } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Bureau' }));
    unmount();
    expect(camera.release).toHaveBeenCalledTimes(1);
  });
});

describe('presentation, switching and focus return', () => {
  it('returns focus to the landmark list when the dialog was opened from the canvas', () => {
    setup();
    clickInCanvas('bureau');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    const entry = screen.getByRole('button', { name: 'Bureau' });
    expect(document.activeElement).toBe(entry);
  });

  it('opens an in-world landmark without a dialog, with a way back to the dive', () => {
    const { camera } = setup();
    clickInCanvas('wall');
    expect(camera.focus).toHaveBeenCalledWith('wp-wall');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByRole('region', { name: 'Complaints Wall' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the dive' }));
    expect(camera.release).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /Complaints Wall/ }),
    );
  });

  it('switches from one open landmark to another without releasing the camera in between', () => {
    const { camera, events } = setup();
    clickInCanvas('wall');
    clickInCanvas('bureau');
    expect(camera.focus.mock.calls).toEqual([['wp-wall'], ['wp-bureau']]);
    expect(camera.release).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Bureau' })).toBeTruthy();
    expect(events).toContainEqual({
      type: 'landmark_close',
      landmarkId: 'wall',
      reason: 'switch',
    });
  });

  it('leaves the page scroll to the camera port', () => {
    setup();
    clickInCanvas('pineapple');
    expect(document.documentElement.style.overflow).toBe('');
  });
});

describe('ModelBoundary', () => {
  it('swaps a failed model for the fallback and reports it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onError = vi.fn();
    const Explode = (): never => {
      throw new Error('404');
    };
    render(
      <ModelBoundary
        resetKey="landmark-tiki"
        onError={onError}
        fallback={<p>still clickable</p>}
      >
        <Explode />
      </ModelBoundary>,
    );
    expect(screen.getByText('still clickable')).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    vi.restoreAllMocks();
  });
});
