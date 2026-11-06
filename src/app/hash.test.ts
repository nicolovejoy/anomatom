import { describe, expect, test } from 'vitest';
import { buildSchedule, isSyncSet, partsFromOnsets, partsFromPassing, partsFromSync, withPhase } from '../core';
import type { Parts } from '../core';
import { lineParts, vanillaParts } from '../test/schedules';
import { BPM_RANGE, DEFAULT_ALSO, DEFAULT_BPM, MAX_LINK_CYCLE, MAX_PARTS } from '../tunables';
import { copy } from '../ui/copy';
import cards from './fixtures/v1-cards.json';
import { decodeState, encodeHash, encodeState, type Shared } from './hash';
import { PRESETS } from './presets';
import { defaultParts, defaultState, type AppState } from './state';
import { route } from './route';

const b64 = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const json = (hash: string) => JSON.parse(atob(payloadOf(hash).replace(/-/g, '+').replace(/_/g, '/')));

/** A sound that is no default in any of its three fields. */
const mine = { listen: 'pitch', also: { catches: true, downbeat: false, pad: true }, kitShift: 3 } as const;
const soundOf = (s: Pick<AppState, 'listen' | 'also' | 'kitShift'> | null | undefined) => s && { listen: s.listen, also: s.also, kitShift: s.kitShift };
const DEFAULT_SOUND = { listen: 'ball', also: DEFAULT_ALSO, kitShift: 0 };

const payloadOf = (hash: string) => route(hash).state ?? '';
const roundTrip = (state: AppState) => decodeState(payloadOf(encodeState(state)));

