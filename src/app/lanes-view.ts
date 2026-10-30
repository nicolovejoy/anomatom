// What the Rhythm tab's lanes look like (docs/plans/lanes.md, stream B), pure: no DOM, no
// timers. lanes-model.ts holds what each lane is and what its controls do; this holds the
// presentational rules on top: the colour dot, the voice name, the cell grid, the ratio chips,
// and the cell under the playhead. mount-knobs.ts turns these values into elements.
import { mod } from '../core';
import type { Mapping } from '../sound/mapping';
import { LANES_UI } from '../tunables';
import { copy } from '../ui/copy';
import { partColour } from '../view/colours';
import type { PlayerView, Segment } from '../view/types';

/**
 * A lane's colour dot, or null. The ladder and the juggler tint parts only at three or more, so
 * the dot shows only then: at one or two lanes it would name a colour drawn nowhere.
 */
export const laneDot = (part: number, lanes: number): string | null => (lanes >= LANES_UI.dotsFromLanes ? partColour(part) : null);

/** The ratio chips are shortcuts for two lanes' rates: shown while there are exactly two. */
export const ratioChipsShown = (lanes: number): boolean => lanes === 2;

/**
 * The name of the sound a lane plays, as the Sound tab names it. A mapping that reads throw
 * height or ball picks the sound per throw, not per hand, and says so.
 */
export function voiceName(mapping: Mapping, part: number): string {
  if (mapping.byBall !== null) return copy.voiceByBall;
  if (mapping.byHeight) return copy.voiceByHeight;
  const sample = mapping.parts[part]?.sample ?? null;
  return sample === null ? copy.noSample : (copy.sampleNames[sample] ?? sample);
}

/**
 * Step cells per row. A short period fills its row (never under `minColumns`, so one step is not
 * one wide bar); on a phone a row holds at most `phoneColumns` and a longer period wraps; a wide
 * column holds the whole period in one row.
 */
export function cellColumns(steps: number, wide: boolean): number {
  const atLeast = Math.max(LANES_UI.minColumns, steps);
  return wide ? atLeast : Math.min(LANES_UI.phoneColumns, atLeast);
}

/** Where focus goes once lane `removed` is gone: the lane above's header, or Add a hand when it was the first. */
export const focusAfterRemove = (removed: number): number | 'add' => (removed > 0 ? removed - 1 : 'add');

/**
 * Where focus goes after Add a hand: it stays on Add while Add still applies (null); at the
 * last lane Add disables under focus, so focus moves to the newest lane's header.
 */
export const focusAfterAdd = (lanes: number, canAdd: boolean): number | null => (canAdd ? null : lanes - 1);

/** The segment the picture is in at `view.now`: the first not yet ended, else the last. */
function segmentAt(view: PlayerView): Segment | null {
  const { segments, now } = view;
  return segments.find((s) => s.endTime !== null && now < s.endTime) ?? segments[segments.length - 1] ?? null;
}

/**
 * The step cell under the playhead in each lane, while playing; null otherwise, or for a lane
 * the sounding schedule does not have. Read off the sounding segment's grid (its spacing and
 * phase, in its pulses), so the outline follows what is heard: the beat of the period the
 * pulse falls in, counted from the lane's phase.
 */
export function playheadSteps(view: PlayerView, steps: readonly number[]): (number | null)[] {
  const seg = view.state === 'playing' ? segmentAt(view) : null;
  if (seg === null) return steps.map(() => null);
  const pulse = mod(Math.max(0, (view.now - seg.startTime) / seg.pulseLen), seg.schedule.cycle);
  return steps.map((n, part) => {
    const grid = seg.schedule.grids[part];
    if (grid === undefined) return null;
    return Math.floor(mod(pulse - grid.phase, grid.spacing * n) / grid.spacing);
  });
}
