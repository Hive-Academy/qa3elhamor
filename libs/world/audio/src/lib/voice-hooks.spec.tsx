import { VOICE_PROFILES, babbleFor, type VoiceProfileId } from '@qa3elhamor/world-domain';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from './audio-engine.js';
import {
  AudioBridge,
  AudioProvider,
  useAudioBridge,
  useSfx,
  useVoiceBabble,
  type AudioBridgeValue,
  type SfxControls,
} from './audio-context.js';

const fakeEngine = () =>
  ({
    start: vi.fn(),
    stop: vi.fn(),
    setDepth: vi.fn(),
    setDucked: vi.fn(),
    blip: vi.fn(),
    pop: vi.fn(),
    whoosh: vi.fn(),
    plip: vi.fn(),
    dispose: vi.fn(),
  }) satisfies AudioEngine;

interface ProbeProps {
  readonly voice: VoiceProfileId | null;
  readonly revealed: string;
  readonly onSfx?: (sfx: SfxControls) => void;
}

function Probe({ voice, revealed, onSfx }: ProbeProps) {
  useVoiceBabble(voice, revealed);
  const sfx = useSfx();
  useEffect(() => onSfx?.(sfx), [sfx, onSfx]);
  return <p>scene</p>;
}

function renderVoice(initial: ProbeProps) {
  const engine = fakeEngine();
  const view = (props: ProbeProps) => (
    <AudioProvider music={null} ambience presentation="dive" createEngine={() => engine} storage={null}>
      <Probe {...props} />
    </AudioProvider>
  );
  const result = render(view(initial));
  const activate = () =>
    act(() => {
      fireEvent.pointerDown(screen.getByText('scene'));
    });
  return { engine, activate, rerender: (props: ProbeProps) => result.rerender(view(props)) };
}

describe('useVoiceBabble and useSfx', () => {
  afterEach(() => vi.restoreAllMocks());

  it('babbles the newly typed letters in the narrator voice once sound is on', () => {
    const { engine, activate, rerender } = renderVoice({ voice: 'hamour', revealed: '' });
    activate();
    const steps = ['H', 'He', 'Hel', 'Hell', 'Hello'];
    for (const revealed of steps) rerender({ voice: 'hamour', revealed });

    const expected = steps.flatMap((next, i) => babbleFor(steps[i - 1] ?? '', next, VOICE_PROFILES.hamour));
    expect(expected.length).toBeGreaterThan(0);
    expect(engine.blip.mock.calls).toEqual(
      expected.map((b) => [VOICE_PROFILES.hamour, b.char, b.delayS]),
    );
  });

  it('is silent before the first gesture, for no voice, and for a line shown whole', () => {
    const { engine, activate, rerender } = renderVoice({ voice: 'patrick', revealed: '' });
    rerender({ voice: 'patrick', revealed: 'Hi' });
    expect(engine.blip).not.toHaveBeenCalled();

    activate();
    rerender({ voice: null, revealed: 'Hi t' });
    rerender({ voice: 'patrick', revealed: 'A whole line, shown at once for reduced motion.' });
    expect(engine.blip).not.toHaveBeenCalled();
  });

  it('plays the UI sounds once sound is on', () => {
    let sfx: SfxControls | null = null;
    const { engine, activate } = renderVoice({
      voice: null,
      revealed: '',
      onSfx: (next) => {
        sfx = next;
      },
    });
    const controls = () => {
      if (!sfx) throw new Error('useSfx did not render');
      return sfx;
    };
    controls().pop();
    expect(engine.pop).not.toHaveBeenCalled();

    activate();
    controls().pop();
    controls().whoosh();
    controls().plip();
    expect(engine.pop).toHaveBeenCalledTimes(1);
    expect(engine.whoosh).toHaveBeenCalledTimes(1);
    expect(engine.plip).toHaveBeenCalledTimes(1);
  });

  it('carries the sound into a separate React root through AudioBridge', () => {
    const engine = fakeEngine();
    const bridge: { value: AudioBridgeValue } = { value: null };
    function Capture() {
      bridge.value = useAudioBridge();
      return <p>scene</p>;
    }
    render(
      <AudioProvider music={null} ambience presentation="dive" createEngine={() => engine} storage={null}>
        <Capture />
      </AudioProvider>,
    );
    act(() => {
      fireEvent.pointerDown(screen.getByText('scene'));
    });

    // A second, unrelated root (as drei's <Html> makes): only the bridge connects it.
    const seen: { sfx: SfxControls | null } = { sfx: null };
    render(
      <AudioBridge value={bridge.value}>
        <Probe
          voice={null}
          revealed=""
          onSfx={(next) => {
            seen.sfx = next;
          }}
        />
      </AudioBridge>,
    );
    seen.sfx?.pop();
    expect(engine.pop).toHaveBeenCalledTimes(1);
  });

  it('is a safe no-op without a provider', () => {
    const seen: { sfx: SfxControls | null } = { sfx: null };
    const onSfx = (next: SfxControls) => {
      seen.sfx = next;
    };
    const { rerender } = render(<Probe voice="spongebob" revealed="" onSfx={onSfx} />);
    rerender(<Probe voice="spongebob" revealed="Hey" onSfx={onSfx} />);
    expect(seen.sfx).not.toBeNull();
    expect(() => {
      seen.sfx?.pop();
      seen.sfx?.whoosh();
      seen.sfx?.plip();
    }).not.toThrow();
  });
});
