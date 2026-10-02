import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeechBubble, type SpeechBubbleProps } from './speech-bubble';

const sound = vi.hoisted(() => ({
  babble: vi.fn(),
  pop: vi.fn(),
  whoosh: vi.fn(),
  plip: vi.fn(),
}));

vi.mock('@qa3elhamor/world-audio', () => ({
  useVoiceBabble: sound.babble,
  useSfx: () => ({ pop: sound.pop, whoosh: sound.whoosh, plip: sound.plip }),
}));

afterEach(() => vi.clearAllMocks());

const base: SpeechBubbleProps = {
  speaker: 'SpongeBob',
  text: 'Hi there!',
  typing: false,
  take: 0,
  onTyped: () => undefined,
  onAdvance: () => undefined,
  roleDescription: 'speech bubble',
};

describe('<SpeechBubble> sound', () => {
  it("babbles the typed text in the speaker's voice", () => {
    render(<SpeechBubble {...base} voice="spongebob" />);
    expect(sound.babble).toHaveBeenLastCalledWith('spongebob', 'Hi there!');
  });

  it('is silent without a voice, and once it is departing', () => {
    const { rerender } = render(<SpeechBubble {...base} />);
    expect(sound.babble).toHaveBeenLastCalledWith(null, 'Hi there!');
    rerender(<SpeechBubble {...base} voice="patrick" departing />);
    expect(sound.babble).toHaveBeenLastCalledWith(null, 'Hi there!');
  });

  it('babbles from the first letter while a line types out', () => {
    vi.useFakeTimers();
    try {
      render(<SpeechBubble {...base} voice="hamour" typing />);
      expect(sound.babble).toHaveBeenLastCalledWith('hamour', '');
    } finally {
      vi.useRealTimers();
    }
  });

  it('pops once as it appears, not on later renders, nor when it appears departing', () => {
    const { rerender, unmount } = render(<SpeechBubble {...base} />);
    rerender(<SpeechBubble {...base} text="Next line." take={1} />);
    expect(sound.pop).toHaveBeenCalledTimes(1);
    unmount();
    render(<SpeechBubble {...base} departing />);
    expect(sound.pop).toHaveBeenCalledTimes(1);
  });
});

describe('<SpeechBubble> "Say hi"', () => {
  it('pokes the narrator without advancing the line', () => {
    const onGreet = vi.fn();
    const onAdvance = vi.fn();
    render(
      <SpeechBubble
        {...base}
        onAdvance={onAdvance}
        greetLabel="Say hi"
        onGreet={onGreet}
      >
        <button type="button">Next</button>
      </SpeechBubble>,
    );
    const greet = screen.getByRole('button', { name: 'Say hi' });
    // Last in the tab order: after the footer's controls.
    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 1]).toBe(greet);
    fireEvent.click(greet);
    expect(onGreet).toHaveBeenCalledTimes(1);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('is not offered without a handler, nor on a departing bubble', () => {
    const { rerender } = render(<SpeechBubble {...base} greetLabel="Say hi" />);
    expect(screen.queryByRole('button', { name: 'Say hi' })).toBeNull();
    rerender(
      <SpeechBubble
        {...base}
        greetLabel="Say hi"
        onGreet={() => undefined}
        departing
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Say hi', hidden: true }),
    ).toBeNull();
  });
});
