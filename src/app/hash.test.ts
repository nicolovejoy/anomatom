import { describe, expect, test } from 'vitest';
import { buildSchedule, partsFromOnsets, partsFromPassing, withPhase } from '../core';
import type { Parts } from '../core';
import { applyPreset, PRESET_NAMES, presetOf, withPartCount, type Mapping } from '../sound/mapping';
import { lineParts, vanillaParts } from '../test/schedules';
import { BPM_RANGE, DEFAULT_BPM, DEFAULT_MAPPING, MAX_LINK_CYCLE, MAX_PARTS } from '../tunables';
import cards from './fixtures/v1-cards.json';
import { decodeState, encodeHash, encodeState } from './hash';
import { PRESETS } from './presets';
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
  pass: { velocity: 11, sample: 'cowbell' },
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
    // A default part's phase is stored within its period (3 beats of 2 pulses), where it means the same.
    const late = [{ spacing: 2, phase: 13, unit: 2, flights: { kind: 'default' as const, onsets: [true, false, true], k: 1 } }];
    const lateJson = atob(payloadOf(encodeState({ ...defaultState(), parts: late })).replace(/-/g, '+').replace(/_/g, '/'));
    expect(JSON.parse(lateJson).p[0].f).toBe(1);
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
    // `r` is derived from the parts: one that disagrees with them is ignored, one that agrees is kept as written.
    expect(decodeState(b64({ r: [4, 3] }))).toEqual(defaults);
    expect(decodeState(b64({ r: [2, 2] }))).toEqual({ ...defaults, ratio: { a: 2, b: 2 } });
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
        p: [
          { s: 9, f: 0, u: 9, o: '1', k: 1 },
          { s: 1, f: 0, u: 1, o: '1', k: 1 },
        ],
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
    const oneTwo = [
      { s: 2, f: 0, u: 2, o: '1', k: 1 },
      { s: 1, f: 0, u: 1, o: '1', k: 1 },
    ];
    expect(decodeState(b64({ t: null, r: [Number.NaN, 2], p: oneTwo }))).toMatchObject({ bpm: d.bpm, ratio: { a: 1, b: 2 } });
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

describe('lanes: three and four parts (docs/plans/lanes.md)', () => {
  const x = (s: string) => [...s].map((c) => c === 'x');
  const voices = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ kit: 'TR-808', sample: i % 2 ? 'snare' : 'kick', pan: 0, gain: 1 }));
  const rOf = (hash: string) => JSON.parse(atob(payloadOf(hash).replace(/-/g, '+').replace(/_/g, '/'))).r;

  test('three parts at rates 3, 4 and 5, with a phase, k = 2 and a manual lone part, round-trip; r is the first two rates', () => {
    const stack: Parts = [
      ...partsFromOnsets([x('x..x'), x('xx')], [20, 15], [1, 2]),
      { spacing: 12, phase: 6, unit: 12, flights: { kind: 'manual', throws: [{ height: 36, to: null }, { height: 0, to: null }, { height: 0, to: null }] } },
    ];
    const state: AppState = { ...defaultState(), parts: stack, drafts: [null, null, null], ratio: { a: 3, b: 4 }, mapping: { ...custom, parts: voices(3) } };
    const back = roundTrip(state);
    expect(back?.parts).toEqual(stack);
    expect(back?.ratio).toEqual({ a: 3, b: 4 });
    expect(back?.mapping.parts).toEqual(voices(3));
    expect(rOf(encodeState(state))).toEqual([3, 4]);
  });

  test('four parts, two of them joined by crosses, round-trip juggleable', () => {
    const four: Parts = [
      ...lineParts(['2 2x 2', '2x 2'], { a: 3, b: 2 }),
      ...partsFromOnsets([x('x.'), x('x')], [6, 6]),
    ];
    const state: AppState = { ...defaultState(), parts: four, drafts: four.map(() => null), mapping: { ...custom, parts: voices(4) } };
    const back = roundTrip(state);
    expect(back?.parts).toEqual(four);
    expect(back?.ratio).toEqual({ a: 3, b: 2 });
    expect(buildSchedule(back?.parts as Parts).verdict.ok).toBe(true);
    expect(back?.mapping.parts).toEqual(voices(4));
  });

  test('a preset name decodes with one voice per part', () => {
    const three = partsFromOnsets([x('x'), x('x'), x('x')], [1, 1, 1]);
    const back = decodeState(b64({ p: three.map((p) => ({ s: p.spacing, f: 0, u: p.unit, o: '1', k: 1 })), m: 'voice-per-part' }));
    expect(back?.mapping.parts).toHaveLength(3);
  });

  test('the ratio written is the parts’, whatever the state holds', () => {
    const stepped: AppState = { ...defaultState(), ratio: { a: 2, b: 2 } };
    expect(rOf(encodeState(stepped))).toEqual([1, 1]);
  });
});

