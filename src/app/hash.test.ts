import { describe, expect, test } from 'vitest';
import { applyPreset, PRESET_NAMES, presetOf, type Mapping } from '../sound/mapping';
import { BPM_RANGE, DEFAULT_MAPPING } from '../tunables';
import { decodeState, encodeState } from './hash';
import { defaultState, type AppState } from './state';
import { route } from './route';

const b64 = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const custom: Mapping = {
  kit: 'TR-808',
  perHeight: { 1: 'clap', 2: null, 3: 'snare', 4: 'cowbell', 5: 'kick', 6: 'kick', 7: 'maraca', 8: 'cymbal', 9: 'tom-hi' },
  byBall: ['kick', 'clave'],
  hands: [
    { pan: -0.25, gain: 0.5 },
    { pan: 1, gain: 0 },
  ],
  catches: { on: true, sample: 'rimshot' },
  crossAccent: { velocity: 33, downbeat: null },
  filter: { on: true, low: 250, high: 9000 },
  pad: { on: true, instrument: 'soundfont', chord: 'F69' },
};

const payloadOf = (hash: string) => route(hash).state ?? '';

describe('encodeState', () => {
  test('the default state encodes to a stable string', () => {
    // A change here breaks every shared link: bump the scheme version instead.
    expect(encodeState(defaultState())).toBe(
      '#v1.eyJwIjpbIjMiLCIyIl0sInIiOlsxLDFdLCJ0IjoxMjAsIm0iOiJoZWlnaHQtZHJ1bSJ9',
    );
  });

  test('route() takes the payload straight out of it', () => {
    const hash = encodeState(defaultState());
    expect(route(hash)).toEqual({ view: 'play', state: hash.slice('#v1.'.length) });
  });

  test('never carries volume, the last hash or UI state', () => {
    const state: AppState = { ...defaultState(), volume: 0.123, lastStateHash: '#v1.secret' };
    const withUi: AppState = { ...state, sheetTab: 'sound' };
    expect(encodeState(state)).toBe(encodeState(defaultState()));
    expect(encodeState(withUi)).toBe(encodeState(defaultState()));
  });

  test('is url-safe, and a custom mapping stays compact', () => {
    const hash = encodeState({ ...defaultState(), mapping: custom });
    expect(hash).toMatch(/^#v1\.[A-Za-z0-9_-]+$/);
    expect(hash.length).toBeLessThan(500);
  });

  test('a preset mapping travels as its name', () => {
    for (const name of PRESET_NAMES) {
      const json = atob(payloadOf(encodeState({ ...defaultState(), mapping: applyPreset(name) })).replace(/-/g, '+').replace(/_/g, '/'));
      expect(JSON.parse(json).m).toBe(name);
    }
  });
});

describe('round trip', () => {
  test('the default state', () => {
    const d = defaultState();
    expect(decodeState(payloadOf(encodeState(d)))).toEqual({
      patterns: d.patterns,
      ratio: d.ratio,
      bpm: d.bpm,
      mapping: d.mapping,
    });
  });

  test('every preset', () => {
    for (const name of PRESET_NAMES) {
      const state = { ...defaultState(), mapping: applyPreset(name) };
      const back = decodeState(payloadOf(encodeState(state)));
      expect(back?.mapping).toEqual(applyPreset(name));
      expect(presetOf(back?.mapping as Mapping)).toBe(name);
    }
  });

  test('a custom mapping, a ratio, two patterns, a tempo', () => {
    const state: AppState = {
      ...defaultState(),
      patterns: ['2 2x 2', '2x 2'],
      ratio: { a: 3, b: 2 },
      bpm: 90,
      mapping: custom,
    };
    expect(decodeState(payloadOf(encodeState(state)))).toEqual({
      patterns: state.patterns,
      ratio: state.ratio,
      bpm: 90,
      mapping: custom,
    });
  });

  test('a mapping that is one edit off a preset round-trips as custom', () => {
    const edited: Mapping = { ...applyPreset('height-pitch'), catches: { on: true, sample: 'clave' } };
    const back = decodeState(payloadOf(encodeState({ ...defaultState(), mapping: edited })));
    expect(back?.mapping).toEqual(edited);
    expect(presetOf(back?.mapping as Mapping)).toBe('custom');
  });

  test('non-ASCII pattern text survives the codec, then the parser turns it away', () => {
    const state: AppState = { ...defaultState(), patterns: ['3é', '→'] };
    expect(decodeState(payloadOf(encodeState(state)))?.patterns).toEqual(defaultState().patterns);
  });

  test('every combination of the on/off flags', () => {
    for (const bits of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const m: Mapping = {
        ...custom,
        catches: { ...custom.catches, on: (bits & 1) !== 0 },
        filter: { ...custom.filter, on: (bits & 2) !== 0 },
        pad: { ...custom.pad, on: (bits & 4) !== 0 },
      };
      expect(decodeState(payloadOf(encodeState({ ...defaultState(), mapping: m })))?.mapping).toEqual(m);
    }
  });
});

describe('junk', () => {
  const d = defaultState();
  const defaults = { patterns: d.patterns, ratio: d.ratio, bpm: d.bpm, mapping: DEFAULT_MAPPING };

  test('not a payload at all gives null', () => {
    for (const junk of ['', '!!!', 'not base64 at all', '%%%%', b64([1, 2]).slice(0, 3), 'bnVsbA', 'MTIz', 'InN0ciI']) {
      expect(decodeState(junk)).toBeNull();
    }
  });

  test('valid base64 of invalid UTF-8 or invalid JSON gives null', () => {
    expect(decodeState('_-8')).toBeNull();
    expect(decodeState('YWJj')).toBeNull();
  });

  test('an empty object is all defaults', () => {
    expect(decodeState(b64({}))).toEqual(defaults);
  });

  test('unknown fields are ignored', () => {
    expect(decodeState(b64({ zzz: 1, v: 0.1, volume: 0.5, m: { zzz: [1] } }))).toEqual(defaults);
  });

  test('missing fields come from the defaults, one by one', () => {
    expect(decodeState(b64({ t: 100 }))).toEqual({ ...defaults, bpm: 100 });
    expect(decodeState(b64({ r: [4, 3] }))).toEqual({ ...defaults, ratio: { a: 4, b: 3 } });
    expect(decodeState(b64({ p: ['441'] }))?.patterns).toEqual(['441', d.patterns[1]]);
    expect(decodeState(b64({ m: { f: [1] } }))?.mapping?.filter).toEqual({
      on: true,
      low: DEFAULT_MAPPING.filter.low,
      high: DEFAULT_MAPPING.filter.high,
    });
  });

  test('wrong types fall back per field', () => {
    const junk = decodeState(
      b64({
        p: [3, null],
        r: ['a', {}],
        t: 'fast',
        m: { h: 'x', b: 5, v: [[null, 'x'], 7], c: ['y', 4], d: [{}, 9], f: [2, 'lo', null], a: [true, 'organ', 'C#'] },
      }),
    );
    expect(junk).toEqual(defaults);
    expect(decodeState(b64({ p: 'abc', r: 'x', m: 12 }))).toEqual(defaults);
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
        p: ['3'.repeat(65), '4'],
        m: { v: [[-5, 5], [0.5, -1]], d: [999], f: [1, 1, 1e9] },
      }),
    ) as AppState;
    expect(s.bpm).toBe(BPM_RANGE.max);
    expect(s.ratio).toEqual({ a: 1, b: 9 });
    expect(s.patterns).toEqual([d.patterns[0], '4']);
    expect(s.mapping.hands).toEqual([
      { pan: -1, gain: 1 },
      { pan: 0.5, gain: 0 },
    ]);
    expect(s.mapping.crossAccent.velocity).toBe(40);
    expect(s.mapping.filter).toMatchObject({ low: 100, high: 20000 });
    expect(decodeState(b64({ t: 0 }))?.bpm).toBe(BPM_RANGE.min);
    expect(decodeState(b64({ t: 100.4, r: [2.6, 3.2] }))).toMatchObject({ bpm: 100, ratio: { a: 3, b: 3 } });
    expect(decodeState(b64({ t: null, r: [Number.NaN, 2] }))).toMatchObject({ bpm: d.bpm, ratio: { a: 1, b: 2 } });
  });
});

describe('pattern text goes through the parser (C nit 2)', () => {
  const d = defaultState();

  test('text the parser cannot read falls back to that hand’s default', () => {
    const s = decodeState(b64({ p: ['3<script>', '2?'] }));
    expect(s?.patterns).toEqual(d.patterns);
    expect(decodeState(b64({ p: ['', '  '] }))?.patterns).toEqual(d.patterns);
    expect(decodeState(b64({ p: ['441', 'q'] }))?.patterns).toEqual(['441', d.patterns[1]]);
  });

  test('text that parses but does not validate is kept, for the fix state (never the player)', () => {
    expect(decodeState(b64({ p: ['432', '2'] }))?.patterns).toEqual(['432', '2']);
    expect(decodeState(b64({ p: ['12', '2'] }))?.patterns).toEqual(['12', '2']);
  });

  test('crossing marks and spaces still parse', () => {
    expect(decodeState(b64({ p: ['3x 3x', '2'], r: [3, 2] }))?.patterns).toEqual(['3x 3x', '2']);
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