describe('encodeState', () => {
  test('an old link written at the former default keeps its 120 bpm', () => {
    const old = '#v2.eyJwIjpbeyJzIjoyLCJmIjowLCJ1IjoxLCJ0IjpbWzMsMV1dfSx7InMiOjIsImYiOjEsInUiOjEsInQiOltbMywwXV19XSwiciI6WzEsMV0sInQiOjEyMCwibSI6InZvaWNlLXBlci1wYXJ0In0';
    expect(decodeState(payloadOf(old), 2)?.bpm).toBe(120);
  });

  test('the default state encodes to a stable string', () => {
    // The default tempo may change (104 now); a change in the encoding breaks every shared link: bump the scheme version instead.
    expect(encodeState(defaultState())).toBe(
      '#v3.eyJwIjpbeyJzIjoyLCJmIjowLCJ1IjoxLCJ0IjpbWzMsMV1dfSx7InMiOjIsImYiOjEsInUiOjEsInQiOltbMywwXV19XSwiciI6WzEsMV0sInQiOjEwNH0',
    );
  });

  test('route() takes the payload straight out of it', () => {
    const hash = encodeState(defaultState());
    expect(route(hash)).toEqual({ view: 'play', state: hash.slice('#v3.'.length), version: 3 });
  });

  test('never carries volume, drafts, the notice, the last hash or UI state', () => {
    const state: AppState = {
      ...defaultState(),
      volume: 0.123,
      lastStateHash: '#v3.secret',
      drafts: ['33', null],
      notice: 'I reset hand 1 to 1 ball.',
    };
    expect(encodeState(state)).toBe(encodeState(defaultState()));
    const withUi: AppState = { ...state, sheetTab: 'sound' };
    expect(encodeState(withUi)).toBe(encodeState(defaultState()));
  });

  test('is url-safe; the sound keys ride only when they are not the defaults (v5 ruling 6)', () => {
    expect(encodeState({ ...defaultState(), ...mine })).toMatch(/^#v3\.[A-Za-z0-9_-]+$/);
    expect(Object.keys(json(encodeState(defaultState())))).toEqual(['p', 'r', 't']);
    expect(json(encodeState({ ...defaultState(), ...mine }))).toMatchObject({ l: 'pitch', a: [1, 0, 1], k: 3 });
    expect(Object.keys(json(encodeState({ ...defaultState(), listen: 'height' })))).toEqual(['p', 'r', 't', 'l']);
    expect(Object.keys(json(encodeState({ ...defaultState(), also: { ...DEFAULT_ALSO, catches: true } })))).toEqual(['p', 'r', 't', 'a']);
    expect(Object.keys(json(encodeState({ ...defaultState(), kitShift: 1 })))).toEqual(['p', 'r', 't', 'k']);
    // Equal by content is the default, whatever the object.
    expect(encodeState({ ...defaultState(), also: { ...DEFAULT_ALSO } })).toBe(encodeState(defaultState()));
  });

  test('parts in short keys', () => {
    const parts = partsFromOnsets([[true, false, true]], [1], [2]);
    expect(json(encodeState({ ...defaultState(), parts })).p).toEqual([{ s: 1, f: 0, u: 1, o: '101', k: 2 }]);
    // A default part's phase is stored within its period (3 beats of 2 pulses), where it means the same.
    const late = [{ spacing: 2, phase: 13, unit: 2, flights: { kind: 'default' as const, onsets: [true, false, true], k: 1 } }];
    expect(json(encodeState({ ...defaultState(), parts: late })).p[0].f).toBe(1);
  });
});

describe('round trip', () => {
  test('the default state', () => {
    const d = defaultState();
    expect(roundTrip(d)).toEqual({ parts: d.parts, ratio: d.ratio, bpm: d.bpm, ...DEFAULT_SOUND, notice: null });
  });

  test('with and without each optional key', () => {
    for (const listen of ['height', 'ball', 'pitch'] as const) expect(roundTrip({ ...defaultState(), listen })?.listen).toBe(listen);
    for (let bits = 0; bits < 8; bits++) {
      const also = { catches: (bits & 1) !== 0, downbeat: (bits & 2) !== 0, pad: (bits & 4) !== 0 };
      expect(roundTrip({ ...defaultState(), also })?.also).toEqual(also);
    }
    for (const kitShift of [0, 1, 2, 3, 4]) expect(roundTrip({ ...defaultState(), kitShift })?.kitShift).toBe(kitShift);
    expect(soundOf(roundTrip({ ...defaultState(), ...mine }))).toEqual(mine);
  });

  test('a sound, a ratio, manual parts with crosses, a tempo', () => {
    const state: AppState = { ...defaultState(), parts: lineParts(['2 2x 2', '2x 2'], { a: 3, b: 2 }), ratio: { a: 3, b: 2 }, bpm: 90, ...mine };
    expect(roundTrip(state)).toEqual({ parts: state.parts, ratio: state.ratio, bpm: 90, ...mine, notice: null });
  });

  test('default parts with k and a phase, and three parts', () => {
    const clapping = [true, true, true, false, true, true, false, true, false, true, true, false];
    const parts = withPhase(partsFromOnsets([clapping, clapping], [1, 1], [1, 3]), 1, 3, 1);
    expect(roundTrip({ ...defaultState(), parts })?.parts).toEqual(parts);
    const three = lineParts(['2x2 0', '2', '2x1 0'], { a: 1, b: 1 });
    expect(roundTrip({ ...defaultState(), parts: three })?.parts).toEqual(three);
  });

  test('junk sound keys take their defaults, one by one', () => {
    const v3 = (value: unknown) => soundOf(decodeState(b64(value), 3));
    expect(v3({ l: 'height-drum', a: 'x', k: 'x' })).toEqual(DEFAULT_SOUND);
    expect(v3({ l: 'toString', a: [2, 'x', null], k: 1.5 })).toEqual(DEFAULT_SOUND);
    expect(v3({ a: [1] })).toEqual({ ...DEFAULT_SOUND, also: { ...DEFAULT_ALSO, catches: true } });
    expect(v3({ k: 7 })?.kitShift).toBe(2);
    expect(v3({ k: -1 })?.kitShift).toBe(4);
    // A decoded also equal to the default is the default object.
    expect(decodeState(b64({ a: [0, 1, 0] }), 3)?.also).toBe(DEFAULT_ALSO);
  });
});

describe('v2 links still open (v5 ruling 6)', () => {
  const v2 = (m: unknown) => decodeState(b64({ m }), 2);

  test('the old default (Voice per part) plays by height, with a notice', () => {
    const old = '#v2.eyJwIjpbeyJzIjoyLCJmIjowLCJ1IjoxLCJ0IjpbWzMsMV1dfSx7InMiOjIsImYiOjEsInUiOjEsInQiOltbMywwXV19XSwiciI6WzEsMV0sInQiOjEyMCwibSI6InZvaWNlLXBlci1wYXJ0In0';
    const r = route(old);
    expect(r.version).toBe(2);
    const s = decodeState(r.state as string, 2);
    expect(s?.parts).toEqual(vanillaParts('3'));
    expect(soundOf(s)).toEqual({ listen: 'height', also: DEFAULT_ALSO, kitShift: 0 });
    expect(s?.notice).toBe(copy.voicePerPartGone);
  });

  test('each preset name: its rule, no notice', () => {
    expect(v2('height-drum')).toMatchObject({ listen: 'height', also: DEFAULT_ALSO, kitShift: 0, notice: null });
    expect(v2('height-pitch')).toMatchObject({ listen: 'pitch', notice: null });
    expect(v2('ball-pitch')).toMatchObject({ listen: 'ball', notice: null });
  });

  test('a preset on kits, and the passing card’s mapping, keep their first kit as the shift', () => {
    expect(v2({ n: 'height-drum', k: 'LM-2' })).toMatchObject({ listen: 'height', kitShift: 1 });
    const passingCard = {
      h: ['hihat-close', 'hihat-close', 'snare', 'tom-low', 'kick', 'kick', 'kick', 'kick', 'kick'],
      b: null,
      p: [['TR-808', 'kick', -0.8, 1], ['TR-808', 'snare', -0.4, 1], ['LM-2', 'hihat-close', 0.4, 1], ['LM-2', 'clap', 0.8, 1]],
      y: 1, c: [0, 'rimshot'], d: [20, 'clap'], f: [0, 400, 12000], a: [0, 'mellotron', 'Dm9'], q: [20, null],
    };
    expect(v2(passingCard)).toMatchObject({ listen: 'height', also: DEFAULT_ALSO, kitShift: 0, notice: null });
  });

  test('a custom mapping: ball from a ball list, also from its switches', () => {
    const custom = {
      h: ['clap', null, 'snare', 'cowbell', 'kick', 'kick', 'maraca', 'cymbal', 'tom-hi'],
      b: ['kick', 'clave'],
      p: [['MFB-512', 'conga-hi', -0.25, 0.5], ['TR-808', null, 1, 0]],
      y: 1, c: [1, 'rimshot'], d: [33, null], f: [1, 250, 9000], a: [1, 'soundfont', 'F69'], q: [11, 'cowbell'],
    };
    expect(v2(custom)).toMatchObject({ listen: 'ball', also: { catches: true, downbeat: false, pad: true }, kitShift: 2, notice: null });
    expect(v2({ ...custom, b: null })).toMatchObject({ listen: 'height' });
    expect(v2({ ...custom, y: 0 })).toMatchObject({ listen: 'height', notice: copy.voicePerPartGone });
  });

  test('junk m is the old default: height, with a notice; no m at all is today’s default', () => {
    expect(v2(undefined)).toMatchObject({ ...DEFAULT_SOUND, notice: null });
    for (const m of [null, 12, [1, 2], 'height-banana']) {
      expect(v2(m), String(m)).toMatchObject({ listen: 'height', also: DEFAULT_ALSO, kitShift: 0, notice: copy.voicePerPartGone });
    }
  });

  test('a v2 link with a sound of its own re-encodes as v3 with that sound', () => {
    const s = v2({ n: 'height-pitch', k: 'Roland CR-8000' }) as Shared;
    expect(json(encodeState({ ...defaultState(), ...s }))).toMatchObject({ l: 'pitch', k: 3 });
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
      expect(soundOf(s), card.id).toEqual({ listen: 'height', also: DEFAULT_ALSO, kitShift: 0 });
      expect(s?.notice).toBeNull();
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
  const defaults = { parts: d.parts, ratio: d.ratio, bpm: d.bpm, ...DEFAULT_SOUND, notice: null };
  /** An old scheme's empty sound: the old default, Voice per part, read as height with a notice. */
  const old = { ...defaults, listen: 'height', notice: copy.voicePerPartGone };

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
    // An old link with no `m` says nothing about sound: today's defaults, no notice.
    expect(decodeState(b64({}), 2)).toEqual(defaults);
    expect(decodeState(b64({}), 1)).toEqual(defaults);
  });

  test('unknown fields are ignored', () => {
    expect(decodeState(b64({ zzz: 1, v: 0.1, volume: 0.5, m: { zzz: [1] } }))).toEqual(defaults);
    expect(decodeState(b64({ zzz: 1, v: 0.1, volume: 0.5, m: { zzz: [1] } }), 2)).toEqual(old);
  });

  test('missing fields come from the defaults, one by one', () => {
    expect(decodeState(b64({ t: 100 }))).toEqual({ ...defaults, bpm: 100 });
    // `r` is derived from the parts: one that disagrees with them is ignored, one that agrees is kept as written.
    expect(decodeState(b64({ r: [4, 3] }))).toEqual(defaults);
    expect(decodeState(b64({ r: [2, 2] }))).toEqual({ ...defaults, ratio: { a: 2, b: 2 } });
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
    const junk = decodeState(b64({ r: ['a', {}], t: 'fast', l: 5, a: { c: 1 }, k: '2' }));
    expect(junk).toEqual(defaults);
    expect(decodeState(b64({ r: 'x', m: 12 }))).toEqual(defaults);
    expect(decodeState(b64({ r: 'x', m: 12 }), 2)).toEqual(old);
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
        k: 12,
      }),
    ) as AppState;
    expect(s.bpm).toBe(BPM_RANGE.max);
    expect(s.ratio).toEqual({ a: 1, b: 9 });
    expect(s.kitShift).toBe(2);
    expect(decodeState(b64({ t: 0 }))?.bpm).toBe(BPM_RANGE.min);
    expect(decodeState(b64({ t: 100.4, r: [2.6, 3.2] }))).toMatchObject({ bpm: 100, ratio: { a: 3, b: 3 } });
    const oneTwo = [
      { s: 2, f: 0, u: 2, o: '1', k: 1 },
      { s: 1, f: 0, u: 1, o: '1', k: 1 },
    ];
    expect(decodeState(b64({ t: null, r: [Number.NaN, 2], p: oneTwo }))).toMatchObject({ bpm: d.bpm, ratio: { a: 1, b: 2 } });
  });
});

