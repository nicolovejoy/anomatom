// Every transition with a rule (docs/plans/model-rethink.md §5, §12a; MATH.md §9.5-9.6), as one
// pure function: `reduce(state, action)`. Mounts dispatch actions; the rules live here and
// nowhere else. Pure: no DOM, no timers.
//
// - Every action clears `notice` first; only a reset sets it again.
// - Editing a draft parses it and edits flights, never grids (see `parseDraft`). At 1:1 the one
//   input is vanilla siteswap over two parts, or form 2 (`a / b`) when it holds a `/` (or the
//   state has one part); at other ratios each input is one hand in one-hand counting. A parse that
//   fails keeps the draft and leaves the parts alone; one that succeeds writes manual throws for
//   the edited part's cross group (a default part an `x` now lands in becomes manual with the
//   throws its default rule had).
// - A manual group (one with any manual part) has no ball knob: setK is ignored on it. A change
//   to its onsets (toggleOnset, generate, or setPhase on a group of several parts, whose crosses
//   would move) drops its manual flights and re-derives every part of it by the default rule at
//   k = 1, with a one-line notice. resetGroup does the same on request, without one.
// - setRatio rescales the spacings; parts keep their digits and onsets. A manual group where a
//   cross can no longer land on an onset is reset, with a notice; any other group is kept.
// - Lanes (docs/plans/lanes.md): addLane appends a default part on the last part's rate and
//   steps; removeLane drops a part, resetting with a notice the rest of a cross group it was in;
//   setRate rescales the spacings as setRatio does, for N parts; setSteps pads a part's period
//   with rests or drops its tail, an onset change like any other.
// - `ratio` follows the parts (ruling 2 of docs/plans/lanes.md): after every action it reduces to
//   `ratioOf(parts)`. It stays stored only because the ratio steppers show it unreduced (2:2 is
//   not the 1:1 chip); setRatio is the one action that sets it, and only over two parts.
// - Every action that changes how many parts there are gives the mapping that many voices.
import {
  crossGroups,
  cycleOf,
  euclid,
  gcd,
  isVanillaPair,
  judge,
  lcm,
  mod,
  normalise,
  onsetsOf,
  parseThrows,
  partsFromVanilla,
  periodOf,
  ratesOf,
  ratioOf,
  ratioSpacings,
  swapSites as swapThrows,
  throwsOf,
  vanillaDigits,
  vanillaPair,
  withPhase,
} from '../core';
import type { ParseError, Part, PartIndex, Parts, Ratio, Throw } from '../core';
import { withPartCount, type Mapping } from '../sound/mapping';
import {
  BPM_RANGE,
  MAX_EDITOR_PARTS,
  MAX_LANES,
  MAX_LINK_CYCLE,
  MAX_PERIOD,
  MAX_PHASE_REFINEMENT,
  MAX_RATE,
  MAX_RATIO,
} from '../tunables';
import { copy } from '../ui/copy';
import type { AppState } from './state';

export type Action =
  | { type: 'toggleOnset'; part: PartIndex; beat: number }
  | { type: 'setK'; part: PartIndex; k: number }
  | { type: 'setPhase'; part: PartIndex; phase: number }
  | { type: 'editDraft'; part: PartIndex; text: string }
  | { type: 'resetGroup'; part: PartIndex }
  | { type: 'setRatio'; ratio: Ratio }
  | { type: 'setBpm'; bpm: number }
  | { type: 'loadPreset'; parts: Parts; ratio: Ratio; bpm?: number; mapping?: Mapping }
  | { type: 'generate'; part: PartIndex; hits: number }
  | { type: 'swapSites'; part: PartIndex; i: number; j: number }
  | { type: 'addLane' }
  | { type: 'removeLane'; part: PartIndex }
  /** Rescales the spacings on the lattice so part `part` plays `rate` beats to a rate-1 part's one; normalised after. */
  | { type: 'setRate'; part: PartIndex; rate: number }
  /** The part's period in beats: pads with rests or drops the tail. */
  | { type: 'setSteps'; part: PartIndex; steps: number };

/** Hands at the same rate: 1:1 (or 2:2 from the steppers). */
export const oneInput = (ratio: Ratio): boolean => ratio.a === ratio.b;

/**
 * Whether the editor has one input per part, in one-hand counting: at any ratio but 1:1, and
 * with more parts than one input writes (MAX_EDITOR_PARTS; ruling 3 of docs/plans/lanes.md).
 * Otherwise one input holds the whole pattern (vanilla, or `a / b`).
 */
export const inputPerPart = (state: Pick<AppState, 'parts' | 'ratio'>): boolean =>
  !oneInput(state.ratio) || state.parts.length > MAX_EDITOR_PARTS;

