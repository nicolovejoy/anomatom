import { expect, test } from 'vitest';
import { makeGrids, reduceRatio } from './grid';

test('3:2 puts hand 1 on 2-pulse beats and hand 2 on 3-pulse beats, both from pulse 0', () => {
  expect(makeGrids({ a: 3, b: 2 })).toEqual([
    { pulsesPerBeat: 2, offset: 0 },
    { pulsesPerBeat: 3, offset: 0 },
  ]);
});

test('4:3', () => {
  expect(makeGrids({ a: 4, b: 3 })).toEqual([
    { pulsesPerBeat: 3, offset: 0 },
    { pulsesPerBeat: 4, offset: 0 },
  ]);
});

test('6:4 reduces to 3:2', () => {
  expect(reduceRatio({ a: 6, b: 4 })).toEqual({ a: 3, b: 2 });
  expect(makeGrids({ a: 6, b: 4 })).toEqual(makeGrids({ a: 3, b: 2 }));
});

test('1:1 is vanilla: both hands on 2-pulse beats, hand 2 offset by one pulse', () => {
  expect(makeGrids({ a: 1, b: 1 })).toEqual([
    { pulsesPerBeat: 2, offset: 0 },
    { pulsesPerBeat: 2, offset: 1 },
  ]);
});
