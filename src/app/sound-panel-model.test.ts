import { describe, expect, test } from 'vitest';
import { applyPreset, presetOf, withPartCount, type Mapping } from '../sound/mapping';
import { CROSS_BOOST_RANGE, DEFAULT_MAPPING, FILTER_HZ_RANGE, KIT_SAMPLES, PASS_BOOST_RANGE } from '../tunables';
import {
  applyEdit,
  downbeatChoices,
  ensureVoices,
  jugglerKits,
  kitRows,
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

  test('pan and gain are per part, and clamped', () => {
    const a = edit(m, { kind: 'pan', part: 1, value: 0.25 });
    expect(a.parts[1]).toEqual({ ...m.parts[1], pan: 0.25 });
    expect(a.parts[0]).toBe(m.parts[0]);
    expect(edit(m, { kind: 'pan', part: 0, value: -7 }).parts[0]?.pan).toBe(-1);
    expect(edit(m, { kind: 'gain', part: 0, value: 0.4 }).parts[0]?.gain).toBe(0.4);
    expect(edit(m, { kind: 'gain', part: 1, value: 9 }).parts[1]?.gain).toBe(1);
    expect(edit(m, { kind: 'gain', part: 1, value: Number.NaN })).toBe(m);
    expect(edit(m, { kind: 'pan', part: 1, value: Infinity })).toBe(m);
    expect(edit(m, { kind: 'pan', part: 2, value: 0.5 })).toBe(m);
  });

  test('a part’s sound is its own, and only a mapping that ignores height and ball hears it', () => {
    const hd = applyPreset('ball-pitch');
    const next = edit(hd, { kind: 'partSample', part: 1, sample: 'clave' });
    expect(next.parts[1]?.sample).toBe('clave');
    expect(next.parts[0]).toBe(hd.parts[0]);
    expect(next.byHeight).toBe(false);
    expect(next.byBall).toBeNull();
    expect(edit(m, { kind: 'partSample', part: 0, sample: null }).parts[0]?.sample).toBeNull();
    expect(edit(m, { kind: 'partSample', part: 0, sample: 'tuba' })).toBe(m);
    expect(edit(m, { kind: 'partSample', part: 5, sample: 'kick' })).toBe(m);
  });

  test('choosing a height’s sound makes the mapping read height', () => {
    const vpp = applyPreset('voice-per-part');
    expect(vpp.byHeight).toBe(false);
    expect(edit(vpp, { kind: 'height', height: 3, sample: 'cowbell' }).byHeight).toBe(true);
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
  expect(edit(m, { kind: 'preset', name: 'voice-per-part' })).toBe(m);
  const hd = applyPreset('height-drum');
  expect(edit(hd, { kind: 'height', height: 1, sample: hd.perHeight[1] as string })).toBe(hd);
  expect(edit(hd, { kind: 'partSample', part: 0, sample: hd.parts[0]?.sample as string })).not.toBe(hd);
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

describe('ensureVoices', () => {
  test('grows to the part count, never shrinks, and is the same object when nothing changes', () => {
    expect(ensureVoices(m, 3).parts).toHaveLength(3);
    expect(ensureVoices(m, 2)).toBe(m);
    expect(ensureVoices(m, 1)).toBe(m);
  });
});

describe('kit (v2 wave 1, ruling 2)', () => {
  const kits = (mapping: Mapping) => mapping.parts.map((v) => v.kit);

  test('the Kit select writes every part\'s kit, and nothing else; the preset keeps its name', () => {
    const three = withPartCount(applyPreset('height-drum'), 3);
    const lm2 = edit(three, { kind: 'kit', kit: 'LM-2' });
    expect(kits(lm2)).toEqual(['LM-2', 'LM-2', 'LM-2']);
    expect({ ...lm2, parts: lm2.parts.map((v) => ({ ...v, kit: 'TR-808' })) }).toEqual(three);
    expect(presetOf(lm2)).toBe('height-drum');
    const mixed: Mapping = { ...m, parts: [m.parts[0] as Mapping['parts'][0], { ...(m.parts[1] as Mapping['parts'][0]), kit: 'MFB-512' }] };
    expect(kits(edit(mixed, { kind: 'kit', kit: 'Casio-RZ1' }))).toEqual(['Casio-RZ1', 'Casio-RZ1']);
  });

  test('an unknown kit is refused; the same kit changes nothing', () => {
    expect(edit(m, { kind: 'kit', kit: 'nope' })).toBe(m);
    expect(edit(m, { kind: 'kit', kit: 'TR-808' })).toBe(m);
  });

  test('choosing a preset, or resetting to one, keeps the kit', () => {
    const lm2 = edit(edit(m, { kind: 'padOn', on: true }), { kind: 'kit', kit: 'LM-2' });
    const chosen = edit(lm2, { kind: 'preset', name: 'height-pitch' });
    expect(kits(chosen)).toEqual(['LM-2', 'LM-2']);
    expect(presetOf(chosen)).toBe('height-pitch');
    expect(kits(edit(lm2, { kind: 'preset', name: resetTarget(lm2, 'voice-per-part') }))).toEqual(['LM-2', 'LM-2']);
  });
});

describe('passing (wave 2, ruling 4)', () => {
  const four = withPartCount(m, 4);
  const kits = (mapping: Mapping) => mapping.parts.map((v) => v.kit);

  test('jugglerKit sets the kit of parts 2j and 2j + 1 and no other', () => {
    expect(kits(edit(four, { kind: 'jugglerKit', juggler: 1, kit: 'LM-2' }))).toEqual(['TR-808', 'TR-808', 'LM-2', 'LM-2']);
    expect(kits(edit(four, { kind: 'jugglerKit', juggler: 0, kit: 'LM-2' }))).toEqual(['LM-2', 'LM-2', 'TR-808', 'TR-808']);
  });

  test('with five voices juggler 2 owns only the last; a juggler past the voices, an unknown kit or a bad index is refused', () => {
    const five = withPartCount(m, 5);
    expect(kits(edit(five, { kind: 'jugglerKit', juggler: 2, kit: 'LM-2' }))).toEqual(['TR-808', 'TR-808', 'TR-808', 'TR-808', 'LM-2']);
    expect(edit(four, { kind: 'jugglerKit', juggler: 2, kit: 'LM-2' })).toBe(four);
    expect(edit(four, { kind: 'jugglerKit', juggler: -1, kit: 'LM-2' })).toBe(four);
    expect(edit(four, { kind: 'jugglerKit', juggler: 0.5, kit: 'LM-2' })).toBe(four);
    expect(edit(four, { kind: 'jugglerKit', juggler: 1, kit: 'nope' })).toBe(four);
  });

  test('passAccent clamps and rounds; passSample takes a kit sound or none and refuses others', () => {
    expect(edit(m, { kind: 'passAccent', velocity: 99 }).pass.velocity).toBe(PASS_BOOST_RANGE.max);
    expect(edit(m, { kind: 'passAccent', velocity: -5 }).pass.velocity).toBe(PASS_BOOST_RANGE.min);
    expect(edit(m, { kind: 'passAccent', velocity: 12.6 }).pass.velocity).toBe(13);
    expect(edit(m, { kind: 'passAccent', velocity: Number.NaN })).toBe(m);
    expect(edit(m, { kind: 'passSample', sample: 'cowbell' }).pass).toEqual({ velocity: m.pass.velocity, sample: 'cowbell' });
    expect(edit(edit(m, { kind: 'passSample', sample: 'cowbell' }), { kind: 'passSample', sample: null }).pass.sample).toBeNull();
    expect(edit(m, { kind: 'passSample', sample: 'kazoo' })).toBe(m);
    expect(presetOf(edit(m, { kind: 'passSample', sample: 'cowbell' }))).toBe('custom');
  });

  test('the Kit row is per juggler from three parts: juggler count and each juggler\'s kit', () => {
    expect(kitRows(1)).toBe(0);
    expect(kitRows(2)).toBe(0);
    expect(kitRows(3)).toBe(2);
    expect(kitRows(4)).toBe(2);
    expect(kitRows(6)).toBe(3);
    const mixed = edit(four, { kind: 'jugglerKit', juggler: 1, kit: 'LM-2' });
    expect(jugglerKits(mixed, 2)).toEqual(['TR-808', 'LM-2']);
    expect(jugglerKits(withPartCount(m, 3), 2)).toEqual(['TR-808', 'TR-808']);
  });
});
