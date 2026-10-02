import type { NarrationLandmarkId } from '@qa3elhamor/content-domain';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Plane, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import type { ResidentPlacement } from '../narrators.config';
import {
  PLACEMENT_EDITS,
  nudgePlacement,
  placementSnippet,
  type GroundAxes,
} from './placement-edit';
import './placement-panel.css';

/*
 * The resident placement tool (`?place=resident`, development only; lazy, never in a
 * production bundle). Mounted inside the scene next to a resident: keys and Alt-drag edit its
 * placement live (`PLACEMENT_EDITS`), and a small DOM panel shows the numbers and copies the
 * config line. See `narrators/README.md`.
 */

export interface ResidentPlacementToolProps {
  readonly landmark: NarrationLandmarkId;
  /** What it stands at now (the live edit, or the config's). */
  readonly placement: ResidentPlacement;
  /** The landmark's frame (`landmarkFrameOf`): offsets are in its space. */
  readonly frame: Object3D | null;
  /** Where its feet are now, world units (the drag plane's height). */
  readonly spot: readonly [number, number, number];
  /** The heading it rests at now, degrees in the landmark's frame (for Q / E from 'camera'). */
  readonly facingNow: number;
}

/** The newest tool takes the keys: there is normally just one rigged resident on screen. */
let active: NarrationLandmarkId | null = null;

const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

const cameraDir = new Vector3();
const local = new Vector3();
const origin = new Vector3();

export default function ResidentPlacementTool(props: ResidentPlacementToolProps) {
  const { landmark } = props;
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    active = landmark;
    return () => {
      if (active === landmark) active = null;
    };
  }, [landmark]);

  // Keys: arrows along the ground (away from the camera is "up"), PageUp/Down, Q/E, +/-.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (active !== landmark || typing(event.target) || event.ctrlKey || event.metaKey) return;
      const { placement, frame, facingNow } = latest.current;
      const next = nudgePlacement(
        placement,
        event.key,
        event.shiftKey,
        groundAxes(camera, frame),
        facingNow,
      );
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      PLACEMENT_EDITS.set(landmark, next);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [camera, landmark]);

  // Alt + drag: it follows the pointer on the ground, at the height it stands.
  useEffect(() => {
    const ray = new Raycaster();
    const ndc = new Vector2();
    const plane = new Plane();
    const hit = new Vector3();
    let dragging = false;
    const place = (event: PointerEvent): void => {
      const { placement, frame, spot } = latest.current;
      if (!frame) return;
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      plane.set(new Vector3(0, 1, 0), -spot[1]);
      if (!ray.ray.intersectPlane(plane, hit)) return;
      frame.updateWorldMatrix(true, false);
      const at = frame.worldToLocal(hit.clone());
      const round = (v: number) => Math.round(v * 10000) / 10000;
      PLACEMENT_EDITS.set(landmark, {
        ...placement,
        offset: [round(at.x), placement.offset[1], round(at.z)],
      });
    };
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const onDown = (event: PointerEvent) => {
      if (!event.altKey || active !== landmark) return;
      dragging = true;
      canvas.setPointerCapture(event.pointerId);
      stop(event);
      place(event);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      stop(event);
      place(event);
    };
    const onUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      stop(event);
    };
    canvas.addEventListener('pointerdown', onDown, { capture: true });
    canvas.addEventListener('pointermove', onMove, { capture: true });
    canvas.addEventListener('pointerup', onUp, { capture: true });
    return () => {
      canvas.removeEventListener('pointerdown', onDown, { capture: true });
      canvas.removeEventListener('pointermove', onMove, { capture: true });
      canvas.removeEventListener('pointerup', onUp, { capture: true });
    };
  }, [camera, canvas, landmark]);

  // The panel: its own DOM root on the page (the scene's React root renders three.js objects).
  const root = useRef<Root | null>(null);
  useEffect(() => {
    const host = document.createElement('div');
    host.className = 'placement-panel-host';
    document.body.appendChild(host);
    root.current = createRoot(host);
    return () => {
      const r = root.current;
      root.current = null;
      // Unmounting while React is rendering warns: let the current pass finish first.
      queueMicrotask(() => {
        r?.unmount();
        host.remove();
      });
    };
  }, []);
  useEffect(() => {
    root.current?.render(
      <PlacementPanel
        landmark={landmark}
        placement={props.placement}
        facingNow={props.facingNow}
      />,
    );
  });
  return null;
}

/** The camera's right and forward on the ground, in the landmark's frame (unit x, z). */
function groundAxes(
  camera: Object3D,
  frame: Object3D | null,
): GroundAxes | undefined {
  if (!frame) return undefined;
  frame.updateWorldMatrix(true, false);
  camera.getWorldDirection(cameraDir);
  // The view direction, as a direction in the frame (two points, so scale and offset cancel).
  frame.worldToLocal(origin.set(0, 0, 0));
  frame.worldToLocal(local.copy(cameraDir));
  const fx = local.x - origin.x;
  const fz = local.z - origin.z;
  const length = Math.hypot(fx, fz);
  if (!(length > 1e-6)) return undefined;
  const forward: [number, number] = [fx / length, fz / length];
  // Right of forward, looking down from above (+y): (x, z) -> (-z, x).
  return { forward, right: [-forward[1], forward[0]] };
}

function PlacementPanel({
  landmark,
  placement,
  facingNow,
}: {
  readonly landmark: NarrationLandmarkId;
  readonly placement: ResidentPlacement;
  readonly facingNow: number;
}) {
  const snippet = placementSnippet(landmark, placement);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const [x, y, z] = placement.offset;
  const copy = () => {
    const done = (ok: boolean) => {
      setCopied(ok ? 'yes' : 'no');
      window.setTimeout(() => setCopied(null), 1800);
    };
    if (!navigator.clipboard) return done(false);
    navigator.clipboard.writeText(snippet).then(
      () => done(true),
      () => done(false),
    );
  };
  return (
    <section className="placement-panel" aria-label={`Resident placement: ${landmark}`}>
      <h2>Resident · {landmark}</h2>
      <dl>
        <dt>offset</dt>
        <dd>
          {x.toFixed(4)}, {y.toFixed(4)}, {z.toFixed(4)}
        </dd>
        <dt>facing</dt>
        <dd>
          {placement.facing === 'camera'
            ? `camera (${facingNow.toFixed(0)}°)`
            : `${placement.facing}°`}
        </dd>
        <dt>scale</dt>
        <dd>{(placement.scale ?? 1).toFixed(3)}</dd>
      </dl>
      <div className="placement-panel-actions">
        <button
          type="button"
          onClick={() => PLACEMENT_EDITS.set(landmark, { ...placement, facing: 'camera' })}
          disabled={placement.facing === 'camera'}
        >
          Face camera
        </button>
        <button type="button" onClick={copy}>
          Copy config
        </button>
      </div>
      <output className="placement-panel-status" aria-live="polite">
        {copied === 'yes' ? 'Copied.' : copied === 'no' ? 'Copy failed: select the line below.' : ''}
      </output>
      <textarea readOnly rows={2} value={snippet} aria-label="Config line" onFocus={(e) => e.currentTarget.select()} />
      <p className="placement-panel-help">
        Arrows move (up = away from the camera) · PgUp/PgDn height · Q/E turn · +/− size ·
        Shift fine · Alt+drag on the ground. Paste into RESIDENT_PLACEMENTS in
        narrators.config.ts.
      </p>
    </section>
  );
}
