import { describe, expect, test } from 'vitest';
import { applyPreset, presetOf, type Mapping } from '../sound/mapping';
import { CROSS_BOOST_RANGE, DEFAULT_MAPPING, FILTER_HZ_RANGE, KIT_SAMPLES } from '../tunables';
import {
  applyEdit,
  downbeatChoices,
  resetTarget,
  sampleFromValue,
  sampleValue,
  type MappingEdit,
} from './sound-panel-model';

const m = DEFAULT_MAPPING;
const edit = (mapping: Mapping, e: MappingEdit) => applyEdit(mapping, e);

describe('presets', () => {
  test('choosing one rewrites every field', () => {
    const custom = edit(m, { kind: 'padOn', on: true });
    expect(presetOf(custom)).toBe('custom');
    expect(edit(custom, { kind: 'preset', name: 'height-pitch' })).toEqual(applyPreset('height-pitch'));
    expect(presetOf(edit(m, { kind: 'preset', name: 'ball-pitch' }))).toBe('ball-pitch');
  });

  test('an unknown name is refused', () => {
    expect(edit(m, { kind: 'preset', name: 'nope' as never })).toBe(m);
  });

  test('any edit afterwards reads as custom', () => {
    expect(presetOf(edit(m, { kind: 'accent', velocity: 21 }))).toBe('custom');
  });
});

describe('each control edits its one field', () => {
  test('height sound', () => {
    const next = edit(m, { kind: 'height', height: 3, sample: 'cowbell' });
    expect(next.perHeight[3]).toBe('cowbell');
    expect(next.perHeight[4]).toBe(m.perHeight[4]);
    expect(edit(m, { kind: 'height', height: 3, sample: null }).perHeight[3]).toBeNull();
  });

  test('choosing a height’s sound ends a ball-to-pitch list, which would hide it', () => {
    const ball = applyPreset('ball-pitch');
    expect(ball.byBall).not.toBeNull();
    expect(edit(ball, { kind: 'height', height: 2, sample: 'kick' }).byBall).toBeNull();
  });

  test('heights outside 1-9 and sounds outside the kit are refused', () => {
    for (const height of [0, 10, 1.5, Number.NaN]) {
      expect(edit(m, { kind: 'height', height, sample: 'kick' })).toBe(m);
    }
    expect(edit(m, { kind: 'height', height: 1, sample: 'tuba' })).toBe(m);
    expect(edit(m, { kind: 'catchSample', sample: 'tuba' })).toBe(m);
    expect(edit(m, { kind: 'downbeat', sample: '../x' })).toBe(m);
  });

  test('pan and gain are per hand, and clamped', () => {
    const a = edit(m, { kind: 'pan', hand: 1, value: 0.25 });
    expect(a.hands[1]).toEqual({ ...m.hands[1], pan: 0.25 });
    expect(a.hands[0]).toBe(m.hands[0]);
    expect(edit(m, { kind: 'pan', hand: 0, value: -7 }).hands[0].pan).toBe(-1);
    expect(edit(m, { kind: 'gain', hand: 0, value: 0.4 }).hands[0].gain).toBe(0.4);
    expect(edit(m, { kind: 'gain', hand: 1, value: 9 }).hands[1].gain).toBe(1);
    expect(edit(m, { kind: 'gain', hand: 1, value: Number.NaN })).toBe(m);
    expect(edit(m, { kind: 'pan', hand: 1, value: Infinity })).toBe(m);
  });

  test('catches', () => {
    expect(edit(m, { kind: 'catchesOn', on: true }).catches).toEqual({ on: true, sample: m.catches.sample });
    expect(edit(m, { kind: 'catchSample', sample: 'clave' }).catches.sample).toBe('clave');
  });

  test('cross accent: a whole boost in range, and the downbeat sound', () => {
    expect(edit(m, { kind: 'accent', velocity: 33.4 }).crossAccent.velocity).toBe(33);
    expect(edit(m, { kind: 'accent', velocity: 99 }).crossAccent.velocity).toBe(CROSS_BOOST_RANGE.max);
    expect(edit(m, { kind: 'accent', velocity: -4 }).crossAccent.velocity).toBe(CROSS_BOOST_RANGE.min);
    expect(edit(m, { kind: 'accent', velocity: Number.NaN })).toBe(m);
    expect(edit(m, { kind: 'downbeat', sample: null }).crossAccent.downbeat).toBeNull();
    expect(edit(m, { kind: 'downbeat', sample: 'cowbell' }).crossAccent.downbeat).toBe('cowbell');
  });

  test('filter: on/off and a cutoff range clamped to what the panel offers', () => {
    expect(edit(m, { kind: 'filterOn', on: true }).filter.on).toBe(true);
    expect(edit(m, { kind: 'filterLow', hz: 250.4 }).filter.low).toBe(250);
    expect(edit(m, { kind: 'filterLow', hz: 5 }).filter.low).toBe(FILTER_HZ_RANGE.min);
    expect(edit(m, { kind: 'filterHigh', hz: 1e9 }).filter.high).toBe(FILTER_HZ_RANGE.max);
    expect(edit(m, { kind: 'filterHigh', hz: Number.NaN })).toBe(m);
    expect(edit(m, { kind: 'filterLow', hz: Infinity })).toBe(m);
  });

  test('pad: on/off, instrument, chord', () => {
    expect(edit(m, { kind: 'padOn', on: true }).pad.on).toBe(true);
    expect(edit(m, { kind: 'padInstrument', instrument: 'soundfont' }).pad.instrument).toBe('soundfont');
    expect(edit(m, { kind: 'padChord', chord: 'open5' }).pad.chord).toBe('open5');
  });
});

test('an edit that changes nothing returns the very same mapping (the store hears nothing)', () => {
  expect(edit(m, { kind: 'accent', velocity: m.crossAccent.velocity })).toBe(m);
  expect(edit(m, { kind: 'padOn', on: m.pad.on })).toBe(m);
  expect(edit(m, { kind: 'preset', name: 'height-drum' })).toBe(m);
  expect(edit(m, { kind: 'height', height: 1, sample: m.perHeight[1] as string })).toBe(m);
});

test('every sound in the kit can be chosen for a height', () => {
  for (const sample of KIT_SAMPLES) expect(edit(m, { kind: 'height', height: 9, sample }).perHeight[9]).toBe(sample);
});

test('select values: a sound by name, none as the empty string', () => {
  expect(sampleValue('kick')).toBe('kick');
  expect(sampleValue(null)).toBe('');
  expect(sampleFromValue('kick')).toBe('kick');
  expect(sampleFromValue('')).toBeNull();
});

test('the downbeat dropdown offers clap, cowbell and none, plus whatever a link set', () => {
  expect(downbeatChoices('clap')).toEqual(['clap', 'cowbell', null]);
  expect(downbeatChoices(null)).toEqual(['clap', 'cowbell', null]);
  expect(downbeatChoices('snare')).toEqual(['clap', 'cowbell', null, 'snare']);
});

test('reset goes back to the preset the mapping equals, else the last one the panel saw', () => {
  expect(resetTarget(applyPreset('ball-pitch'), 'height-drum')).toBe('ball-pitch');
  expect(resetTarget(edit(m, { kind: 'padOn', on: true }), 'height-pitch')).toBe('height-pitch');
});
