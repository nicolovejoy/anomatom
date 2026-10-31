import { describe, expect, test } from 'vitest';
import { applyPreset } from '../sound/mapping';
import { lineParts, typed, vanillaParts } from '../test/schedules';
import { reduce } from './actions';
import { cardGroups, cardPattern, playingPreset, presetPatch, scheduleFor, showsFirstMinute } from './first-minute';
import { judge } from '../core';
import { PRESETS } from './presets';
import { analyse } from './knobs-model';
import { defaultState } from './state';
import { copy } from '../ui/copy';

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
    for (const p of PRESETS) expect(analyse(tapped(p.id)).balls, p.id).not.toBeNull();
  });
  test('tapping the passing card gives four parts, six balls and a kit for each juggler', () => {
    const s = tapped('passing');
    expect(s.parts).toHaveLength(4);
    expect(analyse(s).balls).toBe(6);
    expect(s.mapping.parts.map((v) => v.kit)).toEqual(['TR-808', 'TR-808', 'LM-2', 'LM-2']);
    expect(analyse(s).inputs).toEqual(['<3p 3|3p 3>']);
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
    for (const p of PRESETS.filter((q) => q.parts.length === 2)) expect(tapped(p.id).mapping, p.id).toBe(applyPreset('height-drum'));
  });
  test('a juggling card leaves the reader’s tempo alone', () => {
    const s = reduce({ ...defaultState(), bpm: 77 }, presetPatch(preset('classic')));
    expect(s.bpm).toBe(77);
    expect(presetPatch(preset('classic'))).not.toHaveProperty('bpm');
  });
  test('a patch is a copy of the ratio; the parts are made once', () => {
    const patch = presetPatch(preset('pause'));
    expect(patch.type === 'loadPreset' && patch.ratio).not.toBe(preset('pause').ratio);
    expect(patch).toMatchObject({ parts: vanillaParts('441'), ratio: { a: 1, b: 1 } });
    expect(presetPatch(preset('pause'))).toMatchObject({ parts: preset('pause').parts });
  });
});

describe('cardGroups', () => {
  const groups = cardGroups();
  test('are 3, 4, 5 balls and passing, in screen order', () => {
    expect(groups.map((g) => g.id)).toEqual(['3', '4', '5', 'passing']);
  });
  test('hold every preset exactly once', () => {
    const ids = groups.flatMap((g) => g.presets.map((p) => p.id));
    expect(ids).toHaveLength(PRESETS.length);
    expect(new Set(ids)).toEqual(new Set(PRESETS.map((p) => p.id)));
  });
  test('the 3:2 card is in 4 balls', () => {
    expect(groups.find((g) => g.id === '4')!.presets.map((p) => p.id)).toContain('polyrhythm');
  });
  test('every card’s parts are juggleable with the ball count its group states', () => {
    for (const g of groups.filter((x) => x.id !== 'passing')) {
      for (const p of g.presets) {
        expect(judge(p.parts).ok, p.id).toBe(true);
        expect(scheduleFor(tapped(p.id)).balls, p.id).toBe(Number(g.id));
      }
    }
  });
  test('every group has a heading and cards', () => {
    for (const g of groups) {
      expect(copy.firstMinute.groups[g.id], g.id).toBeTruthy();
      expect(g.presets.length, g.id).toBeGreaterThan(0);
    }
  });
  test('a card draws its pattern text', () => {
    expect(cardPattern(preset('passing'))).toBe('<3p 3|3p 3>');
    expect(cardPattern(preset('three-count'))).toBe('<3p 3 3|3p 3 3>');
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
  test('the passing card matches by its parts and when <3p 3|3p 3> is typed', () => {
    expect(playingPreset(tapped('passing'), true)).toBe('passing');
    const typedIn = reduce(defaultState(), { type: 'editDraft', part: 0, text: '<3p3|3p3>' });
    expect(playingPreset(typedIn, true)).toBe('passing');
    expect(playingPreset(reduce(typedIn, { type: 'editDraft', part: 0, text: '<4p 3|3 4p>' }), true)).toBeNull();
  });
  test('a pattern of the reader’s own matches no card', () => {
    expect(playingPreset(typed(['66']), true)).toBeNull();
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
