import { expect, test } from 'vitest';
import * as core from './index';

test('the core API of model-waves.md is exported from src/core', () => {
  const api = [
    'parseThrows',
    'partsFromVanilla',
    'isVanillaPair',
    'partsFromLines',
    'partsFromOnsets',
    'textOf',
    'onsetsOf',
    'periodOf',
    'cycleOf',
    'normalise',
    'withPhase',
    'euclid',
    'rotate',
    'flightsOf',
    'crossGroups',
    'judge',
    'ballCount',
    'buildSchedule',
    'carryOver',
    'fixesFor',
  ];
  for (const name of api) expect(typeof (core as Record<string, unknown>)[name]).toBe('function');
  // End to end through the index: vanilla 3 is three balls.
  const r = core.partsFromVanilla('3');
  expect(r.ok && core.buildSchedule(r.parts).balls).toBe(3);
});
