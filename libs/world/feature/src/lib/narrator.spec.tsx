import { render } from '@testing-library/react';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type SkinnedMesh } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NarratorCastId } from './narrator-cast.js';
import { SPONGEBOB_RIG } from './narrator-rig.js';
import { Narrator } from './narrator.js';

// No WebGL here: the frame loop is stubbed and the R3F intrinsics render as inert DOM elements,
// which is enough to see what `<Narrator>` mounts (and that it does not throw).
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }));
vi.mock('@react-three/drei', () => ({ useCursor: () => undefined }));

describe('<Narrator> at the config boundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // unknown-tag warnings for <group> etc.
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders nothing while a model is still loading, then mounts once its object arrives', () => {
    const props = { position: [0, 0, 0] as const, talking: false, present: true };
    const { container, rerender } = render(<Narrator {...props} cast={{ object: null }} />);
    expect(container.innerHTML).toBe('');
    rerender(<Narrator {...props} cast={{ object: undefined }} />);
    expect(container.innerHTML).toBe('');
    rerender(<Narrator {...props} cast={{ object: new Group(), height: 0.6 }} />);
    expect(container.querySelector('primitive')).not.toBeNull();
  });

  it('plays the fallback cast for an unknown id, with a warning, instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { container } = render(
      <Narrator cast={'spongebob-typo' as NarratorCastId} position={[0, 0, 0]} talking={false} present />
    );
    expect(container.querySelector('mesh')).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('mounts nothing when it starts away', () => {
    const { container } = render(<Narrator cast="crab-clerk" position={[0, 0, 0]} talking={false} present={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('mounts a skinned clone of a rigged model, leaving the loaded object unskinned', () => {
    const model = new Group();
    model.add(new Mesh(new BoxGeometry(2, 10, 2), new MeshStandardMaterial()));
    const { container } = render(
      <Narrator cast={{ object: model, rig: SPONGEBOB_RIG }} position={[0, 0, 0]} talking={false} present />
    );
    expect(container.querySelector('primitive')).not.toBeNull();
    let skinned = 0;
    model.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) skinned += 1;
    });
    expect(skinned).toBe(0);
  });

  it('falls back to the static model, with an error, when the model cannot be rigged', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const empty = new Group();
    const { container } = render(
      <Narrator cast={{ object: empty, rig: SPONGEBOB_RIG }} position={[0, 0, 0]} talking={false} present />
    );
    expect(container.querySelector('primitive')).not.toBeNull();
    expect(error.mock.calls.some(([message]) => String(message).includes('could not be rigged'))).toBe(true);
  });

  it('mounts a clone, leaving the cached model unparented and untouched', () => {
    const cached = new Group();
    cached.name = 'cached';
    const cloneSpy = vi.spyOn(cached, 'clone');
    render(<Narrator cast={{ object: cached, clone: true }} position={[0, 0, 0]} talking={false} present />);
    expect(cloneSpy).toHaveBeenCalledWith(true);
    expect(cached.parent).toBeNull();
  });
});
