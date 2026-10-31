import { expect, test } from 'vitest';
import { buildSchedule, partsFromLines, partsFromPassing, partsFromVanilla } from '../core';
import { BASE_VELOCITY, MAX_VELOCITY } from '../tunables';
import type { Event, Parts, Schedule } from '../core';
import { applyPreset, hitFor } from './mapping';

function scheduleOf(parts: Parts): Schedule {
  return buildSchedule(parts);
}
const lines = (texts: string[], a: number, b: number) => {
  const r = partsFromLines(texts, { a, b });
  if (!r.ok) throw new Error(texts.join('/'));
  return r.parts;
};
const vanilla = scheduleOf((partsFromVanilla('3') as { parts: Parts }).parts);
const threeTwo = scheduleOf(lines(['2 2x 2', '2x 2'], 3, 2));

const HD = applyPreset('height-drum');

function throwEvent(height: number, part = 0, cross = false, pulse = 0): Event {
  return { kind: 'throw', pulse, part, to: cross ? 1 - part : part, ball: 0, height, flight: height * 2, cross };
}

test('height picks the drum: hats, snare, low tom, kick', () => {
  const drums = [1, 2, 3, 4, 5, 7, 9].map((h) => hitFor(throwEvent(h), HD, vanilla)?.sample);
  expect(drums).toEqual(['hihat-close', 'hihat-close', 'snare', 'tom-low', 'kick', 'kick', 'kick']);
});

test('a 0 is silent', () => {
  expect(hitFor(throwEvent(0), HD, vanilla)).toBeNull();
});

test('part sets pan and gain; duration is the flight', () => {
  const left = hitFor(throwEvent(3, 0), HD, vanilla);
  const right = hitFor(throwEvent(3, 1), HD, vanilla);
  expect(left).toMatchObject({ part: 0, pan: -0.6, gain: 1, durationPulses: 6 });
  expect(right).toMatchObject({ part: 1, pan: 0.6, gain: 1 });
});

test('a cross throw is accented', () => {
  const plain = hitFor(throwEvent(4), HD, vanilla)?.velocity ?? 0;
  const cross = hitFor(throwEvent(3, 0, true), HD, vanilla)?.velocity ?? 0;
  expect(cross - plain).toBe(HD.crossAccent.velocity);
});

test('velocity never exceeds 127', () => {
  const loud = { ...HD, crossAccent: { ...HD.crossAccent, velocity: 40 } };
  expect(hitFor(throwEvent(3, 0, true), loud, vanilla)?.velocity).toBe(127);
});

test('catches are silent by default', () => {
  const c: Event = { kind: 'catch', pulse: 4, part: 0, to: 0, ball: 0, height: 2, flight: 4, cross: false };
  expect(hitFor(c, HD, threeTwo)).toBeNull();
});

test('a cross caught on a coincident pulse sounds the downbeat clap', () => {
  const c: Event = { kind: 'catch', pulse: 6, part: 1, to: 1, ball: 0, height: 2, flight: 4, cross: true };
  expect(hitFor(c, HD, threeTwo)).toMatchObject({ sample: 'clap', part: 1 });
  const off = { ...HD, crossAccent: { ...HD.crossAccent, downbeat: null } };
  expect(hitFor(c, off, threeTwo)).toBeNull();
});

test('audible catches use the catch sample', () => {
  const m = { ...HD, catches: { on: true, sample: 'rimshot' } };
  const c: Event = { kind: 'catch', pulse: 4, part: 0, to: 0, ball: 0, height: 2, flight: 4, cross: false };
  expect(hitFor(c, m, threeTwo)).toMatchObject({ sample: 'rimshot', part: 0 });
});

test('a cross caught off the coincidence is an ordinary catch', () => {
  // Vanilla: a 3 crosses and lands on the other hand's beat, never a coincident pulse.
  const c: Event = { kind: 'catch', pulse: 3, part: 1, to: 1, ball: 0, height: 3, flight: 3, cross: true };
  expect(hitFor(c, HD, vanilla)).toBeNull();
  const audible = { ...HD, catches: { on: true, sample: 'rimshot' } };
  expect(hitFor(c, audible, vanilla)).toMatchObject({ sample: 'rimshot' });
});

// Passing (wave 2, ruling 4): a pass throw gets the pass accent and, when set, the pass sound.
const passing = (() => {
  const r = partsFromPassing('<3p 3|3p 3>');
  if (!r.ok) throw new Error('passing');
  return scheduleOf(r.parts);
})();
const throwOf = (part: number) => passing.events.find((e) => e.kind === 'throw' && e.part === part) as Event;

test('a pass throw adds the cross and pass velocities; a throw within a juggler does not', () => {
  const m = applyPreset('voice-per-part');
  const pass = hitFor(throwOf(0), m, passing);
  const self = hitFor(throwOf(1), m, passing);
  expect(throwOf(0).to).toBe(3);
  expect(self?.velocity).toBe(BASE_VELOCITY + (throwOf(1).cross ? m.crossAccent.velocity : 0));
  expect(pass?.velocity).toBe(
    Math.min(MAX_VELOCITY, BASE_VELOCITY + (throwOf(0).cross ? m.crossAccent.velocity : 0) + m.pass.velocity),
  );
  expect(pass?.velocity).toBeGreaterThan(self?.velocity ?? 0);
});

test('pass.sample replaces the sound under height-to-drum and voice-per-part; null keeps it', () => {
  for (const name of ['height-drum', 'voice-per-part'] as const) {
    const base = applyPreset(name);
    const cow = { ...base, pass: { ...base.pass, sample: 'cowbell' } };
    expect(hitFor(throwOf(0), cow, passing)?.sample).toBe('cowbell');
    expect(hitFor(throwOf(1), cow, passing)?.sample).not.toBe('cowbell');
    expect(hitFor(throwOf(0), base, passing)?.sample).not.toBe('cowbell');
  }
});

test('the pass velocity is clamped into MAX_VELOCITY', () => {
  const m = applyPreset('height-drum');
  expect(hitFor(throwOf(0), { ...m, pass: { velocity: 40, sample: null } }, passing)?.velocity).toBeLessThanOrEqual(
    MAX_VELOCITY,
  );
});

test('a pass of height 0 is silent and a catch is never a pass sound', () => {
  const m = { ...applyPreset('height-drum'), pass: { velocity: 20, sample: 'cowbell' } };
  expect(hitFor({ ...throwEvent(0), to: 3 }, m, passing)).toBeNull();
  const c: Event = { kind: 'catch', pulse: 4, part: 3, to: 3, ball: 0, height: 3, flight: 3, cross: true };
  expect(hitFor(c, { ...m, catches: { on: true, sample: 'rimshot' } }, passing)?.sample).toBe('rimshot');
});