describe('lanes: three and four parts (docs/plans/lanes.md)', () => {
  const x = (s: string) => [...s].map((c) => c === 'x');
  const rOf = (hash: string) => JSON.parse(atob(payloadOf(hash).replace(/-/g, '+').replace(/_/g, '/'))).r;

  test('three parts at rates 3, 4 and 5, with a phase, k = 2 and a manual lone part, round-trip; r is the first two rates', () => {
    const stack: Parts = [
      ...partsFromOnsets([x('x..x'), x('xx')], [20, 15], [1, 2]),
      { spacing: 12, phase: 6, unit: 12, flights: { kind: 'manual', throws: [{ height: 36, to: null }, { height: 0, to: null }, { height: 0, to: null }] } },
    ];
    const state: AppState = { ...defaultState(), parts: stack, drafts: [null, null, null], ratio: { a: 3, b: 4 }, ...mine };
    const back = roundTrip(state);
    expect(back?.parts).toEqual(stack);
    expect(back?.ratio).toEqual({ a: 3, b: 4 });
    expect(soundOf(back)).toEqual(mine);
    expect(rOf(encodeState(state))).toEqual([3, 4]);
  });

  test('four parts, two of them joined by crosses, round-trip juggleable', () => {
    const four: Parts = [
      ...lineParts(['2 2x 2', '2x 2'], { a: 3, b: 2 }),
      ...partsFromOnsets([x('x.'), x('x')], [6, 6]),
    ];
    const state: AppState = { ...defaultState(), parts: four, drafts: four.map(() => null), ...mine };
    const back = roundTrip(state);
    expect(back?.parts).toEqual(four);
    expect(back?.ratio).toEqual({ a: 3, b: 2 });
    expect(buildSchedule(back?.parts as Parts).verdict.ok).toBe(true);
  });

  test('the ratio written is the parts’, whatever the state holds', () => {
    const stepped: AppState = { ...defaultState(), ratio: { a: 2, b: 2 } };
    expect(rOf(encodeState(stepped))).toEqual([1, 1]);
  });
});