describe('short links (grammar in route.ts)', () => {
  const shared = (s: AppState) => ({ parts: s.parts, ratio: s.ratio, bpm: s.bpm, mapping: s.mapping });
  const roundTrips = (hash: string, state: Pick<AppState, 'parts' | 'ratio' | 'bpm' | 'mapping'>) => {
    const r = route(hash);
    expect(r.version).toBe('short');
    const back = decodeState(r.state as string, 'short');
    expect(back).not.toBeNull();
    expect(encodeState(back as NonNullable<typeof back>)).toBe(encodeState(state));
  };

  test('every two-part card takes its shortest form and round-trips', () => {
    const short: Record<string, string> = {
      cascade: '#3~height-drum',
      pause: '#441~height-drum',
      classic: '#531~height-drum',
      ramp: '#97531~height-drum',
      polyrhythm: '#3:2/2-2x-2/2x-2~height-drum',
    };
    const seen: string[] = [];
    for (const p of PRESETS.filter((c) => c.parts.length === 2)) {
      seen.push(p.id);
      const state = { parts: p.parts, ratio: p.ratio, bpm: DEFAULT_BPM, mapping: p.mapping };
      const hash = encodeHash(state);
      if (p.id in short) expect(hash).toBe(short[p.id]);
      roundTrips(hash, state);
    }
    expect(Object.keys(short).every((id) => seen.includes(id))).toBe(true);
  });
  test('the tempo rides after @ unless it is the default', () => {
    const base = { ...shared(defaultState()), parts: vanillaParts('531') };
    expect(encodeHash({ ...base, bpm: 140 })).toBe('#531@140');
    expect(encodeHash({ ...base, bpm: DEFAULT_BPM })).toBe('#531');
    roundTrips('#531@140', { ...base, bpm: 140 });
    const drum = { ...base, mapping: applyPreset('height-drum'), bpm: 140 };
    expect(encodeHash(drum)).toBe('#531~height-drum@140');
    roundTrips('#531~height-drum@140', drum);
    expect(decodeState('531~nope', 'short')).toBeNull();
    expect(decodeState('531~custom', 'short')).toBeNull();
    const hands = { ...base, parts: lineParts(['2 2x 2', '2x 2'], { a: 3, b: 2 }), ratio: { a: 3, b: 2 } };
    expect(encodeHash({ ...hands, bpm: 90 })).toBe('#3:2/2-2x-2/2x-2@90');
  });

  test('a changed mapping, a phase, a third part or a odd tempo fall back to #v2.', () => {
    const base = { ...shared(defaultState()), parts: vanillaParts('531') };
    const v2 = (s: typeof base) => expect(encodeHash(s).startsWith('#v2.')).toBe(true);
    v2({ ...base, mapping: custom });
    v2({ ...base, parts: withPhase(base.parts, 1, 2, 1) });
    v2({ ...base, bpm: 100.5 });
    v2({ ...base, parts: lineParts(['3', '3', '3'], { a: 1, b: 1 }) });
    const hands = { ...base, parts: lineParts(['2 2x 2', '2x 2'], { a: 3, b: 2 }), ratio: { a: 3, b: 2 } };
    v2({ ...hands, parts: withPhase(hands.parts, 1, 2, 1) });
    v2({ ...hands, mapping: custom });
    // Two parts at 1:1 that are not one siteswap (a hand each) have no short form.
    v2({ ...base, parts: lineParts(['3', '4'], { a: 1, b: 1 }) });
    // Default-rule parts are not written throws.
    v2({ ...base, parts: partsFromOnsets([[true, false], [true]], [1, 1]) });
  });

  test('a preset on another kit has no short form and round-trips through #v2. with the kit intact', () => {
    const base = { ...shared(defaultState()), parts: vanillaParts('531') };
    const lm2: Mapping = { ...base.mapping, parts: base.mapping.parts.map((v) => ({ ...v, kit: 'LM-2' })) };
    const state = { ...base, mapping: lm2 };
    expect(presetOf(lm2)).toBe('voice-per-part');
    const hash = encodeHash(state);
    expect(hash.startsWith('#v2.')).toBe(true);
    const back = decodeState(hash.slice('#v2.'.length));
    expect(back?.mapping.parts.map((v) => v.kit)).toEqual(['LM-2', 'LM-2']);
    expect(encodeState(back as NonNullable<typeof back>)).toBe(encodeState(state));
  });

  test('a short link is decoded by the parsers the Pattern tab uses', () => {
    const typed = decodeState('531', 'short');
    expect(typed?.parts).toEqual(vanillaParts('531'));
    expect(typed?.ratio).toEqual({ a: 1, b: 1 });
    expect(typed?.bpm).toBe(DEFAULT_BPM);
    expect(typed?.mapping).toEqual(DEFAULT_MAPPING);
    expect(decodeState('531@9999', 'short')?.bpm).toBe(BPM_RANGE.max);
    expect(decodeState('531@', 'short')?.bpm).toBe(DEFAULT_BPM);
    expect(decodeState('531@abc', 'short')?.bpm).toBe(DEFAULT_BPM);
    const hands = decodeState('6:4/2-2x-2/2x-2', 'short');
    expect(hands?.ratio).toEqual({ a: 6, b: 4 });
    expect(hands?.parts).toEqual(lineParts(['2 2x 2', '2x 2'], { a: 6, b: 4 }));
  });

  test('junk short forms decode to nothing, so the defaults load', () => {
    for (const junk of [
      '', 'x', '5!1', '9'.repeat(65), '5/1', '3:2', '3:2/2', '3:2/2/2/2', '0:2/2/2', '3:0/2/2', '3:2/2!/2', '3:2/x2/2', '3:2/ / ',
      '2:2/2/2', '99999:2/2/2', `3:2/${'2'.repeat(65)}/2`, '3:2/0x/2',
    ]) {
      expect(decodeState(junk, 'short')).toBeNull();
    }
    expect(decodeState('5x1', 'short')).toBeNull();
  });
});

