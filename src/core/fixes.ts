import { FIXES, MAX_PERIOD } from '../tunables';
import { judge } from './judge';
import { gcd, lcm } from './math';
import { cycleOf, isVanillaPair, textOf as writtenOf, vanillaDigits, vanillaPair } from './parts';
import type { Part, PartIndex, Parts } from './types';

/** Digits run 0-9 in the search (letters are typeable, but no fix reaches for them). */
const DIGITS = 10;

export interface FixLimits {
  readonly count: number;
  readonly budget: number;
}

/** One written throw: a digit and its destination part (null = its own part). */
interface Digit {
  readonly digit: number;
  readonly to: PartIndex | null;
}

/** One digit changed in place, at one position of one sequence. */
interface Sub {
  readonly to: Digit;
  /** How far the digit moves. */
  readonly cost: number;
  /** Tie-break at equal cost: raising before lowering, keeping the destination before changing it. */
  readonly order: number;
}

interface Position {
  readonly seq: number;
  readonly index: number;
}

/**
 * How the search sees the parts it may edit: sequences of digits, and how to put them back. A
 * vanilla pair is one sequence, its siteswap, whose crosses follow from the digits. Otherwise
 * every manual part of the group is one sequence in its own counting (digit = height / unit),
 * whose destinations may change too.
 */
interface Editable {
  readonly seqs: readonly (readonly Digit[])[];
  /** Destinations a digit at `seq` may take, its current one first; just null for a vanilla pair. */
  readonly targets: (seq: number, current: PartIndex | null) => (PartIndex | null)[];
  readonly rebuild: (seqs: readonly (readonly Digit[])[]) => Parts;
  /** Air time of the sequences in one cycle, as a fraction of the cycle: num / den balls. */
  readonly air: (seqs: readonly (readonly Digit[])[]) => { num: number; den: number };
}

function editable(parts: Parts, group: readonly PartIndex[]): Editable {
  if (isVanillaPair(parts) && group.includes(0) && group.includes(1)) {
    return {
      seqs: [vanillaDigits(parts).map((digit) => ({ digit, to: null }))],
      targets: () => [null],
      rebuild: (seqs) => vanillaPair((seqs[0] as Digit[]).map((d) => d.digit)),
      // The mean digit (MATH.md §2).
      air: (seqs) => addFrac({ num: 0, den: 1 }, { num: sum(seqs[0] as Digit[]), den: (seqs[0] as Digit[]).length }),
    };
  }
  const members = group.filter((p) => parts[p]?.flights.kind === 'manual');
  const own = (p: PartIndex) => parts[p] as Part;
  return {
    seqs: members.map((p) => {
      const { throws } = own(p).flights as { throws: readonly { height: number; to: PartIndex | null }[] };
      return throws.map((t) => ({ digit: t.height / own(p).unit, to: t.to }));
    }),
    targets: (seq, current) => {
      const self = members[seq] as PartIndex;
      const all = [null, ...parts.map((_, i) => i).filter((i) => i !== self)];
      return [current, ...all.filter((t) => t !== current)];
    },
    rebuild: (seqs) =>
      parts.map((p, i) => {
        const s = members.indexOf(i);
        if (s < 0) return p;
        const throws = (seqs[s] as Digit[]).map((d) => ({ height: d.digit * p.unit, to: d.to }));
        return { ...p, flights: { kind: 'manual' as const, throws } };
      }),
    // Each part's air per cycle over the cycle: Σ heights / (period × spacing), summed exactly.
    air: (seqs) =>
      seqs.reduce(
        (acc, seq, s) => {
          const p = own(members[s] as PartIndex);
          return addFrac(acc, { num: sum(seq) * p.unit, den: seq.length * p.spacing });
        },
        { num: 0, den: 1 },
      ),
  };
}

const sum = (seq: readonly Digit[]) => seq.reduce((n, d) => n + d.digit, 0);
function addFrac(a: { num: number; den: number }, b: { num: number; den: number }) {
  const den = lcm(a.den, b.den);
  const num = a.num * (den / a.den) + b.num * (den / b.den);
  const g = gcd(num, den) || 1;
  return { num: num / g, den: den / g };
}

/**
 * Design §6 "make it juggleable": up to `count` edits of the manual throws of `group` (a list of
 * parts, usually one cross group), each leaving every cross group that touches `group`
 * fault-free, nearest first by edit distance. None when those groups are already fault-free. No
 * swap: a swap keeps the set of landings, so it never repairs a collision (MATH.md §3).
 *
 * The search, in order, stopping at `count` fixes:
 * 1. One digit substituted: smallest change first, then the lowest position (lower part first),
 *    then raising over lowering, then keeping the destination over changing it (a cross that
 *    cannot land is often fixed by moving it; a vanilla pair's crosses follow from its digits).
 *    For a fractional ball count this order makes the first fix the one-digit change that makes
 *    the count whole: `12` → `22`.
 * 2. One digit deleted, lowest position first (never a sequence's last digit).
 * 3. One digit inserted, lowest position first, then lowest digit (never past MAX_PERIOD).
 * 4. Two digits substituted, smallest total change first, then positions, then as in 1.
 * Insertions and deletions are not combined at distance 2: it keeps the search small.
 *
 * `budget` bounds the work, not the number of candidates: a candidate whose ball count is whole
 * costs its cycle length in pulses (judging it walks every flight of the cycle), and one whose
 * count is fractional costs its digit count (it stops at the count). A candidate that would take
 * the work past `budget` is not judged: the search stops with what it has. Duplicates (an
 * insertion at two places giving one pattern, or `22` and `2`) are offered once.
 */
