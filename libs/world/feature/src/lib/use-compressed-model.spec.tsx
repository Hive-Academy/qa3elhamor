import { render } from '@testing-library/react';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCompressedModel } from './use-compressed-model.js';

const mocks = vi.hoisted(() => ({
  useLoader: Object.assign(vi.fn(), { clear: vi.fn() }),
}));
vi.mock('@react-three/fiber', () => ({ useLoader: mocks.useLoader }));

function Probe({
  url,
  onModel,
}: {
  url: string | null;
  onModel: (model: unknown) => void;
}) {
  onModel(useCompressedModel(url));
  return null;
}

describe('useCompressedModel', () => {
  it('gives each user its own instance, so one model can be mounted twice', () => {
    const scene = new Group().add(
      new Mesh(new BoxGeometry(), new MeshStandardMaterial()),
    );
    mocks.useLoader.mockReturnValue([{ scene }]);
    const seen: unknown[] = [];
    render(
      <>
        <Probe url="/models/a.glb" onModel={(m) => seen.push(m)} />
        <Probe url="/models/a.glb" onModel={(m) => seen.push(m)} />
      </>,
    );
    expect(new Set(seen).size).toBe(2);
  });

  afterEach(() => vi.useRealTimers());

  it('returns the loaded scene and releases it after the last user unmounts', () => {
    vi.useFakeTimers();
    const geometry = new BoxGeometry();
    const scene = new Group().add(
      new Mesh(geometry, new MeshStandardMaterial()),
    );
    mocks.useLoader.mockReturnValue([{ scene }]);
    const dispose = vi.spyOn(geometry, 'dispose');
    const onModel = vi.fn();
    const { unmount } = render(
      <Probe url="/models/landmark-tiki.glb" onModel={onModel} />,
    );

    const instance = onModel.mock.calls[0][0] as Group;
    expect(instance).not.toBe(scene);
    expect((instance.children[0] as Mesh).geometry).toBe(geometry);
    expect(mocks.useLoader).toHaveBeenCalledWith(
      expect.any(Function),
      ['/models/landmark-tiki.glb'],
      expect.any(Function),
    );

    unmount();
    vi.runAllTimers();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(mocks.useLoader.clear).toHaveBeenCalledWith(
      expect.any(Function),
      '/models/landmark-tiki.glb',
    );
  });

  it('fetches nothing for a null url and returns an empty placeholder', () => {
    vi.useFakeTimers();
    mocks.useLoader.mockClear();
    mocks.useLoader.clear.mockClear();
    mocks.useLoader.mockReturnValue([]);
    const onModel = vi.fn();
    const { unmount } = render(<Probe url={null} onModel={onModel} />);

    expect(mocks.useLoader).toHaveBeenCalledWith(expect.any(Function), [], expect.any(Function));
    const placeholder = onModel.mock.calls[0][0] as Group;
    expect(placeholder).toBeInstanceOf(Group);
    expect(placeholder.children).toHaveLength(0);

    unmount();
    vi.runAllTimers();
    expect(mocks.useLoader.clear).not.toHaveBeenCalled();
  });
});
