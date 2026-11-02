// The Sound panel's logic (SPEC §4.3; docs/plans/v5-sound-model.md, rulings 3 and 7), pure: no
// DOM, no timers. The panel holds Volume, Listen for, Tempo, Drum machines and Also play; every
// sound control is an action (`setListen`, `setAlso`, `nextKits` in actions.ts). This module says
// what the read-only parts show: each juggler on stage with its drum machine, in its stage colour.
import { jugglerCount, kitOf } from '../sound/drummers';
import { copy } from '../ui/copy';
import { laneDot } from './lanes-view';
import type { AppState } from './state';

export interface DrummerRow {
  /** 0-based: juggler 1 is the one drawn on the left. */
  readonly juggler: number;
  /** "Juggler 1". */
  readonly label: string;
  /** The DRUMMER_KITS id, and its name to show. */
  readonly kit: string;
  readonly kitName: string;
  /** The juggler's colour on the stage (its first hand's), or null where the stage draws none (one or two hands). */
  readonly colour: string | null;
}

/** One row per juggler on stage, in stage order, with the drum machine it plays. */
export function drummerRows(state: Pick<AppState, 'parts' | 'kitShift'>): readonly DrummerRow[] {
  const hands = state.parts.length;
  return Array.from({ length: jugglerCount(hands) }, (_, j) => {
    const kit = kitOf(j, state.kitShift);
    return { juggler: j, label: copy.drummerJuggler(j), kit, kitName: copy.kitNames[kit] ?? kit, colour: laneDot(2 * j, hands) };
  });
}
