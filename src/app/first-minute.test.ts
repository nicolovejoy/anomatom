import { describe, expect, test } from 'vitest';
import { applyPreset } from '../sound/mapping';
import { lineParts, typed, vanillaParts } from '../test/schedules';
import { FIRST_MINUTE_PRESETS } from '../tunables';
import { reduce } from './actions';
import { cardPattern, playingPreset, presetParts, presetPatch, scheduleFor, showsFirstMinute } from './first-minute';
import { analyse } from './knobs-model';
import { defaultState } from './state';

/** The state after tapping a card. */
const tapped = (id: string) => reduce(defaultState(), presetPatch(preset(id)));

const preset = (id: string) => FIRST_MINUTE_PRESETS.find((p) => p.id === id)!;

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
  test('every card is a juggleable pattern', () => {
    for (const p of FIRST_MINUTE_PRESETS) expect(analyse(tapped(p.id)).balls, p.id).not.toBeNull();
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
    for (const p of FIRST_MINUTE_PRESETS) expect(tapped(p.id).mapping, p.id).toBe(applyPreset('height-drum'));
  });
  test('a patch is a copy: the shared preset is never handed out; the parts are made once', () => {
    const patch = presetPatch(preset('pause'));
    expect(patch.type === 'loadPreset' && patch.ratio).not.toBe(preset('pause').ratio);
    expect(patch).toMatchObject({ parts: vanillaParts('441'), ratio: { a: 1, b: 1 } });
    expect(presetParts(preset('pause'))).toBe(presetParts(preset('pause')));
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
