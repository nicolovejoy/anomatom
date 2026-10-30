import { describe, expect, test } from 'vitest';
import { partsFromOnsets } from '../core';
import { typed } from '../test/schedules';
import { KNOBS, MAX_LANES, MAX_PERIOD, MAX_RATE } from '../tunables';
import { reduce, type Action } from './actions';
import { derived } from './derived';
import { analyse, cycleSamples } from './knobs-model';
import {
  ballsAction,
  canAddLane,
  cellAction,
  hitsAction,
  laneRows,
  phaseAction,
  rateAction,
  removeAction,
  stepsAction,
  type LaneRow,
} from './lanes-model';
import { defaultState, type AppState } from './state';

const clap = [true, true, true, false, true, true, false, true, false, true, true, false];
const clapping = (): AppState => ({ ...defaultState(), parts: partsFromOnsets([clap, clap], [1, 1]), drafts: [null, null] });
const rows = (s: AppState) => laneRows(s, derived(s));
const apply = (s: AppState, a: Action | null) => reduce(s, a as Action);

describe('laneRows', () => {
  test('one row per part: rate, steps, onsets, phase, balls and hits', () => {
    const s = clapping();
    const [h1, h2] = rows(s) as [LaneRow, LaneRow];
    expect(h1).toEqual({
      part: 0,
      rate: 1,
      steps: 12,
      onsets: clap,
      phase: 0,
      wrap: 12,
      cycle: 12,
      hits: 8,
      k: 1,
      group: null,
      canRemove: true,
    });
    expect(h2.part).toBe(1);
  });

  test('rates follow the spacings: 3:2, and a layered 3:4:5', () => {
    expect(rows(typed(['1', '1'], { a: 3, b: 2 })).map((r) => r.rate)).toEqual([3, 2]);
    const stack = { ...clapping(), parts: partsFromOnsets([[true], [true], [true]], [20, 15, 12]) };
    expect(rows(stack).map((r) => r.rate)).toEqual([3, 4, 5]);
  });

  test('up to MAX_LANES rows; a lone lane cannot be removed', () => {
    const lone = { ...clapping(), parts: partsFromOnsets([clap], [1]) };
    expect(rows(lone)).toHaveLength(1);
    expect(rows(lone)[0]?.canRemove).toBe(false);
    const many = { ...clapping(), parts: partsFromOnsets(Array.from({ length: MAX_LANES + 2 }, () => clap), Array(MAX_LANES + 2).fill(1)) };
    expect(rows(many)).toHaveLength(MAX_LANES);
  });

  test('a manual group: no knob, its derived count across both hands; manual parts show their onsets', () => {
    const s = typed(['531']);
    const [h1, h2] = rows(s) as [LaneRow, LaneRow];
    expect(h1.k).toBeNull();
    expect(h1.group).toEqual({ parts: [0, 1], balls: 3 });
    expect(h2.group).toEqual({ parts: [0, 1], balls: 3 });
    expect(h1.onsets).toEqual([true, true, true]);
    expect(ballsAction(h1, 1)).toBeNull();
    const reset = reduce(s, { type: 'resetGroup', part: 0 });
    expect(rows(reset).map((r) => [r.k, r.group])).toEqual([
      [1, null],
      [1, null],
    ]);
    // Faulted: no count yet.
    expect(rows(typed(['432']))[0]?.group?.balls).toBeNull();
  });

  test('canAddLane: below MAX_LANES', () => {
    expect(canAddLane(defaultState())).toBe(true);
    const full = { ...clapping(), parts: partsFromOnsets(Array.from({ length: MAX_LANES }, () => clap), Array(MAX_LANES).fill(1)) };
    expect(canAddLane(full)).toBe(false);
  });
});

