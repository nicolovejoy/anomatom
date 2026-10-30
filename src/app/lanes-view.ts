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

/** Step cells per row on a wide column: the whole period, never fewer than a phone's row. */
export const wideColumns = (steps: number): number => Math.max(LANES_UI.phoneColumns, steps);

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
