// Everything derived from the stored state, in one memoised selector (docs/plans/model-rethink.md
// §12a): computed once per state, keyed on the state's identity, and read by every mount. Pure.
// The values depend on the parts alone, so a change to anything else (tempo, volume, a tab)
// reuses them.
import { ballCount, buildSchedule, isPassingSet, isVanillaPair, passingText, searchFixes, textOf } from '../core';
import type { CrossGroup, Part, Parts, Schedule } from '../core';
import type { AppState } from './state';

export interface Derived {
  /** The one Schedule: events for every onset, ball ids for fault-free groups, and the verdict. */
  readonly schedule: Schedule;
  /** Each part as written (`textOf`); a vanilla pair is one text, its siteswap, and a passing set one, its passing siteswap. */
  readonly texts: readonly string[];
  /** The cross groups with their faults and ball counts (`schedule.verdict.groups`). */
  readonly groups: readonly CrossGroup[];
  /** "Make it juggleable" (design §6): the nearest juggleable edits of the faulted groups. Worked out on first read. */
  readonly fixes: readonly Parts[];
  /**
   * Each fix as the inputs would show it, one text per part, or one for a vanilla pair, at the
   * length it was written (`12` → `22`, which as parts is the cascade `2`). Worked out with `fixes`.
   */
  readonly fixTexts: readonly (readonly string[])[];
  /** The digit editor's message (MATH.md §9.4): the non-whole mean of a faulted manual group's digits, else null. */
  readonly fractional: number | null;
}

const byState = new WeakMap<AppState, Derived>();
const byParts = new WeakMap<Parts, Derived>();

export function derived(state: AppState): Derived {
  const known = byState.get(state);
  if (known) return known;
  const d = byParts.get(state.parts) ?? compute(state.parts);
  byParts.set(state.parts, d);
  byState.set(state, d);
  return d;
}

function compute(parts: Parts): Derived {
  const schedule = buildSchedule(parts);
  const groups = schedule.verdict.groups;
  const texts = isVanillaPair(parts) || isPassingSet(parts) ? [textOf(parts[0] as Part, parts)] : parts.map((p) => textOf(p, parts));
  let fixes: { fixes: Parts[]; texts: string[][] } | null = null;
  const fixed = () => (fixes ??= fixesOf(parts, groups));
  return {
    schedule,
    texts,
    groups,
    fractional: fractionalOf(parts, groups),
    get fixes() {
      return fixed().fixes;
    },
    get fixTexts() {
      return fixed().texts;
    },
  };
}

function fractionalOf(parts: Parts, groups: readonly CrossGroup[]): number | null {
  for (const g of groups) {
    if (g.faults.length === 0 || !g.parts.some((i) => parts[i]?.flights.kind === 'manual')) continue;
    const balls = ballCount(parts, g.parts);
    if (!Number.isInteger(balls)) return balls;
  }
  return null;
}

function fixesOf(parts: Parts, groups: readonly CrossGroup[]): { fixes: Parts[]; texts: string[][] } {
  const faulted = groups.filter((g) => g.faults.length > 0).flatMap((g) => g.parts);
  if (faulted.length === 0) return { fixes: [], texts: [] };
  const { fixes, digits } = searchFixes(parts, faulted);
  const vanilla = isVanillaPair(parts);
  const texts = fixes.map((fix, i) =>
    vanilla
      ? [((digits[i] as (typeof digits)[number])[0] ?? []).map((d) => String(d.digit)).join('')]
      : isPassingSet(fix)
        ? [passingText(fix)]
        : fix.map((p) => textOf(p, fix)),
  );
  return { fixes, texts };
}
