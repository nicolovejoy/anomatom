import { describe, expect, test } from 'vitest';
import { applyPreset } from '../sound/mapping';
import { lineParts, typed, vanillaParts } from '../test/schedules';
import { reduce } from './actions';
import { cardLines, cardPattern, cardsShown, moreCount, playingPreset, presetPatch, scheduleFor, showsFirstMinute } from './first-minute';
import { PRESETS } from './presets';
import { analyse } from './knobs-model';
import { defaultState } from './state';

/** The state after tapping a card. */
const tapped = (id: string) => reduce(defaultState(), presetPatch(preset(id)));

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;

describe('showsFirstMinute', () => {
  test('shows on an empty hash and a bare #', () => {
    expect(showsFirstMinute('')).toBe(true);
    expect(showsFirstMinute('#')).toBe(true);
  });
  test('skips About, shared state and any other hash', () => {
    expect(showsFirstMinute('#about')).toBe(false);
    expect(showsFirstMinute('#v1.e30')).toBe(false);
    expect(showsFirstMinute('#garbage')).toBe(false);
  });
});

describe('presets', () => {
  test('every juggling card is a juggleable pattern', () => {
    for (const p of PRESETS.filter((q) => q.kind === 'juggling')) expect(analyse(tapped(p.id)).balls, p.id).not.toBeNull();
  });
  test('the polyrhythm card is the canonical two-hand pattern at 3:2, with its mapping preset', () => {
    expect(presetPatch(preset('polyrhythm'))).toEqual({
      type: 'loadPreset',
      parts: lineParts(['2 2x 2', '2x 2'], { a: 3, b: 2 }),
      ratio: { a: 3, b: 2 },
      mapping: applyPreset('height-drum'),
    });
    expect(cardPattern(preset('polyrhythm'))).toBe('2 2x 2 / 2x 2');
    expect(cardPattern(preset('pause'))).toBe('441');
  });
  test('the juggling cards play height to drum (design §7), whatever the default', () => {
    for (const p of PRESETS.filter((q) => q.kind === 'juggling')) expect(tapped(p.id).mapping, p.id).toBe(applyPreset('height-drum'));
  });
  test('a juggling card leaves the reader’s tempo alone', () => {
    const s = reduce({ ...defaultState(), bpm: 77 }, presetPatch(preset('classic')));
    expect(s.bpm).toBe(77);
    expect(presetPatch(preset('classic'))).not.toHaveProperty('bpm');
  });
  test('a sourcebook card loads its parts, ratio, tempo and its own voices', () => {
    const s = tapped('clapping');
    expect(s.parts).toBe(preset('clapping').parts);
    expect(s.bpm).toBe(160);
    expect(s.mapping.byHeight).toBe(false);
    expect(s.mapping.parts.map((v) => v.sample)).toEqual(['clap', 'clap']);
    expect(scheduleFor(s).events.length).toBeGreaterThan(0);
  });
  test('a patch is a copy of the ratio; the parts are made once', () => {
    const patch = presetPatch(preset('pause'));
    expect(patch.type === 'loadPreset' && patch.ratio).not.toBe(preset('pause').ratio);
    expect(patch).toMatchObject({ parts: vanillaParts('441'), ratio: { a: 1, b: 1 } });
    expect(presetPatch(preset('pause'))).toMatchObject({ parts: preset('pause').parts });
  });
});

describe('the cards on show', () => {
  test('the default set is the five juggling cards and the sourcebook’s first four', () => {
    expect(cardsShown(false).map((p) => p.id)).toEqual([
      'cascade', 'pause', 'classic', 'ramp', 'polyrhythm', 'bell', 'son-clave', 'clapping', 'afrobeat',
    ]);
  });
  test('“more” shows every card, and says how many it adds', () => {
    expect(cardsShown(true)).toBe(PRESETS);
    expect(moreCount()).toBe(PRESETS.length - 9);
  });
  test('a juggling card draws its text, a sourcebook card a hit grid per hand', () => {
    expect(cardLines(preset('classic'))).toEqual(['531']);
    expect(cardLines(preset('hocket'))).toEqual(['x.', '.x']);
  });
});

describe('playingPreset', () => {
  test('names the card the store holds, only while playing', () => {
    const s = tapped('pause');
    expect(playingPreset(s, true)).toBe('pause');
    expect(playingPreset(s, false)).toBeNull();
  });
  test('the same pattern typed matches; at 3:2 both hands count', () => {
    expect(playingPreset(typed(['531']), true)).toBe('classic');
    const poly = tapped('polyrhythm');
    expect(playingPreset(poly, true)).toBe('polyrhythm');
    expect(playingPreset(reduce(poly, { type: 'editDraft', part: 1, text: '2' }), true)).toBeNull();
  });
  test('a sourcebook card matches its parts, not a lookalike with another phase', () => {
    const clap = tapped('clapping');
    expect(playingPreset(clap, true)).toBe('clapping');
    expect(playingPreset({ ...clap, parts: [clap.parts[0]!, { ...clap.parts[1]!, phase: 0 }] }, true)).toBeNull();
  });
  test('a pattern of the reader’s own matches no card', () => {
    expect(playingPreset(typed(['4']), true)).toBeNull();
    expect(playingPreset({ ...defaultState(), ratio: { a: 4, b: 3 } }, true)).toBeNull();
  });
});

describe('scheduleFor', () => {
  test('is the derived schedule: there is one even for a pattern I cannot juggle', () => {
    const poly = tapped('polyrhythm');
    expect(scheduleFor(poly).balls).toBe(4);
    const broken = typed(['432']);
    expect(scheduleFor(broken).verdict.ok).toBe(false);
    expect(scheduleFor(broken).events.length).toBeGreaterThan(0);
  });
});
