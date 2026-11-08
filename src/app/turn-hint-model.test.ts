import { describe, expect, test } from 'vitest';
import { hintShows, hintStart, hintStep, type HintEvent } from './turn-hint-model';

const run = (...events: HintEvent[]) => events.reduce(hintStep, hintStart);

describe('the turn hint', () => {
  test('is hidden before the 3D view shows', () => {
    expect(hintShows(hintStart)).toBe(false);
  });
  test('shows from the moment the 3D view shows', () => {
    expect(hintShows(run('shown3d'))).toBe(true);
  });
  test('hides when the 3D view hides, and shows again when it returns unturned', () => {
    expect(hintShows(run('shown3d', 'hidden3d'))).toBe(false);
    expect(hintShows(run('shown3d', 'hidden3d', 'shown3d'))).toBe(true);
  });
  test('goes on the first turn and stays gone for good', () => {
    expect(hintShows(run('shown3d', 'turned'))).toBe(false);
    expect(hintShows(run('shown3d', 'turned', 'hidden3d', 'shown3d'))).toBe(false);
    expect(hintShows(run('shown3d', 'turned', 'turned', 'shown3d'))).toBe(false);
  });
  test('a turn noted while 3D is hidden still ends it', () => {
    expect(hintShows(run('turned', 'shown3d'))).toBe(false);
  });
});
