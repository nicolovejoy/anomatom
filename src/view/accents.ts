// SPEC §7.3: the accent mark on the ladder strip where a cross throw lands on a pulse both hand
// grids share (the downbeat of a 3:2 exchange). Pure; the canvas draws it.
import type { PartIndex } from '../core/types';
import type { Frame } from './ladder';

export interface Accent {
  /** x in pulses from the left edge of the window, as the frame's bars. */
  readonly x: number;
  /** The catching part, on whose lane the mark sits. */
  readonly part: PartIndex;
}

/**
 * Every cross bar in `frame` whose landing falls on a coincident tick of the catching hand,
 * once per landing. A landing outside the window has no tick and no mark. At 1:1 no pulse is
 * coincident (the hands alternate), so there are none.
 */
export function accents(frame: Frame): Accent[] {
  // Ticks and bars both sit at an integer pulse minus `start`; key on the integer.
  const at = (part: PartIndex, x: number) => `${part}:${Math.round(x + frame.start)}`;
  const coincident = new Set(frame.ticks.filter((t) => t.coincident).map((t) => at(t.part, t.x)));
  const out = new Map<string, Accent>();
  for (const b of frame.bars) {
    const key = at(b.to, b.x1);
    if (b.cross && coincident.has(key)) out.set(key, { x: b.x1, part: b.to });
  }
  return [...out.values()];
}