export type DraftResult = { readonly ok: true; readonly parts: Parts } | { readonly ok: false; readonly error: ParseError };

/**
 * What `editDraft` would make of `text` typed in input `part`: the whole new parts, or the parse
 * error. A draft edits flights, never grids (ruling 2026-10-29): the parts it names keep their
 * spacing, phase and unit, so a refined lattice stays refined; a part the text adds comes in at
 * phase 0 on the last part's spacing, and a part it drops is removed. Only a vanilla pair's grids
 * belong to its notation: vanilla text lays out its own, and `a / b` typed over a vanilla pair
 * starts from spacing 1, phase 0, unit 1. The editor writes at most MAX_EDITOR_PARTS parts.
 */
export function parseDraft(state: Pick<AppState, 'parts' | 'ratio'>, part: PartIndex, text: string): DraftResult {
  if (!inputPerPart(state)) {
    // A single string is vanilla over two parts; over one part it is that part's line.
    if (!text.includes('/') && state.parts.length === 2) {
      const r = partsFromVanilla(text);
      return r.ok ? r : { ok: false, error: r.error };
    }
    const r = parseThrows(text);
    if (!r.ok) return r;
    if (r.parts > MAX_EDITOR_PARTS) return { ok: false, error: { kind: 'too-many-parts', max: MAX_EDITOR_PARTS } };
    const base: Parts = isVanillaPair(state.parts) ? [] : state.parts;
    const spacing = base[base.length - 1]?.spacing ?? 1;
    const grid = (i: number) => base[i] ?? { spacing, phase: 0, unit: spacing };
    return {
      ok: true,
      parts: r.throws.map((line, i): Part => {
        const { spacing: s, phase, unit } = grid(i);
        return { spacing: s, phase, unit, flights: { kind: 'manual', throws: line.map((t) => ({ height: t.height * unit, to: t.to })) } };
      }),
    };
  }
  const slash = text.indexOf('/');
  if (slash >= 0) return { ok: false, error: { kind: 'bad-char', index: slash } };
  const own = state.parts[part] as Part;
  const r = parseThrows(text, { part, of: state.parts.length });
  if (!r.ok) return r;
  const throws = (r.throws[0] as Throw[]).map((t) => ({ height: t.height * own.unit, to: t.to }));
  const edited = state.parts.map((p, i) => (i === part ? manualPart(p, throws) : p));
  const group = groupOf(edited, part);
  return {
    ok: true,
    parts: edited.map((p, i) => (group.includes(i) && p.flights.kind === 'default' ? manualPart(p, throwsOf(p)) : p)),
  };
}

export function reduce(state: AppState, action: Action): AppState {
  const next = step(state.notice === null ? state : { ...state, notice: null }, action);
  if (next.parts === state.parts) return next;
  // The ratio follows the parts, and the mapping has a voice per part.
  const r = ratioOf(next.parts);
  const ratio = next.ratio.a * r.b === next.ratio.b * r.a ? next.ratio : r;
  const mapping = next.parts.length === state.parts.length ? next.mapping : withPartCount(next.mapping, next.parts.length);
  return ratio === next.ratio && mapping === next.mapping ? next : { ...next, ratio, mapping };
}

function step(s: AppState, action: Action): AppState {
  switch (action.type) {
    case 'editDraft':
      return editDraft(s, action.part, action.text);
    case 'toggleOnset': {
      const p = s.parts[action.part];
      if (p === undefined || action.beat < 0 || action.beat >= periodOf(p)) return s;
      return changeOnsets(
        s,
        action.part,
        onsetsOf(p).map((on, beat) => (beat === action.beat ? !on : on)),
      );
    }
    case 'generate': {
      const p = s.parts[action.part];
      if (p === undefined) return s;
      return changeOnsets(s, action.part, euclid(Math.round(action.hits), periodOf(p)));
    }
    case 'setK':
      return setK(s, action.part, action.k);
    case 'setPhase':
      return setPhase(s, action.part, action.phase);
    case 'resetGroup': {
      if (s.parts[action.part] === undefined) return s;
      const group = groupOf(s.parts, action.part);
      if (group.every((i) => isDefaultAt1(s.parts[i] as Part))) return s;
      return withParts(s, normalise(resetParts(s.parts, group)));
    }
    case 'setRatio':
      return setRatio(s, action.ratio);
    case 'setBpm': {
      if (!Number.isFinite(action.bpm)) return s;
      const bpm = Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, Math.round(action.bpm)));
      return bpm === s.bpm ? s : { ...s, bpm };
    }
    case 'loadPreset':
      return {
        ...s,
        parts: action.parts,
        drafts: action.parts.map(() => null),
        ratio: action.ratio,
        bpm: action.bpm ?? s.bpm,
        mapping: action.mapping ?? s.mapping,
      };
    case 'swapSites':
      return swapSites(s, action.part, action.i, action.j);
    case 'addLane':
      return addLane(s);
    case 'removeLane':
      return removeLane(s, action.part);
    case 'setRate':
      return setRate(s, action.part, action.rate);
    case 'setSteps':
      return setSteps(s, action.part, action.steps);
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const manualPart = (p: Part, throws: readonly Throw[]): Part => ({ ...p, flights: { kind: 'manual', throws } });

