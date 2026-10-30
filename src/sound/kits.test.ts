// Samples are roles (v2 wave 1, ruling 1): every kit plays every TR-808 role on a sample of its own.
import { describe, expect, test } from 'vitest';
import { buildSchedule, partsFromLines } from '../core';
import { DEFAULT_MAPPING, KIT_IDS, KIT_ROLES, KIT_SAMPLES } from '../tunables';
import { copy } from '../ui/copy';
import { kitSample } from './drum-machine';
import kitFiles from './fixtures/kit-samples.json';
import { applyPreset, hitFor, withPartCount, type Mapping } from './mapping';

describe('KIT_ROLES', () => {
  test('one table per shipped kit, and each kit has a name to show', () => {
    expect(Object.keys(KIT_ROLES).sort()).toEqual([...KIT_IDS].sort());
    expect(Object.keys(copy.kitNames).sort()).toEqual([...KIT_IDS].sort());
    expect(KIT_IDS[0]).toBe(DEFAULT_MAPPING.parts[0]?.kit);
  });

  test('every kit covers every role, and only the roles', () => {
    for (const kit of KIT_IDS) {
      const table = KIT_ROLES[kit] as Record<string, string>;
      expect(Object.keys(table).sort()).toEqual([...KIT_SAMPLES].sort());
      for (const role of KIT_SAMPLES) expect(typeof table[role] === 'string' && table[role] !== '').toBe(true);
    }
  });

  test('every role plays a sample the kit has (its dm.json, kept in fixtures/kit-samples.json)', () => {
    const files = kitFiles as unknown as Record<string, string[]>;
    for (const kit of KIT_IDS) {
      const samples = files[kit] as string[];
      expect(samples.length).toBeGreaterThan(0);
      for (const sample of Object.values(KIT_ROLES[kit] as Record<string, string>)) expect(samples).toContain(sample);
    }
  });

  test('the TR-808 is the vocabulary: each role is its own sample', () => {
    for (const role of KIT_SAMPLES) expect(kitSample('TR-808', role)).toBe(role);
  });

  test('kitSample: a kit or role the tables do not know passes the name through', () => {
    expect(kitSample('LM-2', 'kick')).toBe('kick');
    expect(kitSample('LM-2', 'snare')).toBe('snare-m');
    expect(kitSample('LM-2', 'unknown')).toBe('unknown');
    expect(kitSample('nope', 'snare')).toBe('snare');
  });
});

test('a three-part mapping plays on a second kit: hitFor names the role, the kit picks its sample', () => {
  // A three-part link: three lines at 1:1, voice per part (kick, snare, hi-hat), every part on the LM-2.
  const r = partsFromLines(['3', '2', '4'], { a: 1, b: 1 });
  if (!r.ok) throw new Error('parts');
  const schedule = buildSchedule(r.parts);
  const lm2 = (m: Mapping): Mapping => ({ ...m, parts: m.parts.map((v) => ({ ...v, kit: 'LM-2' })) });
  const mapping = lm2(withPartCount(applyPreset('voice-per-part'), 3));
  const event = (part: number) => schedule.events.find((e) => e.part === part && e.kind === 'throw' && e.height > 0);
  const played = [0, 1, 2].map((part) => {
    const hit = hitFor(event(part) as NonNullable<ReturnType<typeof event>>, mapping, schedule);
    const kit = mapping.parts[part]?.kit as string;
    return hit && [hit.sample, kitSample(kit, hit.sample)];
  });
  expect(played).toEqual([
    ['kick', 'kick'],
    ['snare', 'snare-m'],
    ['hihat-close', 'hhclosed'],
  ]);
});
