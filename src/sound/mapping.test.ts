import { expect, test } from 'vitest';
import { DEFAULT_MAPPING } from '../tunables';
import { makeGrids } from '../core';
import type { Event } from '../core';
import { hitFor } from './mapping';

const vanilla = makeGrids({ a: 1, b: 1 });
const threeTwo = makeGrids({ a: 3, b: 2 });

function throwEvent(height: number, hand: 0 | 1 = 0, cross = false, pulse = 0): Event {
  return { kind: 'throw', pulse, hand, ball: 0, height, flight: height * 2, cross };
}

test('height picks the drum: hats, snare, low tom, kick', () => {
  const drums = [1, 2, 3, 4, 5, 7, 9].map((h) => hitFor(throwEvent(h), DEFAULT_MAPPING, vanilla)?.sample);
  expect(drums).toEqual(['hihat-close', 'hihat-close', 'snare', 'tom-low', 'kick', 'kick', 'kick']);
});

test('a 0 is silent', () => {
  expect(hitFor(throwEvent(0), DEFAULT_MAPPING, vanilla)).toBeNull();
});

test('hand sets pan and gain; duration is the flight', () => {
  const left = hitFor(throwEvent(3, 0), DEFAULT_MAPPING, vanilla);
  const right = hitFor(throwEvent(3, 1), DEFAULT_MAPPING, vanilla);
  expect(left).toMatchObject({ hand: 0, pan: -0.6, gain: 1, durationPulses: 6 });
  expect(right).toMatchObject({ hand: 1, pan: 0.6, gain: 1 });
});

test('a cross throw is accented', () => {
  const plain = hitFor(throwEvent(4), DEFAULT_MAPPING, vanilla)?.velocity ?? 0;
  const cross = hitFor(throwEvent(3, 0, true), DEFAULT_MAPPING, vanilla)?.velocity ?? 0;
  expect(cross - plain).toBe(DEFAULT_MAPPING.crossAccent.velocity);
});

test('velocity never exceeds 127', () => {
  const loud = { ...DEFAULT_MAPPING, crossAccent: { ...DEFAULT_MAPPING.crossAccent, velocity: 40 } };
  expect(hitFor(throwEvent(3, 0, true), loud, vanilla)?.velocity).toBe(127);
});

test('catches are silent by default', () => {
  const c: Event = { kind: 'catch', pulse: 4, hand: 0, ball: 0, height: 2, flight: 4, cross: false };
  expect(hitFor(c, DEFAULT_MAPPING, threeTwo)).toBeNull();
});

test('a cross caught on a coincident pulse sounds the downbeat clap', () => {
  const c: Event = { kind: 'catch', pulse: 6, hand: 1, ball: 0, height: 2, flight: 4, cross: true };
  expect(hitFor(c, DEFAULT_MAPPING, threeTwo)).toMatchObject({ sample: 'clap', hand: 1 });
  const off = { ...DEFAULT_MAPPING, crossAccent: { ...DEFAULT_MAPPING.crossAccent, downbeat: null } };
  expect(hitFor(c, off, threeTwo)).toBeNull();
});

test('audible catches use the catch sample', () => {
  const m = { ...DEFAULT_MAPPING, catches: { on: true, sample: 'rimshot' } };
  const c: Event = { kind: 'catch', pulse: 4, hand: 0, ball: 0, height: 2, flight: 4, cross: false };
  expect(hitFor(c, m, threeTwo)).toMatchObject({ sample: 'rimshot', hand: 0 });
});