describe('short links (grammar in route.ts)', () => {
  const shared = (s: AppState): Shared => ({ parts: s.parts, ratio: s.ratio, bpm: s.bpm, listen: s.listen, also: s.also, kitShift: s.kitShift });
  const roundTrips = (hash: string, state: Shared) => {
    const r = route(hash);
    expect(r.version).toBe('short');
    const back = decodeState(r.state as string, 'short');
    expect(back).not.toBeNull();
    expect(encodeState(back as NonNullable<typeof back>)).toBe(encodeState(state));
  };
  const at = (p: (typeof PRESETS)[number], listen: Shared['listen'] = 'ball'): Shared => ({ ...shared(defaultState()), parts: p.parts, ratio: p.ratio, listen });

  test('every two-part card takes its shortest form and round-trips', () => {
    const short: Record<string, string> = {
      cascade: '#3',
      pause: '#441',
      classic: '#531',
      ramp: '#97531',
      polyrhythm: '#3:2/2-2x-2/2x-2',
      box: '#(4,2x)(2x,4)',
    };
    const seen: string[] = [];
    for (const p of PRESETS.filter((c) => c.parts.length === 2)) {
      seen.push(p.id);
      const hash = encodeHash(at(p));
      if (p.id in short) expect(hash, p.id).toBe(short[p.id]);
      roundTrips(hash, at(p));
      // Listen for height or pitch names itself after a ~.
      for (const listen of ['height', 'pitch'] as const) {
        const named = encodeHash(at(p, listen));
        expect(named.endsWith(`~${listen}`), p.id).toBe(true);
        roundTrips(named, at(p, listen));
      }
    }
    expect(Object.keys(short).every((id) => seen.includes(id))).toBe(true);
  });

  test('the tempo rides after @ unless it is the default', () => {
    const base = { ...shared(defaultState()), parts: vanillaParts('531') };
    expect(encodeHash({ ...base, bpm: 140 })).toBe('#531@140');
    expect(encodeHash({ ...base, bpm: DEFAULT_BPM })).toBe('#531');
    roundTrips('#531@140', { ...base, bpm: 140 });
    const drum = { ...base, listen: 'height' as const, bpm: 140 };
    expect(encodeHash(drum)).toBe('#531~height@140');
    roundTrips('#531~height@140', drum);
    expect(decodeState('531~nope', 'short')).toBeNull();
    expect(decodeState('531~custom', 'short')).toBeNull();
    expect(decodeState('531~toString', 'short')).toBeNull();
    const hands = { ...base, parts: lineParts(['2 2x 2', '2x 2'], { a: 3, b: 2 }), ratio: { a: 3, b: 2 } };
    expect(encodeHash({ ...hands, bpm: 90 })).toBe('#3:2/2-2x-2/2x-2@90');
  });

  test('old ~names still read (v5 ruling 6); Voice per part reads as height, with a notice', () => {
    const named = (name: string) => decodeState(`531~${name}@140`, 'short');
    expect(named('height-drum')).toMatchObject({ listen: 'height', notice: null, bpm: 140 });
    expect(named('height-pitch')).toMatchObject({ listen: 'pitch', notice: null });
    expect(named('ball-pitch')).toMatchObject({ listen: 'ball', notice: null });
    expect(named('voice-per-part')).toMatchObject({ listen: 'height', notice: copy.voicePerPartGone });
    for (const listen of ['height', 'ball', 'pitch'] as const) expect(named(listen)).toMatchObject({ listen, notice: null });
    // Re-encoded, an old name writes the new one.
    expect(encodeHash(named('height-drum') as Shared)).toBe('#531~height@140');
    expect(route('#531~voice-per-part')).toEqual({ view: 'play', state: '531~voice-per-part', version: 'short' });
  });

  test('other switches or drum machines, a phase, a third part or an odd tempo fall back to #v3.', () => {
    const base = { ...shared(defaultState()), parts: vanillaParts('531') };
    const v3 = (s: Shared) => expect(encodeHash(s).startsWith('#v3.')).toBe(true);
    v3({ ...base, also: { ...DEFAULT_ALSO, pad: true } });
    v3({ ...base, kitShift: 1 });
    v3({ ...base, ...mine });
    v3({ ...base, parts: withPhase(base.parts, 1, 2, 1) });
    v3({ ...base, bpm: 100.5 });
    v3({ ...base, parts: lineParts(['3', '3', '3'], { a: 1, b: 1 }) });
    const hands = { ...base, parts: lineParts(['2 2x 2', '2x 2'], { a: 3, b: 2 }), ratio: { a: 3, b: 2 } };
    v3({ ...hands, parts: withPhase(hands.parts, 1, 2, 1) });
    v3({ ...hands, kitShift: 4 });
    // Two parts at 1:1 that are not one siteswap (a hand each) have no short form.
    v3({ ...base, parts: lineParts(['3', '4'], { a: 1, b: 1 }) });
    // Default-rule parts are not written throws.
    v3({ ...base, parts: partsFromOnsets([[true, false], [true]], [1, 1]) });
    // And each round-trips through #v3. with its sound.
    const back = decodeState(payloadOf(encodeHash({ ...base, ...mine })));
    expect(soundOf(back)).toEqual(mine);
  });

  test('a short link is decoded by the parsers the Pattern tab uses, on the default sound', () => {
    const typed = decodeState('531', 'short');
    expect(typed?.parts).toEqual(vanillaParts('531'));
    expect(typed?.ratio).toEqual({ a: 1, b: 1 });
    expect(typed?.bpm).toBe(DEFAULT_BPM);
    expect(soundOf(typed)).toEqual(DEFAULT_SOUND);
    expect(typed?.notice).toBeNull();
    expect(decodeState('531@9999', 'short')?.bpm).toBe(BPM_RANGE.max);
    expect(decodeState('531@', 'short')?.bpm).toBe(DEFAULT_BPM);
    expect(decodeState('531@abc', 'short')?.bpm).toBe(DEFAULT_BPM);
    const hands = decodeState('6:4/2-2x-2/2x-2', 'short');
    expect(hands?.ratio).toEqual({ a: 6, b: 4 });
    expect(hands?.parts).toEqual(lineParts(['2 2x 2', '2x 2'], { a: 6, b: 4 }));
  });

  test('a cut card (v5 §4) still opens from its short link', () => {
    for (const text of ['423', '55500', '534', '645']) expect(decodeState(`${text}~height-drum`, 'short')?.parts, text).toEqual(vanillaParts(text));
    expect(decodeState('(4,4)~height-drum', 'short')?.parts).toHaveLength(2);
    expect(decodeState('3p-3-3-3|3p-3-3-3~height-drum', 'short')?.parts).toHaveLength(4);
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
  const base = (): Shared => ({ ...defaultState(), parts: passing('<3p 3|3p 3>'), ratio: { a: 1, b: 1 }, bpm: DEFAULT_BPM });
  const back = (hash: string) => {
    const r = route(hash);
    expect(r.version).toBe('short');
    return decodeState(r.state as string, 'short');
  };

  test('#3p-3|3p-3 round-trips, tempo and listen included', () => {
    const state = base();
    expect(encodeHash(state)).toBe('#3p-3|3p-3');
    expect(encodeState(back('#3p-3|3p-3') as NonNullable<ReturnType<typeof back>>)).toBe(encodeState(state));
    const drum = { ...state, listen: 'height' as const, bpm: 140 };
    expect(encodeHash(drum)).toBe('#3p-3|3p-3~height@140');
    expect(encodeState(back('#3p-3|3p-3~height@140') as NonNullable<ReturnType<typeof back>>)).toBe(encodeState(drum));
  });
  test('three jugglers write p<n>', () => {
    const state = { ...base(), parts: passing('<3p2 3|3p3 3|3p1 3>') };
    expect(encodeHash(state)).toBe('#3p2-3|3p3-3|3p1-3');
    expect(back('#3p2-3|3p3-3|3p1-3')?.parts).toEqual(state.parts);
  });
  test('four jugglers write p<n> too: both four-juggler cards are short links that round-trip (v6.6)', () => {
    for (const id of ['four-typewriter', 'four-square']) {
      const card = PRESETS.find((p) => p.id === id)!;
      const state = { ...base(), parts: card.parts, ratio: card.ratio };
      const hash = encodeHash(state);
      expect(hash, id).toBe(`#${(card.texts[0] as string).slice(1, -1).replace(/ /g, '-')}`);
      expect(hash.length - 1, id).toBeLessThanOrEqual(64);
      expect(back(hash)?.parts, id).toEqual(card.parts);
    }
    expect(encodeHash({ ...base(), parts: PRESETS.find((p) => p.id === 'four-typewriter')!.parts })).toBe(
      '#3p2-3-3p3-3-3p4-3|3p1-3-3-3-3-3|3-3-3p1-3-3-3|3-3-3-3-3p1-3',
    );
    // Five jugglers are past MAX_JUGGLERS: no short link reads them.
    expect(decodeState('3p2-3|3p3-3|3p4-3|3p5-3|3p1-3', 'short')).toBeNull();
  });
  test('a percent-encoded | still reads', () => {
    expect(route('#3p-3%7C3p-3')).toEqual({ view: 'play', state: '3p-3|3p-3', version: 'short' });
  });
  test('the passing card carries no sound, so it is a short link now; on other drum machines it writes #v3.', () => {
    const card = PRESETS.find((p) => p.id === 'passing')!;
    const state = { ...base(), parts: card.parts, ratio: card.ratio };
    expect(encodeHash(state)).toBe('#3p-3|3p-3');
    const shifted = { ...state, kitShift: 1 };
    const hash = encodeHash(shifted);
    expect(hash.startsWith('#v3.')).toBe(true);
    const out = decodeState(payloadOf(hash));
    expect(out?.kitShift).toBe(1);
    expect(encodeState(out as NonNullable<typeof out>)).toBe(encodeState(shifted));
  });
  test('a changed switch or a phase falls back to #v3.', () => {
    expect(encodeHash({ ...base(), also: { ...DEFAULT_ALSO, catches: true } }).startsWith('#v3.')).toBe(true);
    expect(encodeHash({ ...base(), parts: withPhase(base().parts, 1, 2, 1) }).startsWith('#v3.')).toBe(true);
    // Four manual parts that are not a passing set have no short form.
    expect(encodeHash({ ...base(), parts: lineParts(['3', '3', '3', '3'], { a: 1, b: 1 }) }).startsWith('#v3.')).toBe(true);
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

describe('sync links (v3 ruling 5, v4.3 ruling 3)', () => {
  const syncState = (text: string, extra: Partial<Shared> = {}): Shared => {
    const r = partsFromSync(text);
    if (!r.ok) throw new Error(text);
    return { ...defaultState(), parts: r.parts, ratio: { a: 1, b: 1 }, bpm: DEFAULT_BPM, ...extra };
  };

  test.each(['(4,2x)(2x,4)', '(4,4)', '(6x,4)(4,6x)', '(4x,2x)'])('%s encodes short and round-trips', (text) => {
    const state = syncState(text);
    const hash = encodeHash(state);
    expect(hash).toBe(`#${text}`);
    const r = route(hash);
    expect(r.version).toBe('short');
    const back = decodeState(r.state as string, 'short');
    expect(back?.parts).toEqual(state.parts);
    expect(encodeState(back as NonNullable<typeof back>)).toBe(encodeState(state));
  });

  test('with a listen and a tempo', () => {
    expect(encodeHash(syncState('(4,2x)(2x,4)', { listen: 'height' }))).toBe('#(4,2x)(2x,4)~height');
    expect(encodeHash(syncState('(4,2x)(2x,4)', { listen: 'pitch', bpm: 140 }))).toBe('#(4,2x)(2x,4)~pitch@140');
    expect(encodeHash(syncState('(4,2x)(2x,4)', { bpm: 90 }))).toBe('#(4,2x)(2x,4)@90');
    const back = decodeState('(4,2x)(2x,4)~height-drum@140', 'short');
    expect(back?.bpm).toBe(140);
    expect(back?.listen).toBe('height');
  });

  test('other drum machines or a phase write #v3.', () => {
    expect(encodeHash(syncState('(4,2x)(2x,4)', { kitShift: 2 })).startsWith('#v3.')).toBe(true);
    const s = syncState('(4,2x)(2x,4)');
    expect(encodeHash({ ...s, parts: withPhase(s.parts, 0, 1, 1) }).startsWith('#v3.')).toBe(true);
  });

  test('an old #v2. sync link still decodes', () => {
    const s = syncState('(4,2x)(2x,4)');
    const parts = json(encodeState(s)).p;
    const back = decodeState(b64({ p: parts, r: [1, 1], t: 104, m: 'height-drum' }), 2);
    expect(back?.parts).toEqual(s.parts);
    expect(isSyncSet(back!.parts)).toBe(true);
    expect(back?.listen).toBe('height');
  });

  test('percent-encoded forms decode through route', () => {
    expect(route('#%284%2C2x%29%282x%2C4%29%7Eheight-drum')).toEqual({ view: 'play', state: '(4,2x)(2x,4)~height-drum', version: 'short' });
    expect(route('#%284%2C2x%29%282x%2C4%29%7Epitch')).toEqual({ view: 'play', state: '(4,2x)(2x,4)~pitch', version: 'short' });
  });

  test('junk gives null, and a hash that is not even shaped like a link is no state', () => {
    for (const bad of ['(4,', '(4,2x', '(3,4)', '(4,4)*', '(4,4) (4,4)', '(4,4)~nope', '(', '()', '(4,4)'.repeat(60)]) {
      expect(decodeState(bad, 'short')).toBeNull();
    }
    expect(route('#(4,')).toEqual({ view: 'play', state: '(4,', version: 'short' });
    expect(route('#(4,$').state).toBeNull();
  });
});