/** A part made default by the rule: its onsets at k balls, unit = spacing (one-hand counting). */
const defaultPart = (p: Part, onsets: readonly boolean[], k = 1): Part => ({
  spacing: p.spacing,
  phase: p.phase,
  unit: p.spacing,
  flights: { kind: 'default', onsets: [...onsets], k },
});

const isDefaultAt1 = (p: Part) => p.flights.kind === 'default' && p.flights.k === 1 && p.unit === p.spacing;

/** The cross group holding `part` (design §5). */
export function groupOf(parts: Parts, part: PartIndex): PartIndex[] {
  return crossGroups(parts).find((g) => g.includes(part)) as PartIndex[];
}

/** A group is manual when any of its parts is. */
export const isManualGroup = (parts: Parts, group: readonly PartIndex[]): boolean =>
  group.some((i) => parts[i]?.flights.kind === 'manual');

/** Every part of `group` re-derived by the default rule at k = 1 on its onsets (or the ones given). Not normalised. */
function resetParts(parts: Parts, group: readonly PartIndex[], onsets: (i: PartIndex) => readonly boolean[] = (i) => onsetsOf(parts[i] as Part)): Parts {
  return parts.map((p, i) => (group.includes(i) ? defaultPart(p, onsets(i)) : p));
}

/** New parts from an action: every input shows its part's text again. */
const withParts = (s: AppState, parts: Parts, notice: string | null = null): AppState => ({
  ...s,
  parts,
  drafts: parts.map(() => null),
  notice,
});

function editDraft(s: AppState, part: PartIndex, text: string): AppState {
  const one = !inputPerPart(s);
  if (part < 0 || (one ? part !== 0 : part >= s.parts.length)) return s;
  const r = parseDraft(s, part, text);
  if (!r.ok) return { ...s, drafts: s.parts.map((_, i) => (i === part ? text : (s.drafts[i] ?? null))) };
  // At 1:1 the one draft stands for every part; otherwise the other inputs keep what they hold.
  const drafts = r.parts.map((_, i) => (i === part ? text : one ? null : (s.drafts[i] ?? null)));
  return { ...s, parts: r.parts, drafts };
}

/** Part `part`'s onsets become `onsets` (design §5): a manual group is reset with a notice, a default part keeps its k. */
function changeOnsets(s: AppState, part: PartIndex, onsets: readonly boolean[]): AppState {
  const group = groupOf(s.parts, part);
  if (isManualGroup(s.parts, group)) {
    const parts = resetParts(s.parts, group, (i) => (i === part ? onsets : onsetsOf(s.parts[i] as Part)));
    return withParts(s, normalise(parts), copy.resetNotice(group));
  }
  const p = s.parts[part] as Part;
  const k = (p.flights as { k: number }).k;
  return withParts(s, normalise(s.parts.map((q, i) => (i === part ? defaultPart(q, onsets, k) : q))));
}

function setK(s: AppState, part: PartIndex, k: number): AppState {
  const p = s.parts[part];
  if (p === undefined || p.flights.kind !== 'default' || !Number.isFinite(k)) return s;
  // A default part in a manual group: an x lands in it, so the group's count is the group's.
  if (isManualGroup(s.parts, groupOf(s.parts, part))) return s;
  const next = Math.max(1, Math.round(k));
  if (next === p.flights.k) return s;
  return withParts(s, s.parts.map((q, i) => (i === part ? defaultPart(q, onsetsOf(q), next) : q)));
}

/** `x` as a fraction n/d with d ≤ MAX_PHASE_REFINEMENT, or null. */
function asFraction(x: number): [number, number] | null {
  for (let d = 1; d <= MAX_PHASE_REFINEMENT; d++) {
    const n = Math.round(x * d);
    if (Math.abs(x * d - n) < 1e-9) return [n, d];
  }
  return null;
}