export function fixesFor(parts: Parts, group: readonly PartIndex[], limits: FixLimits = FIXES): Parts[] {
  return searchFixes(parts, group, limits).fixes;
}

/** One sequence of a fix as the search edited it: digits and destinations, at full length. */
export type FixDigits = readonly (readonly { readonly digit: number; readonly to: PartIndex | null }[])[];

/** True when every cross group touching `group` is fault-free. */
function fine(parts: Parts, group: readonly PartIndex[]): boolean {
  return judge(parts).groups.every((g) => g.faults.length === 0 || !g.parts.some((p) => group.includes(p)));
}

/**
 * `fixesFor`, with the work it spent (never more than `limits.budget`) and each fix's sequences
 * as edited (a vanilla pair's siteswap keeps its written length: `12` → `22`, not `2`).
 */
export function searchFixes(
  parts: Parts,
  group: readonly PartIndex[],
  limits: FixLimits = FIXES,
): { fixes: Parts[]; work: number; digits: FixDigits[] } {
  const found: Parts[] = [];
  const digits: FixDigits[] = [];
  let work = 0;
  if (fine(parts, group)) return { fixes: found, work, digits };
  const ed = editable(parts, group);
  const seqs = ed.seqs.map((s) => [...s]);

  const seen = new Set<string>([textOf(seqs)]);
  const patterns = new Set<string>();
  /** Judges one candidate, keeping it if it is new and juggleable. True when the search is over. */
  const offer = (candidate: Digit[][]): boolean => {
    // A fractional count is never juggleable: the count is all there is to check.
    const air = ed.air(candidate);
    const whole = air.den === 1;
    let text = '';
    let next: Parts = parts;
    if (whole) {
      text = textOf(candidate);
      if (seen.has(text)) return false;
      next = ed.rebuild(candidate);
    }
    const cost = whole ? cycleOf(next) : candidate.reduce((n, s) => n + s.length, 0);
    if (work + cost > limits.budget) return true;
    work += cost;
    if (!whole) return false;
    seen.add(text);
    // Two written sequences can be one pattern (`22` is the cascade `2`): offer it once.
    const key = next.map((p) => writtenOf(p, next)).join(' / ');
    if (fine(next, group) && !patterns.has(key)) {
      patterns.add(key);
      found.push(next);
      digits.push(candidate);
    }
    return found.length >= limits.count;
  };
  const edited = (edits: readonly (readonly [Position, Digit])[]) => {
    const out = seqs.map((s) => [...s]);
    for (const [p, d] of edits) (out[p.seq] as Digit[])[p.index] = d;
    return out;
  };

  const positions: Position[] = seqs.flatMap((s, seq) => s.map((_, index) => ({ seq, index })));
  const subs: Sub[][] = positions.map(({ seq, index }) => {
    const t = (seqs[seq] as Digit[])[index] as Digit;
    const out: Sub[] = [];
    for (let digit = 0; digit < DIGITS; digit++) {
      for (const to of ed.targets(seq, t.to)) {
        // A 0 is no throw, so it goes nowhere: `0x` is never offered.
        if ((digit === t.digit && to === t.to) || (digit === 0 && to !== null)) continue;
        const order = (digit > t.digit ? 0 : 2) + (to === t.to ? 0 : 1);
        out.push({ to: { digit, to }, cost: Math.abs(digit - t.digit), order });
      }
    }
    return out.sort((p, q) => p.cost - q.cost || p.order - q.order);
  });

  // 1. One substitution.
  const ones = positions
    .flatMap((p, i) => (subs[i] as Sub[]).map((s) => ({ p, i, s })))
    .sort((a, b) => a.s.cost - b.s.cost || a.i - b.i || a.s.order - b.s.order);
  for (const { p, s } of ones) if (offer(edited([[p, s.to]]))) return { fixes: found, work, digits };

  // 2. One deletion.
  for (const { seq, index } of positions) {
    const s = seqs[seq] as Digit[];
    if (s.length === 1) continue;
    const out = seqs.map((x) => [...x]);
    out[seq] = s.filter((_, i) => i !== index);
    if (offer(out)) return { fixes: found, work, digits };
  }

  // 3. One insertion: the new digit stays in its part first, then goes to each other part.
  for (let seq = 0; seq < seqs.length; seq++) {
    const s = seqs[seq] as Digit[];
    if (s.length >= MAX_PERIOD) continue;
    const targets = ed.targets(seq, null);
    for (let index = 0; index <= s.length; index++) {
      for (let digit = 0; digit < DIGITS; digit++) {
        for (const to of digit === 0 ? [null] : targets) {
          const out = seqs.map((x) => [...x]);
          out[seq] = [...s.slice(0, index), { digit, to }, ...s.slice(index)];
          if (offer(out)) return { fixes: found, work, digits };
        }
      }
    }
  }

  // 4. Two substitutions, by total cost.
  for (let total = 0; total <= 2 * (DIGITS - 1); total++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        for (const a of subs[i] as Sub[]) {
          if (a.cost > total) break;
          for (const b of subs[j] as Sub[]) {
            if (b.cost > total - a.cost) break;
            if (b.cost < total - a.cost) continue;
            const pi = positions[i] as Position;
            const pj = positions[j] as Position;
            if (offer(edited([[pi, a.to], [pj, b.to]]))) return { fixes: found, work, digits };
          }
        }
      }
    }
  }
  return { fixes: found, work, digits };
}

const textOf = (seqs: readonly (readonly Digit[])[]) =>
  seqs.map((s) => s.map((d) => `${d.digit}${d.to === null ? '' : `x${d.to}`}`).join(' ')).join(' / ');
