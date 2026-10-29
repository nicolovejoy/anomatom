import { beatsOf, flightsOf } from './flights';
import { mod } from './math';
import { cycleOf, onsetsOf } from './parts';
import type { CrossGroup, Fault, Flight, PartIndex, Parts, ThrowId, Verdict } from './types';

/** Onset pulses of each part in one cycle, ascending. */
export function onsetPulses(parts: Parts, cycle: number): number[][] {
  return parts.map((part) => {
    const on = onsetsOf(part);
    const out: number[] = [];
    beatsOf(part, cycle, (_, pulse, index) => {
      if (on[index]) out.push(pulse);
    });
    return out;
  });
}

/** Parts joined by cross flights (design §5): each group ascending, groups by their first part. */
export function crossGroups(parts: Parts, flights: readonly Flight[] = flightsOf(parts)): PartIndex[][] {
  const root = parts.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : find(root[i] as number));
  for (const f of flights) if (f.cross) root[find(f.to)] = find(f.from);
  const groups = new Map<number, PartIndex[]>();
  parts.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  return [...groups.values()].sort((a, b) => (a[0] as number) - (b[0] as number));
}

/**
 * Balls carried by the parts of `group`: the flight time launched from them in one cycle over the
 * cycle (the average theorem, MATH.md §2). Whole for a fault-free group; may be fractional otherwise.
 */
export function ballCount(parts: Parts, group: readonly PartIndex[], flights: readonly Flight[] = flightsOf(parts)): number {
  const air = flights.filter((f) => group.includes(f.from)).reduce((s, f) => s + f.land - f.launch, 0);
  return air / cycleOf(parts);
}

/**
 * The two predicates of design §6 over all parts at once: every flight lands on an onset, and
 * every onset receives exactly one flight (flights go forward by construction: heights are
 * positive). There is no height ceiling. Faults: a flight landing alone where the catching part
 * has no onset (`no-onset`, with that part's next onset at or after it), two or more landing on
 * one pulse (`collision`, each group of throws reported once), an onset nothing lands on (`unfed`).
 * Each goes to the cross group of the catching part, which lists them by kind in that order (the
 * cause before the symptom), then by catching part, then in landing order.
 */
export function judge(parts: Parts): Verdict {
  const cycle = cycleOf(parts);
  const flights = flightsOf(parts);
  const onsets = onsetPulses(parts, cycle);
  // Per part: [no-onset, collision, unfed]. A group lists every part's first kind, then the next.
  const faults: Fault[][][] = parts.map(() => [[], [], []]);
  const seen = new Set<string>();

  parts.forEach((_, part) => {
    const mine = onsets[part] as number[];
    const isOnset = new Set(mine);
    const landings = new Map<number, Flight[]>();
    for (const f of flights) {
      if (f.to !== part) continue;
      const pulse = mod(f.land, cycle);
      landings.set(pulse, [...(landings.get(pulse) ?? []), f]);
    }
    const noOnset: Fault[] = [];
    const collisions: Fault[] = [];
    for (const [pulse, group] of landings) {
      if (group.length === 1) {
        if (isOnset.has(pulse)) continue;
        const f = group[0] as Flight;
        noOnset.push({ kind: 'no-onset', from: f.id, part, pulse: f.land, nearestOnset: nextOnset(mine, f.land, cycle) });
        continue;
      }
      const throws = group.map((f) => f.id).sort(byId);
      const key = throws.map((t) => `${t.part}:${t.index}`).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      collisions.push({ kind: 'collision', part, pulse, throws });
    }
    const unfed: Fault[] = mine.filter((p) => !landings.has(p)).map((pulse) => ({ kind: 'unfed', part, pulse }));
    faults[part] = [noOnset, collisions, unfed];
  });

  const groups: CrossGroup[] = crossGroups(parts, flights).map((g) => {
    const gf = [0, 1, 2].flatMap((kind) => g.flatMap((p) => (faults[p] as Fault[][])[kind] as Fault[]));
    return { parts: g, faults: gf, balls: gf.length === 0 ? ballCount(parts, g, flights) : null };
  });
  return { groups, ok: groups.every((g) => g.faults.length === 0) };
}

const byId = (p: ThrowId, q: ThrowId) => p.part - q.part || p.index - q.index;

/** The first onset at or after `pulse` (unwrapped), or `pulse` itself when the part has none. */
function nextOnset(onsets: readonly number[], pulse: number, cycle: number): number {
  if (onsets.length === 0) return pulse;
  const r = mod(pulse, cycle);
  const after = onsets.find((o) => o >= r) ?? (onsets[0] as number) + cycle;
  return pulse - r + after;
}
