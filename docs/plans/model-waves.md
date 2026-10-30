# Model rethink: waves

Implements `docs/plans/model-rethink.md` (the design; read it first, it is the contract). Process as in `docs/plans/v1-parallel.md` "Roles and process": governor Fable; implementers Opus or Sonnet as marked, one worktree and branch per stream, implementers never spawn agents; one review per stream at its end, final whole-branch review by Fable; merge on green CI without asking; rebase only at a stream's end. Every stream keeps `npm run typecheck`, `npm test` (100% lines per file, `vitest.config.ts`) and `npm run e2e` green at every commit, and `npm run build` building; legacy functions may stay as thin wrappers over new ones until the stream that retires them. Every stream runs its own headless checks and returns screenshot paths; Nico gets one short smoke test at each checkpoint.

Status: waves 0, 1 and 2 merged 2026-10-29 (PRs 32-39, Fable session 1187); awaiting Nico's checkpoint smoke test. Next: the v2 kits stream on the per-part Mapping, share-in-reach on the v2 hash, the space-bar fix, then the mixer-style UI plan (design §12).

## Waves

- **Wave 0** (parallel): A · Core model (Opus), D · Docs (Opus). Checkpoint: tests only; no visible change.
- **Wave 1** (parallel, after A merges): B · App model, actions and hash (Opus), C · Sound per part (Sonnet).
- **Wave 2** (after B and C): E · UI rewire, option (b) of the design §14 (Opus); F · Presets from the sourcebook (Sonnet, after E's Rhythm tab exists or in parallel if it only adds data and cards). Checkpoint: Nico's smoke test.
- The v2 kits stream (`docs/plans/v2-share-kits-passing.md` K) starts after C, on C's per-part shape. Share-in-reach (S) starts after B, on B's hash. The space-bar fix (F there) may run any time.

## Contracts frozen in this plan

Changing one is a governor ruling recorded here under "Rulings".

### Core types (`src/core/types.ts`, stream A writes them verbatim)

```ts
/** Index of a part (a hand). Hand 1 is part 0. */
export type PartIndex = number;

/** One beat of a part: flight length in lattice pulses (0 = no onset on this beat), a multiple of the part's `unit`, and the destination part (null = this part). Digits are notation: digit = height / unit. */
export interface Throw {
  readonly height: number;
  readonly to: PartIndex | null;
}

/** How a part's flights are decided: by the default rule from its onsets and ball knob, or by hand. */
export type PartFlights =
  | { readonly kind: 'default'; readonly onsets: readonly boolean[]; readonly k: number }
  | { readonly kind: 'manual'; readonly throws: readonly Throw[] };

/**
 * A part: one grid on the lattice (spacing in pulses, phase in pulses), its notation unit, and its
 * flights. Period in beats = onsets.length or throws.length. `unit` is the pulses one written digit
 * stands for: the spacing in one-hand counting and for default parts; 1 for a vanilla pair (spacing 2,
 * phases 0 and 1), where `3` is a 3-pulse flight. Lattice refinement scales spacing, phase, unit and heights together.
 */
export interface Part {
  readonly spacing: number;
  readonly phase: number;
  readonly unit: number;
  readonly flights: PartFlights;
}

/** The whole model: parts on one lattice, normalised so the gcd of every spacing and phase is 1. */
export type Parts = readonly Part[];

export interface ThrowId {
  readonly part: PartIndex;
  /** Beat index within the part's period. */
  readonly index: number;
}

/** One throw unrolled onto the lattice for one cycle. */
export interface Flight {
  readonly id: ThrowId;
  readonly from: PartIndex;
  readonly to: PartIndex;
  readonly beat: number;
  readonly cross: boolean;
  readonly launch: number;
  /** Not wrapped; may be at or past the cycle. */
  readonly land: number;
}

export type Fault =
  | { readonly kind: 'collision'; readonly part: PartIndex; readonly pulse: number; readonly throws: readonly ThrowId[] }
  /** A flight lands on a pulse where the catching part has no onset (today's cross-off-grid, generalised). */
  | { readonly kind: 'no-onset'; readonly from: ThrowId; readonly part: PartIndex; readonly pulse: number; readonly nearestOnset: number }
  /** An onset that no flight lands on. */
  | { readonly kind: 'unfed'; readonly part: PartIndex; readonly pulse: number };

/** Parts joined by cross flights, judged together (design §5, §6). */
export interface CrossGroup {
  readonly parts: readonly PartIndex[];
  readonly faults: readonly Fault[];
  /** Derived ball count; null when faults is not empty. */
  readonly balls: number | null;
}

export interface Verdict {
  readonly groups: readonly CrossGroup[];
  /** Every group fault-free. */
  readonly ok: boolean;
}

export type EventKind = 'throw' | 'catch';

export interface Event {
  readonly kind: EventKind;
  readonly pulse: number;
  readonly part: PartIndex;
  /** Stable within the period; null for parts in a group with faults. */
  readonly ball: number | null;
  /** The digit: flight / the part's unit. What height-to-drum reads; MAX_HEIGHT clamps it. */
  readonly height: number;
  /** Flight length in pulses. */
  readonly flight: number;
  readonly cross: boolean;
}

export interface Schedule {
  readonly cycle: number;
  readonly period: number;
  /** One per part: spacing and phase. */
  readonly grids: readonly { readonly spacing: number; readonly phase: number }[];
  /** Sum over fault-free groups. */
  readonly balls: number;
  readonly events: readonly Event[];
  readonly verdict: Verdict;
}
```

### Core API (stream A; names fixed, bodies the stream's)

- `parseThrows(text): { ok: true; throws: Throw[]; parts: number } | { ok: false; error: ParseError }`: digits `0-9`, letters `a-z` for 10-35, optional `x` (to the other part, only legal when the text has two parts) or `x<n>` (to part n, 1-based as written, stored 0-based); whitespace ignored; `/` separates parts and sets `parts`. `ParseError` keeps today's kinds plus `{ kind: 'bad-target'; index }`.
- `partsFromVanilla(text)`: one siteswap, two parts, spacing 2, phases 0 and 1, unit 1, manual throws with heights in pulses equal to the digits (odd ones to the other part), so vanilla `3` is a 3-pulse flight as today's `vanillaFlights` has it; beat i of the siteswap is beat floor(i/2) of part i mod 2. `isVanillaPair(parts)` recognises the shape so `textOf` can render it as one siteswap.
- `partsFromLines(texts: string[], ratio: Ratio)`: one text per part in one-hand counting, spacings `b/g` and `a/g` for two parts (today's `makeGrids`), phases 0, unit = spacing, heights = digit × unit; manual throws. For N > 2 parts, every part spacing 1 unless a ratio per part is given (not needed in wave 0; signature takes `spacings?: number[]`).
- `partsFromOnsets(lines: boolean[][], spacings: number[], k?: number[])`: default parts.
- `textOf(part: Part, parts: Parts): string`: digits (letters above 9), `x`/`x<n>`, grouped like `2 2x 2`.
- `onsetsOf(part): boolean[]`, `periodOf(part): number`, `cycleOf(parts): number` (lcm of spacing × period), `normalise(parts): Parts` (divide spacings and phases by their gcd), `withPhase(parts, i, phasePulses): Parts` (refines the lattice by the needed factor when the phase is not a multiple of the current pulse; design §4).
- `euclid(hits, pulses): boolean[]` (Bjorklund; starts on a hit), `rotate<T>(xs, by)`.
- `flightsOf(parts): Flight[]`: default rule (onset i to onset i + k, same part) or manual; height-0 beats produce no flight.
- `crossGroups(parts): PartIndex[][]`, `judge(parts): Verdict` (predicates 1 and 2 of design §6; no ceiling), `ballCount(group)`.
- `buildSchedule(parts): Schedule`: never throws; events for every onset of every part; ball ids only in fault-free groups; period = cycle × lcm of orbit sizes over fault-free groups (1 if none).
- `carryOver(old, next, boundary)`: as today, on the new `Schedule`.
- `fixesFor(parts, group, limits)`: today's edit-distance search over the manual throws of one group, returning `Parts[]`.
- Legacy: `PatternInput`, `parsePattern`, `validate`, `makeGrids` may remain as wrappers for one wave so the app builds; A notes which callers B must move.

### App state and actions (stream B)

```ts
export interface AppState {
  readonly parts: Parts;
  /** Input drafts, one per part, as typed; UI state, not in the hash. Null = show textOf(part). */
  readonly drafts: readonly (string | null)[];
  readonly ratio: Ratio;             // kept for the Rhythm tab chips; parts' spacings follow it
  readonly bpm: number;
  readonly volume: number;
  readonly mapping: Mapping;
  readonly lastStateHash: string | null;
  readonly sheetTab: SheetTab | null;
  /** One-line notice from the last action (design §5), cleared by the next action. */
  readonly notice: string | null;
}

export type Action =
  | { type: 'toggleOnset'; part: PartIndex; beat: number }
  | { type: 'setK'; part: PartIndex; k: number }
  | { type: 'setPhase'; part: PartIndex; phase: number }
  | { type: 'editDraft'; part: PartIndex; text: string }       // parses; on success writes manual throws for the group
  | { type: 'resetGroup'; part: PartIndex }
  | { type: 'setRatio'; ratio: Ratio }
  | { type: 'setBpm'; bpm: number }
  | { type: 'loadPreset'; parts: Parts; ratio: Ratio; bpm?: number; mapping?: Mapping }
  | { type: 'generate'; part: PartIndex; hits: number }         // euclid over the part's period
  | { type: 'swapSites'; part: PartIndex; i: number; j: number };

export function reduce(state: AppState, action: Action): AppState;   // pure, src/app/actions.ts
export function derived(state: AppState): Derived;                   // memoised on state identity, src/app/derived.ts
export interface Derived { readonly schedule: Schedule; readonly texts: readonly string[]; readonly groups: readonly CrossGroup[]; readonly fixes: readonly Parts[]; readonly fractional: number | null /* digit-editor presentation of a non-integer mean */ }
```

Hash: `#v2.` + base64url JSON `{ p: Part[] (short keys), r, t, m }`; `#v1.` still decodes through `partsFromVanilla` / `partsFromLines`. Preset cards carry a mapping preset name (design §7).

### Sound (stream C)

```ts
export interface PartVoice { readonly kit: string; readonly sample: Sample; readonly pan: number; readonly gain: number }
export interface Mapping { readonly parts: readonly PartVoice[]; readonly perHeight: ...; readonly byHeight: boolean /* preset reads flight length */; ...rest as today }
export function hitFor(event: Event, mapping: Mapping, schedule: Schedule): Hit | null;
```
Default preset "Voice per part"; "Height to drum" and "Height to pitch" keep reading height; fallback of design §7 when `event.ball === null`: the part's voice, flight = gap to the next onset of that part (already what `event.flight` holds for a default part; C documents that B's schedule guarantees it for faulted parts too, ruling below).

## Streams

**A · Core model** (Opus). Owns `src/core/*`, `docs/MATH.md` §8 test table only in so far as `src/core/table.test.ts` must keep encoding it. Tasks: types verbatim; parser with letters and `x<n>`; constructors and `textOf`; lattice, phase and `normalise`; `euclid`; `flightsOf`; `crossGroups` and `judge`; `buildSchedule` never throwing; `carryOver` and `fixesFor` on the new types; legacy wrappers so the app builds. Tests: today's `table.test.ts` rows pass with "invalid" read as a faulted verdict; new rows: Clapping Music at phase 0, 3, 9 (cycle 12 each); son clave at k = 1 and 2 (`6 0 0 7 0 0 6 0 0 0 6 0 7 0 0 0`); kotekan as two one-ball parts and as `1x`-style one ball crossing (same onsets, balls 2 vs 1); 3:2 with part 2 at phase 1 (coincide at 4); vanilla `531` refines to spacing 2; a 16-step line with one hit at k = 1 is fault-free with a 16-beat flight. Done means: `npm test` green at 100%, e2e green, `npm run build` passes, and `docs/MATH.md` §8 table unchanged except the "Valid" column header reading "Juggleable" (D edits the prose).

**D · Docs** (Opus). Owns `docs/MATH.md` prose (new §9 from design §3 to §6, §6.5 as corollary), `docs/SPEC.md` (§3, §4.2, §5, §6, v2 lists), `docs/POLYRHYTHMS.md` (son clave is not maximally even; mark which rows are Euclidean), `docs/BIBLIOGRAPHY.md` (add the design §10 sources **only after opening each**: Toussaint 2005 Euclidean paper is online; Juggling Lab's MHN is in its source; books via publisher pages, recording what was checked; anything not opened stays out or carries the HTML-comment marker). Done means: a reader can plan stream B from MATH and SPEC alone; every new bibliography entry names what was opened in the PR description.

**B · App model** (Opus, wave 1). Owns `src/app/state.ts`, new `actions.ts`, `derived.ts`, `hash.ts`, `first-minute.ts`, `knobs-model.ts`, `share.ts`; moves every caller off the legacy wrappers and deletes them from `src/core`. Done means: unit tests for every action rule in design §5 (manual group, reset with notice, phase refinement, `k` unavailable on manual groups), hash v1 links decode to the same schedule as before (fixture: today's five cards), e2e green with no UI change.

**C · Sound per part** (Sonnet, wave 1). Owns `src/sound/*`, `tunables.ts` sound section, Sound tab model. Done means: `hitFor` on the new `Schedule`; "Voice per part" preset; fallback; the sentence about ball count in the Sound tab copy; unit tests.

**E · UI rewire** (Opus, wave 2). Design §14 option (b): Play always on; faulted group drawn as today's collision in the juggler, no balls for it; juggler axis fits the longest flight; flights over `HUMAN_AIRTIME_SECONDS` dimmed with the copy "not a human throw"; Rhythm tab gains a phase stepper, a ball stepper and the Euclidean generator (`generate` action: hits over the hand's period) per hand (ball stepper replaced by the derived count and "reset" on a manual group); the notice line; form 2 at 1:1 (`a / b`); "make it juggleable" fixes optional. Screenshots at 390×844.

**F · Presets** (Sonnet, wave 2). Sourcebook table into presets (onset sets, parts, voices, bpm, source), first-minute "more" control, About page sections per layer with the verified citations from D.

## Rulings

- 2026-10-29 (Fable, wave 2): `JUGGLER.uniformTopMetres` lowered to 1.5 so a cascade is not tiny; one uniform scale for both juggler axes, squeezing only above it. Backspace joins two inputs only for a vanilla pair or a split typed in this session. Juggling cards carry no bpm and leave the tempo alone. Eno drift waits for a sustained voice. About cites only opened sources; Buhler et al. and Polster were re-opened for the average theorem.

- 2026-10-29 (Fable): `Event.height` is always `flight / unit`, for faulted parts too. Kotekan telu shares pulses between the hands, so the one-ball crossing test case is the hocket `2 0` / `0 2` versus `1x 0` / `0 1x`. `AppState.notice` is transient UI state, not an action result.

- 2026-10-29 (Fable): for a part in a faulted group, `Event.flight` is the gap to the next onset of that part (the k = 1 value), regardless of what the manual digit said, so the sound fallback of design §7 needs no second code path. The faulted digits are still reported in the verdict for the picture.

- 2026-10-29 (Fable, after wave 1): (a) `Derived.fixTexts` exists. `setPhase` on a lone manual part keeps its flights. `setRatio` resets a vanilla pair with a notice. The notice is transient UI state, shown as the last status line, never in the hash.

- 2026-10-29 (Fable, after wave 1): (b) Drafts edit flights, never grids. A single string is vanilla only over two hands at 1:1. Vanilla text lays out its own grids, and `a / b` typed over a vanilla pair starts at spacing 1, phase 0. The editor is capped at two parts this wave (`MAX_EDITOR_PARTS`). Views take the catching part from the catch event.

- 2026-10-29 (Fable, after wave 1): (c) The "lands between" message uses core's `nearestOnset`.

- 2026-10-29 (Fable, after wave 1): (d) `DEFAULT_MAPPING` is voice per part, and each card carries its own preset.
