import { describe, expect, test } from 'vitest';
import { DECK, FULL } from '../tunables';
import { createGesture, fullViewEntry, isDrag, keepsBalls, leaveKey, pickMode, pickPlace, rowLayout } from './full-view-model';

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
  test('key caps are for a keyboard, not a finger', () => {
    expect(rowLayout(1440, false).keyCaps).toBe(true);
    expect(rowLayout(1180, true).keyCaps).toBe(false);
  });
});

describe('keepsBalls', () => {
  test('the count stays while the notation fits whole beside it, to half a pixel', () => {
    expect(keepsBalls(120, 200)).toBe(true);
    expect(keepsBalls(200, 200)).toBe(true);
    expect(keepsBalls(200.4, 200)).toBe(true);
    expect(keepsBalls(201, 200)).toBe(false);
  });
});

describe('createGesture.clear', () => {
  test('a pointer whose pointerup was lost does not keep the next drag from entering', () => {
    const g = createGesture(6);
    g.down(1, 0, 0);
    expect(g.move(1, 10, 0)).toBe('drag');
    g.clear(); // the context menu took the pointerup
    expect(g.down(1, 0, 0)).toBeNull();
    expect(g.move(1, 10, 0)).toBe('drag');
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

describe('pickMode', () => {
  test('a landscape screen puts the wheel at the left, whatever its width', () => {
    expect(pickMode(1180, 820)).toBe('left');
    expect(pickMode(844, 390)).toBe('left');
    expect(pickMode(600, 500)).toBe('left');
  });
  test('a tall screen as wide as the row puts the jugglers on top', () => {
    expect(pickMode(820, 1180)).toBe('top');
    expect(pickMode(FULL.twoRowsBelowPx, FULL.twoRowsBelowPx + 1)).toBe('top');
  });
  test('a tall narrow screen pops the wheel up from the bar', () => {
    expect(pickMode(390, 844)).toBe('pop');
    expect(pickMode(FULL.twoRowsBelowPx - 1, 2000)).toBe('pop');
  });
});

describe('pickPlace', () => {
  const filters = 40;
  test('left: the jugglers take the largest square the stage holds, the wheel the rest, as many odd rows as fit', () => {
    const p = pickPlace('left', 1180, 676, filters);
    expect(p.square).toBe(676);
    expect(p.side).toBe(1180 - 676);
    expect(p.rows).toBe(FULL.pickMaxRows);
    expect(p.rowPx).toBe(FULL.pickRowMaxPx);
  });
  test('left: the wheel keeps its minimum width, and the square gives way', () => {
    const p = pickPlace('left', 700, 676, filters);
    expect(p.side).toBe(FULL.pickWheelMinPx);
    expect(p.square).toBe(700 - FULL.pickWheelMinPx);
  });
  test('left: a short stage shows fewer rows, at the base height', () => {
    const p = pickPlace('left', 844, 270, filters);
    expect(p.square).toBe(270);
    expect(p.rows).toBe(7);
    expect(p.rowPx).toBe(DECK.rowPx);
    expect(p.rows % 2).toBe(1);
  });
  test('left: never fewer than three rows, never a negative square', () => {
    expect(pickPlace('left', 844, 100, filters).rows).toBe(3);
    expect(pickPlace('left', 200, 400, filters).square).toBe(0);
  });
  test('top: the square is what the filters and five rows leave, the wheel takes the rest of the width', () => {
    const p = pickPlace('top', 820, 1035, filters);
    expect(p.square).toBe(820);
    expect(p.side).toBe(1035 - 820);
    expect(p.rows).toBe(5);
    expect(p.rowPx).toBeGreaterThanOrEqual(DECK.rowPx);
  });
  test('top: where the stage is short the square gives way to the wheel', () => {
    const p = pickPlace('top', 820, 700, filters);
    expect(p.square).toBe(700 - filters - FULL.pickTopRows * DECK.rowPx);
    expect(p.side - filters).toBeGreaterThanOrEqual(FULL.pickTopRows * DECK.rowPx);
    expect(p.rows).toBe(FULL.pickTopRows);
  });
  test('top: never a negative square', () => {
    expect(pickPlace('top', 820, 100, filters).square).toBe(0);
  });
  test('pop: the stage stays; up to five rows that keep the figure clear', () => {
    const p = pickPlace('pop', 390, 724, 76);
    expect(p).toEqual({ mode: 'pop', square: 0, side: 0, rows: FULL.pickPopRows, rowPx: DECK.rowPx });
    expect(pickPlace('pop', 375, 400, 76).rows).toBe(3);
  });
});
