import { useSfx } from '@qa3elhamor/world-audio';
import { useCallback, useState } from 'react';

export interface NarratorPoke {
  /** A counter for `<Narrator poke>`: each change makes a rigged model react. */
  readonly poke: number;
  /** A click or tap on the narrator, or the HUD's "Say hi": it reacts, with a bubble pop. */
  readonly onPoke: () => void;
}

/**
 * Saying hi to a narrator: a click or tap on it in the scene, or the visit HUD's "Say hi" for
 * the keyboard. A rigged model plays its `react` clip (none under reduced motion, where the
 * animator holds the rest pose); the pop plays either way, and follows the sound toggle.
 * Development builds count the pokes on `<html data-narrator-pokes>` for the browser check.
 */
export function useNarratorPoke(): NarratorPoke {
  const [poke, setPoke] = useState(0);
  const { pop } = useSfx();
  const onPoke = useCallback(() => {
    setPoke((n) => n + 1);
    pop();
    if (import.meta.env.DEV) {
      const root = document.documentElement;
      root.dataset['narratorPokes'] = String(
        Number(root.dataset['narratorPokes'] ?? 0) + 1,
      );
    }
  }, [pop]);
  return { poke, onPoke };
}
