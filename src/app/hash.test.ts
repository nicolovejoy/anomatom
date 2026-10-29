import { describe, expect, test } from 'vitest';
import { buildSchedule, partsFromOnsets, withPhase } from '../core';
import type { Parts } from '../core';
import { applyPreset, PRESET_NAMES, presetOf, type Mapping } from '../sound/mapping';
import { lineParts, vanillaParts } from '../test/schedules';
import { BPM_RANGE, DEFAULT_MAPPING, MAX_LINK_CYCLE, MAX_PARTS } from '../tunables';
import cards from './fixtures/v1-cards.json';
import { decodeState, encodeState } from './hash';
import { defaultParts, defaultState, type AppState } from './state';
import { route } from './route';

const b64 = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const custom: Mapping = {
  byHeight: true,
  perHeight: { 1: 'clap', 2: null, 3: 'snare', 4: 'cowbell', 5: 'kick', 6: 'kick', 7: 'maraca', 8: 'cymbal', 9: 'tom-hi' },
  byBall: ['kick', 'clave'],
  parts: [
    { kit: 'TR-808', sample: 'conga-hi', pan: -0.25, gain: 0.5 },
    { kit: 'TR-808', sample: null, pan: 1, gain: 0 },
  ],
  catches: { on: true, sample: 'rimshot' },
  crossAccent: { velocity: 33, downbeat: null },
  filter: { on: true, low: 250, high: 9000 },
  pad: { on: true, instrument: 'soundfont', chord: 'F69' },
};

const payloadOf = (hash: string) => route(hash).state ?? '';
const roundTrip = (state: AppState) => decodeState(payloadOf(encodeState(state)));

