import { describe, expect, test } from 'vitest';
import { typed } from '../test/schedules';
import { partColour } from '../view/colours';
import { reduce } from './actions';
import { drummerRows } from './sound-panel-model';
import { defaultState } from './state';

describe('drummerRows (v5 ruling 3)', () => {
  test('one juggler: one row, on the TR-808, no stage colour (the stage tints from three hands)', () => {
    expect(drummerRows(defaultState())).toEqual([{ juggler: 0, label: 'Juggler 1', kit: 'TR-808', kitName: 'Roland TR-808', colour: null }]);
  });

  test('a passing pattern: two jugglers, two kits, each in its stage colour', () => {
    const s = typed(['<3p 3|3p 3>']);
    expect(drummerRows(s).map((r) => [r.label, r.kit, r.colour])).toEqual([
      ['Juggler 1', 'TR-808', partColour(0)],
      ['Juggler 2', 'LM-2', partColour(2)],
    ]);
  });

  test('Change drum machines moves every juggler on; a kit shows by its name', () => {
    const s = reduce(typed(['<3p 3|3p 3>']), { type: 'nextKits' });
    expect(drummerRows(s).map((r) => r.kitName)).toEqual(['LinnDrum LM-2', 'MFB-512']);
    const last = { ...s, kitShift: 4 };
    expect(drummerRows(last).map((r) => r.kit)).toEqual(['Casio-RZ1', 'TR-808']);
  });

  test('three hands: two jugglers, the second one-handed', () => {
    const three = { ...defaultState(), parts: [...defaultState().parts, defaultState().parts[0]!] };
    expect(drummerRows(three).map((r) => r.juggler)).toEqual([0, 1]);
  });
});
