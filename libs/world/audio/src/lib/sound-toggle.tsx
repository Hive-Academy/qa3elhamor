import { useSound } from './audio-context.js';
import './sound-toggle.css';

export interface SoundToggleProps {
  /** The button's name while it is a plain on/off switch, e.g. "Sound". */
  readonly label: string;
  /** The visible invitation before any choice, e.g. "Sound on?". Becomes the name then. */
  readonly promptLabel: string;
  /** `dive`: under the depth gauge; `page`: the page view's bottom corner. */
  readonly placement: 'dive' | 'page';
}

/** A speaker; sound waves when on, a cross when off. Decorative: the button carries the name. */
function SpeakerIcon({ on }: { readonly on: boolean }) {
  return (
    <svg
      className="sound-toggle__icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {on ? (
        <path
          d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M16 9.5l5 5M21 9.5l-5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/**
 * The persistent sound switch: a toggle button (`aria-pressed`) reached by Tab and pressed
 * with Enter or Space, at least 44 × 44 px. Before the visitor has chosen, and while nothing
 * plays, it shows its invitation as text ("Sound on?"); otherwise just the speaker, with the
 * label as its accessible name. Renders nothing where sound is unavailable.
 */
export function SoundToggle({ label, promptLabel, placement }: SoundToggleProps) {
  const sound = useSound();
  if (!sound.available) return null;
  return (
    <button
      type="button"
      className="sound-toggle"
      data-placement={placement}
      data-prompt={sound.prompt ? '' : undefined}
      data-playing={sound.playing ? '' : undefined}
      // SOUND_TOGGLE_ATTRIBUTE: the gesture gate leaves presses on the toggle to the toggle.
      data-sound-toggle=""
      aria-pressed={sound.on}
      title={sound.prompt ? undefined : label}
      onClick={sound.toggle}
    >
      <SpeakerIcon on={sound.on} />
      <span className={sound.prompt ? 'sound-toggle__prompt' : 'sound-toggle__label'}>
        {sound.prompt ? promptLabel : label}
      </span>
    </button>
  );
}