describe('encodeState', () => {
  test('the default state encodes to a stable string', () => {
    // A change here breaks every shared link: bump the scheme version instead.
    expect(encodeState(defaultState())).toBe(
      '#v2.eyJwIjpbeyJzIjoyLCJmIjowLCJ1IjoxLCJ0IjpbWzMsMV1dfSx7InMiOjIsImYiOjEsInUiOjEsInQiOltbMywwXV19XSwiciI6WzEsMV0sInQiOjEyMCwibSI6InZvaWNlLXBlci1wYXJ0In0',
    );
  });

  test('route() takes the payload straight out of it', () => {
    const hash = encodeState(defaultState());
    expect(route(hash)).toEqual({ view: 'play', state: hash.slice('#v2.'.length), version: 2 });
  });

  test('never carries volume, drafts, the notice, the last hash or UI state', () => {
    const state: AppState = {
      ...defaultState(),
      volume: 0.123,
      lastStateHash: '#v2.secret',
      drafts: ['33', null],
      notice: 'I reset hand 1 to 1 ball.',
    };
    expect(encodeState(state)).toBe(encodeState(defaultState()));
    const withUi: AppState = { ...state, sheetTab: 'sound' };
    expect(encodeState(withUi)).toBe(encodeState(defaultState()));
  });

  test('is url-safe, and a custom mapping stays compact', () => {
    const hash = encodeState({ ...defaultState(), mapping: custom });
    expect(hash).toMatch(/^#v2\.[A-Za-z0-9_-]+$/);
    expect(hash.length).toBeLessThan(500);
  });

  test('a preset mapping travels as its name; parts in short keys', () => {
    for (const name of PRESET_NAMES) {
      const json = atob(payloadOf(encodeState({ ...defaultState(), mapping: applyPreset(name) })).replace(/-/g, '+').replace(/_/g, '/'));
      expect(JSON.parse(json).m).toBe(name);
    }
    const parts = partsFromOnsets([[true, false, true]], [1], [2]);
    const json = atob(payloadOf(encodeState({ ...defaultState(), parts })).replace(/-/g, '+').replace(/_/g, '/'));
    expect(JSON.parse(json).p).toEqual([{ s: 1, f: 0, u: 1, o: '101', k: 2 }]);
  });
});

describe('round trip', () => {
  test('the default state', () => {
    const d = defaultState();
    expect(roundTrip(d)).toEqual({ parts: d.parts, ratio: d.ratio, bpm: d.bpm, mapping: d.mapping });
  });

  test('every preset', () => {
    for (const name of PRESET_NAMES) {
      const back = roundTrip({ ...defaultState(), mapping: applyPreset(name) });
      expect(back?.mapping).toEqual(applyPreset(name));
      expect(presetOf(back?.mapping as Mapping)).toBe(name);
    }
  });

  test('a custom mapping, a ratio, manual parts with crosses, a tempo', () => {
    const state: AppState = { ...defaultState(), parts: lineParts(['2 2x 2', '2x 2'], { a: 3, b: 2 }), ratio: { a: 3, b: 2 }, bpm: 90, mapping: custom };
    expect(roundTrip(state)).toEqual({ parts: state.parts, ratio: state.ratio, bpm: 90, mapping: custom });
  });

  test('default parts with k and a phase, and three parts', () => {
    const clapping = [true, true, true, false, true, true, false, true, false, true, true, false];
    const parts = withPhase(partsFromOnsets([clapping, clapping], [1, 1], [1, 3]), 1, 3, 1);
    expect(roundTrip({ ...defaultState(), parts })?.parts).toEqual(parts);
    const three = lineParts(['2x2 0', '2', '2x1 0'], { a: 1, b: 1 });
    expect(roundTrip({ ...defaultState(), parts: three })?.parts).toEqual(three);
  });

  test('a mapping that is one edit off a preset round-trips as custom', () => {
    const edited: Mapping = { ...applyPreset('height-pitch'), catches: { on: true, sample: 'clave' } };
    const back = roundTrip({ ...defaultState(), mapping: edited });
    expect(back?.mapping).toEqual(edited);
    expect(presetOf(back?.mapping as Mapping)).toBe('custom');
  });

  test('every combination of the on/off flags', () => {
    for (const bits of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const m: Mapping = {
        ...custom,
        catches: { ...custom.catches, on: (bits & 1) !== 0 },
        filter: { ...custom.filter, on: (bits & 2) !== 0 },
        pad: { ...custom.pad, on: (bits & 4) !== 0 },
      };
      expect(roundTrip({ ...defaultState(), mapping: m })?.mapping).toEqual(m);
    }
  });
});

describe('v1 links still open', () => {
  test('the five first-minute cards’ links give the Schedule they always did', () => {
    for (const card of cards) {
      const r = route(card.link);
      expect(r.version).toBe(1);
      const s = decodeState(r.state as string, 1);
      const schedule = buildSchedule(s?.parts as Parts);
      expect([schedule.cycle, schedule.period, schedule.balls], card.id).toEqual([card.cycle, card.period, card.balls]);
      expect(
        schedule.events.map((e) => [e.kind, e.pulse, e.part, e.ball, e.height, e.flight, e.cross ? 1 : 0]),
        card.id,
      ).toEqual(card.events);
      expect(s?.mapping).toEqual(applyPreset('height-drum'));
    }
  });

  const v1 = (value: unknown) => decodeState(b64(value), 1);

  test('at 1:1 hand 1’s text is vanilla (an x meant nothing), otherwise one line per hand', () => {
    expect(v1({ p: ['531', '9'] })?.parts).toEqual(vanillaParts('531'));
    expect(v1({ p: ['3x', '2'] })?.parts).toEqual(vanillaParts('3'));
    expect(v1({ p: ['3x 3x', '2'], r: [3, 2] })?.parts).toEqual(lineParts(['3x 3x', '2'], { a: 3, b: 2 }));
  });

  test('text the parser cannot read falls back to that hand’s default', () => {
    expect(v1({ p: ['3<script>', '2?'] })?.parts).toEqual(defaultParts());
    expect(v1({ p: ['', '  '] })?.parts).toEqual(defaultParts());
    expect(v1({ p: [3, null] })?.parts).toEqual(defaultParts());
    expect(v1({ p: 'abc' })?.parts).toEqual(defaultParts());
    expect(v1({ p: ['3'.repeat(65), '4'] })?.parts).toEqual(defaultParts());
    expect(v1({ p: ['441', 'q/'], r: [3, 2] })?.parts).toEqual(lineParts(['441', '2'], { a: 3, b: 2 }));
    expect(v1({ p: ['?', '1'], r: [3, 2] })?.parts).toEqual(lineParts(['3', '1'], { a: 3, b: 2 }));
  });

  test('text that reads but is not juggleable is kept, for the knobs to show', () => {
    expect(v1({ p: ['432', '2'] })?.parts).toEqual(vanillaParts('432'));
    expect(v1({ p: ['12', '2'] })?.parts).toEqual(vanillaParts('12'));
  });
});

describe('junk', () => {
  const d = defaultState();
  const defaults = { parts: d.parts, ratio: d.ratio, bpm: d.bpm, mapping: DEFAULT_MAPPING };

  test('not a payload at all gives null', () => {
    for (const junk of ['', '!!!', 'not base64 at all', '%%%%', b64([1, 2]).slice(0, 3), 'bnVsbA', 'MTIz', 'InN0ciI']) {
      expect(decodeState(junk)).toBeNull();
    }
  });

  test('valid base64 of invalid UTF-8 or invalid JSON gives null', () => {
    expect(decodeState('_-8')).toBeNull();
    expect(decodeState('YWJj')).toBeNull();
  });

  test('an empty object is all defaults, in either scheme', () => {
    expect(decodeState(b64({}))).toEqual(defaults);
    expect(decodeState(b64({}), 1)).toEqual(defaults);
  });

  test('unknown fields are ignored', () => {
    expect(decodeState(b64({ zzz: 1, v: 0.1, volume: 0.5, m: { zzz: [1] } }))).toEqual(defaults);
  });

  test('missing fields come from the defaults, one by one', () => {
    expect(decodeState(b64({ t: 100 }))).toEqual({ ...defaults, bpm: 100 });
    expect(decodeState(b64({ r: [4, 3] }))).toEqual({ ...defaults, ratio: { a: 4, b: 3 } });
    expect(decodeState(b64({ m: { f: [1] } }))?.mapping?.filter).toEqual({
      on: true,
      low: DEFAULT_MAPPING.filter.low,
      high: DEFAULT_MAPPING.filter.high,
    });
  });

  test('parts that are not a sound model give the default pattern', () => {
    const part = { s: 1, f: 0, u: 1, t: [[3, null]] };
    for (const p of [
      'abc',
      [],
      Array.from({ length: MAX_PARTS + 1 }, () => part),
      [3],
      [{ ...part, s: 0 }],
      [{ ...part, f: -1 }],
      [{ ...part, u: 1.5 }],
      [{ ...part, t: [] }],
      [{ ...part, t: 'x' }],
      [{ ...part, t: [3] }],
      [{ ...part, t: [[-1, null]] }],
      [{ ...part, u: 2, t: [[3, null]] }],
      [{ ...part, t: [[3, 0]] }],
      [part, { ...part, t: [[3, 5]] }],
      [part, { ...part, t: [[0, 0]] }],
      [{ s: 1, f: 0, u: 1, o: '10x', k: 1 }],
      [{ s: 1, f: 0, u: 1, o: '1'.repeat(17), k: 1 }],
      [{ s: 1, f: 0, u: 1, o: '101', k: 0 }],
      [{ s: MAX_LINK_CYCLE, f: 0, u: 1, t: [[1, null], [1, null]] }],
    ]) {
      expect(decodeState(b64({ p }))?.parts, JSON.stringify(p).slice(0, 80)).toEqual(defaultParts());
    }
    // A sound one is kept, normalised.
    expect(decodeState(b64({ p: [{ s: 2, f: 0, u: 2, o: '1', k: 1 }] }))?.parts).toEqual(partsFromOnsets([[true]], [1]));
  });

  test('wrong types fall back per field', () => {
    const junk = decodeState(
      b64({
        r: ['a', {}],
        t: 'fast',
        m: { h: 'x', b: 5, p: [[1, 2, null, 'x'], 7], y: 'yes', v: [[null, 'x'], 7], c: ['y', 4], d: [{}, 9], f: [2, 'lo', null], a: [true, 'organ', 'C#'] },
      }),
    );
    expect(junk).toEqual(defaults);
    expect(decodeState(b64({ r: 'x', m: 12 }))).toEqual(defaults);
    expect(decodeState(b64({ m: [1, 2] }))).toEqual(defaults);
  });

  test('unknown samples, instruments, chords and presets are not trusted', () => {
    const m = decodeState(
      b64({ m: { h: ['../evil', 'kick'], c: [1, 'nope'], d: [10, 'nope'], a: [1, 'tuba', 'Zm9'] } }),
    )?.mapping as Mapping;
    expect(m.perHeight[1]).toBe(DEFAULT_MAPPING.perHeight[1]);
    expect(m.perHeight[2]).toBe('kick');
    expect(m.catches).toEqual({ on: true, sample: DEFAULT_MAPPING.catches.sample });
    expect(m.crossAccent).toEqual({ velocity: 10, downbeat: DEFAULT_MAPPING.crossAccent.downbeat });
    expect(m.pad).toEqual({ on: true, instrument: DEFAULT_MAPPING.pad.instrument, chord: DEFAULT_MAPPING.pad.chord });
    expect(decodeState(b64({ m: 'height-banana' }))?.mapping).toEqual(DEFAULT_MAPPING);
    expect(decodeState(b64({ m: { b: ['kick', 'banana'] } }))?.mapping?.byBall).toBeNull();
    expect(decodeState(b64({ m: { b: [] } }))?.mapping?.byBall).toBeNull();
    expect(decodeState(b64({ m: 'ball-pitch' }))?.mapping).toEqual(applyPreset('ball-pitch'));
  });

  test('numbers are clamped into range and rounded where whole', () => {
    const s = decodeState(
      b64({
        t: 9999,
        r: [0, 99],
        m: { p: [['TR-808', 'kick', -5, 5], ['TR-808', 'snare', 0.5, -1]], d: [999], f: [1, 1, 1e9] },
      }),
    ) as AppState;
    expect(s.bpm).toBe(BPM_RANGE.max);
    expect(s.ratio).toEqual({ a: 1, b: 9 });
    expect(s.mapping.parts).toEqual([
      { kit: 'TR-808', sample: 'kick', pan: -1, gain: 1 },
      { kit: 'TR-808', sample: 'snare', pan: 0.5, gain: 0 },
    ]);
    expect(s.mapping.crossAccent.velocity).toBe(40);
    expect(s.mapping.filter).toMatchObject({ low: 100, high: 20000 });
    expect(decodeState(b64({ t: 0 }))?.bpm).toBe(BPM_RANGE.min);
    expect(decodeState(b64({ t: 100.4, r: [2.6, 3.2] }))).toMatchObject({ bpm: 100, ratio: { a: 3, b: 3 } });
    expect(decodeState(b64({ t: null, r: [Number.NaN, 2] }))).toMatchObject({ bpm: d.bpm, ratio: { a: 1, b: 2 } });
  });
});

describe('byBall (C nit 3)', () => {
  const fallback = DEFAULT_MAPPING.byBall;
  const byBall = (b: unknown) => decodeState(b64({ m: { b } }))?.mapping?.byBall;

  test('a bad byBall falls back to the default mapping’s, silently', () => {
    for (const bad of [5, 'kick', {}, [], ['kick', 'banana'], ['kick', 3], [null], true]) {
      expect(byBall(bad)).toEqual(fallback);
    }
    expect(decodeState(b64({ m: {} }))?.mapping?.byBall).toEqual(fallback);
  });

  test('a good list is used, and an explicit null is none', () => {
    expect(byBall(['kick', 'clave'])).toEqual(['kick', 'clave']);
    expect(byBall(null)).toBeNull();
  });
});