describe('the knob row: phase, balls and hits', () => {
  test('Clapping Music: every phase step keeps the cycle at 12, wrapping within the period', () => {
    let s = clapping();
    for (let i = 1; i <= 12; i++) {
      s = apply(s, phaseAction(rows(s)[1] as LaneRow, 1));
      expect(rows(s)[1]).toMatchObject({ phase: i % 12, cycle: 12 });
    }
    expect(phaseAction(rows(s)[1] as LaneRow, -1)).toEqual({ type: 'setPhase', part: 1, phase: 11 });
    // A period of one pulse has no phase to step.
    expect(phaseAction({ ...(rows(s)[0] as LaneRow), wrap: 1 }, 1)).toBeNull();
  });

  test('balls: k from 1 to the most, on a default group only; the sound stays', () => {
    const s = clapping();
    const h1 = rows(s)[0] as LaneRow;
    expect(ballsAction(h1, -1)).toBeNull();
    const up = apply(s, ballsAction(h1, 1));
    expect(rows(up)[0]?.k).toBe(2);
    expect(up.parts[1]).toBe(s.parts[1]);
    expect(analyse(up).balls).toBe(3);
    expect(ballsAction({ ...h1, k: KNOBS.maxBalls }, 1)).toBeNull();
    // Voice per part: the knob changes the picture, never the sound.
    const sound = (x: AppState) => cycleSamples(derived(x).schedule, x.mapping);
    expect(sound(up)).toBe(sound(s));
  });

  test('hits: the Euclidean generator over the period, 1 to every beat', () => {
    const s = clapping();
    const h1 = rows(s)[0] as LaneRow;
    expect(hitsAction(h1, -3)).toEqual({ type: 'generate', part: 0, hits: 5 });
    expect(rows(apply(s, hitsAction(h1, -3)))[0]).toMatchObject({ hits: 5, steps: 12 });
    expect(hitsAction({ ...h1, hits: 1 }, -1)).toBeNull();
    expect(hitsAction({ ...h1, hits: 12 }, 1)).toBeNull();
  });
});

describe('the header and the step row: rate, steps, cells, remove', () => {
  test('rate: 1 to MAX_RATE', () => {
    const h1 = rows(clapping())[0] as LaneRow;
    expect(rateAction(h1, 2)).toEqual({ type: 'setRate', part: 0, rate: 3 });
    expect(rateAction(h1, -1)).toBeNull();
    expect(rateAction({ ...h1, rate: MAX_RATE }, 1)).toBeNull();
    const s = apply(clapping(), rateAction(h1, 2));
    expect(rows(s).map((r) => r.rate)).toEqual([3, 1]);
  });

  test('steps: 1 to MAX_PERIOD beats', () => {
    const h1 = rows(clapping())[0] as LaneRow;
    expect(stepsAction(h1, 1)).toEqual({ type: 'setSteps', part: 0, steps: 13 });
    expect(stepsAction({ ...h1, steps: 1 }, -1)).toBeNull();
    expect(stepsAction({ ...h1, steps: MAX_PERIOD }, 1)).toBeNull();
    expect(rows(apply(clapping(), stepsAction(h1, -4)))[0]?.onsets).toEqual(clap.slice(0, 8));
  });

  test('a cell toggles its beat; a manual group resets with the notice', () => {
    const h1 = rows(clapping())[0] as LaneRow;
    expect(cellAction(h1, 3)).toEqual({ type: 'toggleOnset', part: 0, beat: 3 });
    expect(cellAction(h1, -1)).toBeNull();
    expect(cellAction(h1, 12)).toBeNull();
    const s = typed(['531']);
    const toggled = apply(s, cellAction(rows(s)[0] as LaneRow, 1));
    expect(rows(toggled)[0]?.onsets).toEqual([true, false, true]);
    expect(toggled.notice).toBe('I reset hands 1 and 2 to 1 ball each.');
  });

  test('remove: absent on the only lane', () => {
    const [h1] = rows(clapping()) as [LaneRow];
    expect(removeAction(h1)).toEqual({ type: 'removeLane', part: 0 });
    expect(removeAction({ ...h1, canRemove: false })).toBeNull();
  });
});
