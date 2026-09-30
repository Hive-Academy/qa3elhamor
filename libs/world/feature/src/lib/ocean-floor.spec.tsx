import { render, screen } from '@testing-library/react';
import { BoxGeometry, DataTexture, Group, Mesh, MeshStandardMaterial } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelErrorBoundary, disposeObjectTree, retainModel } from './ocean-floor.js';

function Explode(): never {
  throw new Error('404 environment.glb');
}

describe('ModelErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('contains a failed load, reports it and clears the loader cache for a retry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // React's own boundary log
    const onError = vi.fn();
    const clearCache = vi.fn();

    render(
      <>
        <ModelErrorBoundary url="/models/environment.glb" onError={onError} clearCache={clearCache}>
          <Explode />
        </ModelErrorBoundary>
        <p>ocean still here</p>
      </>
    );

    expect(screen.getByText('ocean still here')).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), '/models/environment.glb');
    expect(clearCache).toHaveBeenCalledWith('/models/environment.glb');
  });

  it('tries again when the url changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let fail = true;
    function Model() {
      if (fail) throw new Error('offline');
      return <p>model</p>;
    }
    const props = { onError: vi.fn(), clearCache: vi.fn() };
    const { rerender } = render(
      <ModelErrorBoundary url="/a.glb" {...props}>
        <Model />
      </ModelErrorBoundary>
    );
    expect(screen.queryByText('model')).toBeNull();

    fail = false;
    rerender(
      <ModelErrorBoundary url="/b.glb" {...props}>
        <Model />
      </ModelErrorBoundary>
    );
    expect(screen.getByText('model')).toBeTruthy();
  });
});

describe('model lifetime', () => {
  afterEach(() => vi.useRealTimers());

  it('disposes every geometry, material and texture once', () => {
    const texture = new DataTexture(new Uint8Array(4), 1, 1);
    const material = new MeshStandardMaterial({ map: texture });
    const geometry = new BoxGeometry();
    const root = new Group().add(new Mesh(geometry, material), new Mesh(geometry, material));
    const disposed = { geometry: 0, material: 0, texture: 0 };
    geometry.addEventListener('dispose', () => disposed.geometry++);
    material.addEventListener('dispose', () => disposed.material++);
    texture.addEventListener('dispose', () => disposed.texture++);

    disposeObjectTree(root);

    expect(disposed.geometry).toBeGreaterThan(0);
    expect(disposed.material).toBe(1);
    expect(disposed.texture).toBe(1);
  });

  it('survives an immediate re-acquire (StrictMode remount) and releases after the last user', () => {
    vi.useFakeTimers();
    const root = new Group();
    const release = vi.fn();

    const first = retainModel(root, release);
    first(); // StrictMode's simulated unmount ...
    const second = retainModel(root, release); // ... and synchronous remount
    vi.runAllTimers();
    expect(release).not.toHaveBeenCalled();

    second();
    vi.runAllTimers();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