/**
 * Part `part` to `phase` pulses of the current lattice (MATH.md §9.6). A fractional phase (half
 * a pulse) refines the lattice through `withPhase`. A part in a manual group of several parts has
 * crosses whose landings move, so the group is re-derived at k = 1 first, with a notice; a
 * manual part on its own keeps its flights, which move with it.
 */
function setPhase(s: AppState, part: PartIndex, phase: number): AppState {
  const p = s.parts[part];
  const f = Number.isFinite(phase) ? asFraction(phase) : null;
  if (p === undefined || f === null || f[0] === p.phase * f[1]) return s;
  const group = groupOf(s.parts, part);
  const reset = group.length > 1 && isManualGroup(s.parts, group);
  const base = reset ? resetParts(s.parts, group) : s.parts;
  const parts = withPhase(base, part, f[0], f[1]);
  if (parts === base) return s;
  return withParts(s, parts, reset ? copy.resetNotice(group) : null);
}

/**
 * The parts at new spacings (one per part), each keeping its digits and onsets in its own beats
 * and its phase as the same share of its beat. A vanilla pair's half-beat offset belongs to its
 * notation, so it goes to phase 0. A phase share that is no whole pulse refines the lattice, up to
 * MAX_PHASE_REFINEMENT; past that the phases go to 0.
 */
export function rescale(parts: Parts, spacings: readonly number[]): Parts {
  const vanilla = isVanillaPair(parts);
  // Each new phase as num / den pulses of the new lattice.
  const phases = parts.map((p, i): [number, number] => (vanilla ? [0, 1] : [p.phase * (spacings[i] as number), p.spacing]));
  const r = phases.reduce((acc, [n, d]) => lcm(acc, d / gcd(n, d)), 1);
  const f = r <= MAX_PHASE_REFINEMENT ? r : 1;
  return normalise(
    parts.map((p, i): Part => {
      const spacing = (spacings[i] as number) * f;
      const [n, d] = phases[i] as [number, number];
      const flights =
        p.flights.kind === 'default'
          ? p.flights
          : { kind: 'manual' as const, throws: p.flights.throws.map((t) => ({ height: (t.height / p.unit) * spacing, to: t.to })) };
      return { spacing, phase: f === r ? (n * f) / d : 0, unit: spacing, flights };
    }),
  );
}

/**
 * The ratio of two parts (the chips and steppers). The ratio follows the parts, so with any other
 * number of parts it is refused; the same reduced ratio (2:2 for 1:1) keeps the parts as they are.
 */
function setRatio(s: AppState, ratio: Ratio): AppState {
  const a = Math.round(ratio.a);
  const b = Math.round(ratio.b);
  if (!(a >= 1 && b >= 1 && a <= MAX_RATIO && b <= MAX_RATIO) || (a === s.ratio.a && b === s.ratio.b) || s.parts.length !== 2) return s;
  const next: Ratio = { a, b };
  const [s0, s1] = ratioSpacings(next);
  const [o0, o1] = ratioSpacings(s.ratio);
  if (s0 === o0 && s1 === o1) return { ...s, ratio: next };
  const spaced = respace(s, [s0, s1]);
  return spaced === s ? s : { ...spaced, ratio: next };
}

/**
 * The parts at new spacings (`rescale`), each keeping its digits and onsets. A manual group where
 * a cross can no longer land on an onset is reset, with a notice; any other group is kept. A
 * cycle past MAX_LINK_CYCLE, which no link could carry, is refused.
 */
function respace(s: AppState, spacings: readonly number[]): AppState {
  const scaled = rescale(s.parts, spacings);
  if (cycleOf(scaled) > MAX_LINK_CYCLE) return s;
  const verdict = judge(scaled);
  const lost = verdict.groups.filter(
    (g) =>
      isManualGroup(scaled, g.parts) &&
      g.faults.some((f) => f.kind === 'no-onset' && throwsOf(scaled[f.from.part] as Part)[f.from.index]?.to != null),
  );
  if (lost.length === 0) return withParts(s, scaled);
  const group = lost.flatMap((g) => g.parts).sort((x, y) => x - y);
  return withParts(s, normalise(resetParts(scaled, group)), copy.resetNotice(group));
}

// ---------------------------------------------------------------------------------------------
// Lanes (docs/plans/lanes.md)
// ---------------------------------------------------------------------------------------------

/**
 * A new last part (the plan's "Add a hand"): the last part's rate and steps, phase 0, one onset
 * on beat 0, k = 1. Up to MAX_LANES parts.
 */
function addLane(s: AppState): AppState {
  const last = s.parts[s.parts.length - 1];
  if (last === undefined || s.parts.length >= MAX_LANES) return s;
  const onsets = Array.from({ length: periodOf(last) }, (_, beat) => beat === 0);
  return withParts(s, normalise([...s.parts, defaultPart({ ...last, phase: 0 }, onsets)]));
}