describe('short passing links (ruling 6)', () => {
  const passing = (text: string): Parts => {
    const r = partsFromPassing(text);
    if (!r.ok) throw new Error(text);
    return r.parts;
  };
  const base = (): Pick<AppState, 'parts' | 'ratio' | 'bpm' | 'mapping'> => ({
    parts: passing('<3p 3|3p 3>'),
    ratio: { a: 1, b: 1 },
    bpm: DEFAULT_BPM,
    mapping: withPartCount(DEFAULT_MAPPING, 4),
  });
  const back = (hash: string) => {
    const r = route(hash);
    expect(r.version).toBe('short');
    return decodeState(r.state as string, 'short');
  };

  test('#3p-3|3p-3 round-trips, tempo and preset included', () => {
    const state = base();
    expect(encodeHash(state)).toBe('#3p-3|3p-3');
    expect(encodeState(back('#3p-3|3p-3') as NonNullable<ReturnType<typeof back>>)).toBe(encodeState(state));
    const drum = { ...state, mapping: withPartCount(applyPreset('height-drum'), 4), bpm: 140 };
    expect(encodeHash(drum)).toBe('#3p-3|3p-3~height-drum@140');
    expect(encodeState(back('#3p-3|3p-3~height-drum@140') as NonNullable<ReturnType<typeof back>>)).toBe(encodeState(drum));
  });
  test('three jugglers write p<n>', () => {
    const state = { ...base(), parts: passing('<3p2 3|3p3 3|3p1 3>'), mapping: withPartCount(DEFAULT_MAPPING, 6) };
    expect(encodeHash(state)).toBe('#3p2-3|3p3-3|3p1-3');
    expect(back('#3p2-3|3p3-3|3p1-3')?.parts).toEqual(state.parts);
  });
  test('a percent-encoded | still reads', () => {
    expect(route('#3p-3%7C3p-3')).toEqual({ view: 'play', state: '3p-3|3p-3', version: 'short' });
  });
  test('the passing card, with its kits, writes #v2. and round-trips', () => {
    const card = PRESETS.find((p) => p.id === 'passing')!;
    const state = { parts: card.parts, ratio: card.ratio, bpm: DEFAULT_BPM, mapping: card.mapping };
    const hash = encodeHash(state);
    expect(hash.startsWith('#v2.')).toBe(true);
    const out = decodeState(hash.slice('#v2.'.length));
    expect(out?.mapping.parts.map((v) => v.kit)).toEqual(['TR-808', 'TR-808', 'LM-2', 'LM-2']);
    expect(encodeState(out as NonNullable<typeof out>)).toBe(encodeState(state));
  });
  test('a changed mapping or phase falls back to #v2.', () => {
    expect(encodeHash({ ...base(), mapping: custom }).startsWith('#v2.')).toBe(true);
    expect(encodeHash({ ...base(), parts: withPhase(base().parts, 1, 2, 1) }).startsWith('#v2.')).toBe(true);
    // Four manual parts that are not a passing set have no short form.
    expect(encodeHash({ ...base(), parts: lineParts(['3', '3', '3', '3'], { a: 1, b: 1 }) }).startsWith('#v2.')).toBe(true);
  });
  test('#3p3 with no | stays vanilla, with a 25', () => {
    expect(back('#3p3')?.parts).toEqual(vanillaParts('3p3'));
    expect(back('#3p3')?.parts).toHaveLength(2);
  });
  test('junk passing links do not parse', () => {
    expect(decodeState('3p-3|', 'short')).toBeNull();
    expect(decodeState('3p-3|3p-3|3p-3|3p-3', 'short')).toBeNull();
    expect(decodeState('3p-3|x', 'short')).toBeNull();
    expect(decodeState('3p-3|3p-3/3', 'short')).toBeNull();
    expect(decodeState(`3|${'3'.repeat(80)}`, 'short')).toBeNull();
    expect(decodeState('3p-3|3p-3~nope', 'short')).toBeNull();
  });
});
