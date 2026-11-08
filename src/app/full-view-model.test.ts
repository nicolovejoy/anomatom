import { describe, expect, test } from 'vitest';
import { FULL } from '../tunables';
import { createGesture, fullViewEntry, isDrag, leaveKey, rowLayout } from './full-view-model';

describe('fullViewEntry', () => {
  test('the button enters from either view', () => {
    expect(fullViewEntry('button', '2d')).toBe(true);
    expect(fullViewEntry('button', '3d')).toBe(true);
  });
  test('a drag, a pinch and a wheel tick enter only in 3D, where there is a turn to learn', () => {
    for (const kind of ['drag', 'pinch', 'wheel'] as const) {
      expect(fullViewEntry(kind, '3d')).toBe(true);
      expect(fullViewEntry(kind, '2d')).toBe(false);
    }
  });
  test('a tap never enters', () => {
    expect(fullViewEntry('tap', '3d')).toBe(false);
    expect(fullViewEntry('tap', '2d')).toBe(false);
  });
});

describe('isDrag', () => {
  test('a move shorter than the threshold is a tap; the threshold itself is a drag', () => {
    expect(isDrag(0, 0, FULL.dragThresholdPx)).toBe(false);
    expect(isDrag(3, 4, FULL.dragThresholdPx)).toBe(false);
    expect(isDrag(FULL.dragThresholdPx, 0, FULL.dragThresholdPx)).toBe(true);
    expect(isDrag(-4, -5, FULL.dragThresholdPx)).toBe(true);
  });
});

describe('createGesture', () => {
  test('a pointerdown alone is nothing; a move past the threshold is a drag, said once', () => {
    const g = createGesture(FULL.dragThresholdPx);
    expect(g.down(1, 100, 100)).toBeNull();
    expect(g.move(1, 102, 101)).toBeNull();
    expect(g.move(1, 110, 100)).toBe('drag');
    expect(g.move(1, 150, 100)).toBeNull();
  });
  test('a move from a pointer that never went down is nothing', () => {
    const g = createGesture(FULL.dragThresholdPx);
    expect(g.move(7, 500, 500)).toBeNull();
  });
  test('a second pointer is a pinch, said once, and then the drag stays quiet', () => {
    const g = createGesture(FULL.dragThresholdPx);
    g.down(1, 0, 0);
    expect(g.down(2, 50, 50)).toBe('pinch');
    expect(g.move(1, 100, 100)).toBeNull();
    expect(g.down(3, 60, 60)).toBeNull();
  });
  test('a lifted pointer ends the gesture; the next pointerdown starts a fresh one', () => {
    const g = createGesture(FULL.dragThresholdPx);
    g.down(1, 0, 0);
    g.move(1, 20, 0);
    g.up(1);
    expect(g.down(1, 0, 0)).toBeNull();
    expect(g.move(1, 3, 0)).toBeNull();
    expect(g.move(1, 20, 0)).toBe('drag');
  });
  test('a second pointer lifted leaves the first still going, without a second pinch', () => {
    const g = createGesture(FULL.dragThresholdPx);
    g.down(1, 0, 0);
    g.down(2, 5, 5);
    g.up(2);
    expect(g.move(1, 40, 0)).toBeNull();
  });
});

describe('rowLayout', () => {
  test('one row from the threshold width up, two rows under it', () => {
    expect(rowLayout(FULL.twoRowsBelowPx, false).rows).toBe(1);
    expect(rowLayout(FULL.twoRowsBelowPx - 1, false).rows).toBe(2);
  });
  test('the balls count only where there is one row to hold it', () => {
    expect(rowLayout(1440, false).showBalls).toBe(true);
    expect(rowLayout(390, true).showBalls).toBe(false);
  });
  test('key caps are for a keyboard, not a finger', () => {
    expect(rowLayout(1440, false).keyCaps).toBe(true);
    expect(rowLayout(1180, true).keyCaps).toBe(false);
  });
});

describe('leaveKey', () => {
  test('Escape leaves when neither the wheel nor a sheet is open', () => {
    expect(leaveKey('Escape', false, false)).toBe(true);
  });
  test('an open wheel or sheet takes Escape first', () => {
    expect(leaveKey('Escape', true, false)).toBe(false);
    expect(leaveKey('Escape', false, true)).toBe(false);
  });
  test('no other key leaves', () => {
    expect(leaveKey('Enter', false, false)).toBe(false);
  });
});