/**
 * Part `part` removed, with its voice. The rest of a cross group it was in loses the crosses that
 * fed it, so those parts are re-derived at k = 1, with a notice naming them as they are numbered
 * after. Crosses into later parts are renumbered. The last part cannot be removed.
 */
function removeLane(s: AppState, part: PartIndex): AppState {
  if (s.parts[part] === undefined || s.parts.length <= 1) return s;
  const others = groupOf(s.parts, part).filter((i) => i !== part);
  const changed = others.some((i) => !isDefaultAt1(s.parts[i] as Part));
  const renumber = (i: PartIndex) => (i > part ? i - 1 : i);
  const parts = resetParts(s.parts, others)
    .filter((_, i) => i !== part)
    .map((p) =>
      p.flights.kind === 'default'
        ? p
        : manualPart(p, p.flights.throws.map((t) => (t.to === null ? t : { height: t.height, to: renumber(t.to) }))),
    );
  const voices = s.mapping.parts;
  // A voice per part: the removed part's goes with it (withPartCount, in reduce, only trims the tail).
  // A mapping that borrows voices keeps them all.
  const mapping = voices.length === s.parts.length ? { ...s.mapping, parts: voices.filter((_, i) => i !== part) } : s.mapping;
  return { ...withParts(s, normalise(parts), changed ? copy.resetNotice(others.map(renumber)) : null), mapping };
}

/**
 * Part `part` at `rate` (1 to MAX_RATE), the others at theirs: spacings `lcm(rates) / rate`,
 * rescaled as setRatio does, so two parts at rates 3 and 2 are 3:2.
 */
function setRate(s: AppState, part: PartIndex, rate: number): AppState {
  const r = Math.round(rate);
  const rates = ratesOf(s.parts);
  if (s.parts[part] === undefined || !(r >= 1 && r <= MAX_RATE)) return s;
  const next = rates.map((x, i) => (i === part ? r : x));
  const g = next.reduce(gcd, 0);
  // The same rates in lowest terms (a lone part is always at rate 1): nothing to rescale.
  if (next.every((x, i) => x / g === rates[i])) return s;
  const l = next.reduce(lcm, 1);
  return respace(s, next.map((x) => l / x));
}

/**
 * Part `part`'s period to `steps` beats (1 to MAX_PERIOD): rests added at the end, or the tail
 * dropped. Its onsets change, so a manual group is reset with a notice (`changeOnsets`). The
 * phase wraps into the new period; a cycle past MAX_LINK_CYCLE is refused.
 */
function setSteps(s: AppState, part: PartIndex, steps: number): AppState {
  const p = s.parts[part];
  const n = Math.round(steps);
  if (p === undefined || !(n >= 1 && n <= MAX_PERIOD) || n === periodOf(p)) return s;
  const was = onsetsOf(p);
  const onsets = Array.from({ length: n }, (_, beat) => was[beat] ?? false);
  const wrapped = s.parts.map((q, i) => (i === part ? { ...q, phase: mod(q.phase, q.spacing * n) } : q));
  const next = changeOnsets({ ...s, parts: wrapped }, part, onsets);
  return cycleOf(next.parts) > MAX_LINK_CYCLE ? s : next;
}

/** The vanilla digits as the one input shows them: the draft's, when it reads as vanilla, else the parts'. */
function shownVanilla(s: AppState): number[] {
  const draft = s.drafts[0];
  const r = draft == null ? null : parseThrows(draft);
  return r?.ok && r.parts === 1 ? (r.throws[0] as Throw[]).map((t) => t.height) : vanillaDigits(s.parts);
}

/**
 * MATH.md §3 on one part's throws (sites are its beats, `spacing` pulses apart). On a vanilla
 * pair the sites are the siteswap's positions as the input shows them, whatever `part` says. A
 * swap that cannot be made (a height would go negative, a site out of range) changes nothing.
 */
function swapSites(s: AppState, part: PartIndex, i: number, j: number): AppState {
  if (isVanillaPair(s.parts)) {
    const swapped = swapThrows(shownVanilla(s).map((height) => ({ height })), i, j);
    return swapped === null ? s : withParts(s, vanillaPair(swapped.map((t) => t.height)));
  }
  const p = s.parts[part];
  if (p === undefined) return s;
  const swapped = swapThrows(throwsOf(p), i, j, p.spacing);
  if (swapped === null) return s;
  return withParts(s, normalise(s.parts.map((q, k) => (k === part ? manualPart(q, swapped) : q))));
}
