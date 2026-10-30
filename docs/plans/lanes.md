# Lanes: the Rhythm tab as a mixer, layered polyrhythms

Implements design §12 of `docs/plans/model-rethink.md` (the mixer hint). Nico, 2026-10-29: "rethink the UX on the Rhythm section and allow layering polyrhythms"; he skipped the design questions ("just go, sdd, far as you can"), so every choice below is the governor's call, open to his correction at the checkpoint. Process as in `docs/plans/model-waves.md`: governor Opus this session, final whole-branch review by Fable; implementers Opus or Sonnet as marked, one worktree and branch per stream, implementers never spawn agents; one review per stream; merge on green CI without asking. Every stream keeps `npm run typecheck`, `npm test` (100% lines per file in `vitest.config.ts`), `npm run e2e` and `npm run build` green, runs its own headless checks and returns screenshot paths (390×844).

Status: waves 1 and 2 merged 2026-10-29 (PRs 42-46, governor Opus session 1189, final review of 46 by Fable). Follow-up: compact lanes on a phone (`lanes-compact`). Checkpoint smoke run headless by the governor (Fable, session 1191) against anomatom.com on 2026-10-30, 390×844 and 1280×800: add to four lanes, rates 3:4:5, steps, cell toggle, More, playhead outline in every lane, Pattern tab with four inputs, remove a lane, link round trip; no console or network errors. Passed. Nico has not smoked it by hand.

## Why

Today's Rhythm tab (screenshot of main at 6eae3d6): ratio chips for two hands, then a 2-column grid of phase, balls and hits steppers. The onsets themselves are not on screen anywhere except the ladder; a third hand cannot be added; a polyrhythm is one ratio between two hands. The model already holds N parts on one lattice (`MAX_PARTS = 8` in links). The tab should show what the model is: one lane per part, the way a drum machine or a DAW arrangement does.

## The look (governor's call)

The Rhythm tab is a stack of **lanes**, one per part, top to bottom, then an "Add a hand" button. A lane, on a phone at 390 wide:

```
● Hand 1   808 kick          rate 3   steps 8      ×
[■][ ][ ][■][ ][ ][■][ ]
phase − 0/24 +    balls − 1 +    hits − 3 +
```

- **Header:** the part's colour dot (the ladder's and juggler's colour for that part), "Hand n", its voice name (from the Mapping; tapping it opens the Sound tab), the rate and steps steppers, and a remove button (absent when only one lane is left).
- **Step row:** one cell per beat of the part's period; a filled cell is an onset. Tapping a cell dispatches `toggleOnset`. The cell under the playhead is outlined while playing. Cells wrap to a second row past 8 on a phone. Manual parts show their cells too (onsets are digits ≠ 0); toggling one resets the group with the notice, as `toggleOnset` already does.
- **Knob row:** phase, balls and hits as today (balls is the derived count and "Reset" on a manual group, as today).
- **Rate** is the lane's speed: how many beats it plays while a lane of rate 1 plays one. Two lanes at rates 3 and 2 are today's 3:2; lanes at 3, 4 and 5 are a layered 3:4:5. Rates are derived from spacings (`rate_i = lcm(spacings) / spacing_i`, then divided by the gcd of the rates), so nothing new is stored. The ratio chips stay above the lanes as shortcuts for the first two lanes' rates while there are two lanes, and hide at three or more.
- **Steps** is the part's period in beats (`onsets.length`), 1 to `MAX_PERIOD`. Growing pads with rests; shrinking drops the tail (a manual group resets with the notice).
- **Add a hand** appends a default part: rate and steps of the last lane, phase 0, one onset on beat 0, `k = 1`, its own voice (the next in a rotation, below). Up to `MAX_LANES = 4` lanes on screen (tunable; links still decode up to `MAX_PARTS`). Removing a lane that a cross flight reaches resets that group with the notice.
- On wide screens the lanes are the same, wider, step rows unwrapped.

## Rulings in this plan

1. **Lane = part.** Reader-facing word stays "Hand". No `juggler` grouping field: figures are drawn by pairing (below).
2. **`AppState.ratio` becomes derived** from the first two parts' spacings (`ratioOf(parts)`; 1:1 for one part). Stream A removes it from stored state if every caller moves; if a caller cannot move this wave, A keeps it in sync inside `reduce` and records which. The hash keeps writing `r` (derived) so older readers are unaffected, and decoding ignores a stored `r` that disagrees with the spacings.
3. **The Pattern tab follows the lanes.** With three or more lanes it shows one input per lane in one-hand counting (`x<n>` targets, already parsed); `MAX_EDITOR_PARTS` becomes `MAX_LANES`. At two lanes it behaves exactly as today (vanilla, `a / b`, ratio forms).
4. **Juggler figures pair lanes.** Lanes 1 and 2 are the first figure's hands, 3 and 4 the second's; an odd last lane is a one-handed figure. Figures stand side by side, scaled to fit; a flight between figures is drawn as a pass across. Faulted groups draw as today (no balls, collision marks). The ladder draws one row per lane in the lane's colour.
5. **A voice per lane.** The Mapping holds one `PartVoice` per part; when a part is added it gets the next voice from `SOUND_LANES.voices` (new) (a tunable rotation over the TR-808: kick, snare, closed hat, clap, then repeating with pan spread), and removing a part removes its voice. The share link encodes N voices (it already writes `m.parts`). No mute or solo this plan.

## Contracts frozen here (stream A writes them; B, C, D build on them)

```ts
// src/app/actions.ts: new actions, added to Action
| { type: 'addLane' }
| { type: 'removeLane'; part: PartIndex }
| { type: 'setRate'; part: PartIndex; rate: number }     // rescales spacings on the lattice; normalise after
| { type: 'setSteps'; part: PartIndex; steps: number }   // period in beats, pad with rests or drop the tail

// src/app/lanes-model.ts (new, pure, 100% lines), replaces rhythmRows
export interface LaneRow {
  readonly part: PartIndex;
  readonly rate: number;
  readonly steps: number;
  readonly onsets: readonly boolean[];
  readonly phase: number;          // as HandRhythm today
  readonly wrap: number;
  readonly cycle: number;
  readonly hits: number;
  readonly k: number | null;
  readonly group: { readonly parts: readonly PartIndex[]; readonly balls: number | null } | null;
  readonly canRemove: boolean;
}
export function laneRows(state: AppState, d: Derived): LaneRow[];
export const canAddLane: (state: AppState) => boolean;
export function ratesOf(parts: Parts): number[];   // in src/core/parts.ts if it fits there better; A decides and says
```

The voice rotation lives in sound (stream D): `voiceForNewPart(mapping, index): PartVoice` and `withPartCount(mapping, n): Mapping` in `src/sound/mapping.ts`. `reduce` calls `withPartCount` on every action that changes `parts.length`; D ships that function, A calls it (A may stub it with today's `part % length` reuse until D merges, and the governor wires the real one at rebase).

## Waves

**Wave 1** (parallel, three worktrees):

- **A · Lanes model** (Opus). Owns `src/app/actions.ts`, `state.ts`, `derived.ts`, `hash.ts`, new `lanes-model.ts`, `knobs-model.ts` (the Pattern editor's N inputs), the lanes section of `tunables.ts`, A's lines of `copy.ts`, `src/core` only if `ratesOf` goes there. The four actions with tests for every rule above (add, remove with group reset and notice, rate on a vanilla pair, rate keeping a manual lone part, steps pad and drop, manual reset notice); ratio derived; hash round trip for three and four parts; Pattern editor model with three inputs. Today's Rhythm tab keeps working on `laneRows` (the mount may adapt it to two columns). Done means: unit tests at 100%, e2e green with no visible change.
- **C · Views for N parts** (Opus). Owns `src/view/*`, `mount-juggler.ts`, `mount-ladder.ts`, `juggler-canvas.ts`, `ladder-canvas.ts`, their CSS. Ruling 4: figures by pairing, passes across, one ladder row per part, colour per part (a published `partColour(i)` the lanes UI will use). Test from a `#v2.` link with three parts (encode one in a fixture with `encodeState`). Done means: unit tests; screenshots of 2, 3 and 4 parts at 390×844 and 1280×800; two-part pictures unchanged (today's e2e).
- **D · Sound for N parts** (Sonnet). Owns `src/sound/*`, `sound-panel-model.ts`, `mount-sound-panel.ts`, sound tunables. Ruling 5: `withPartCount`, `voiceForNewPart`, the rotation tunable; mapping hash with 3 and 4 voices; the Sound tab lists one voice row per part. Done means: unit tests; a 3-part link plays three voices (an e2e or a unit test on `hitFor`).

Merge order: D, C, A (A wires `withPartCount` at its rebase). Checkpoint: tests and screenshots only; nothing to add lanes from the UI yet.

**Wave 2** (after wave 1):

- **B · Rhythm tab lanes** (Opus). Owns `mount-knobs.ts` (Rhythm panel), `knobs.css`, the sheet's Rhythm markup, Pattern tab wiring for N inputs. The look above, on `laneRows` and `partColour`. e2e: add a lane, set rates 3, 4, 5, toggle cells, remove a lane, link round trip; screenshots.
- **F · Layered presets** (Sonnet). Owns `presets.ts`, first-minute cards. Three or four layered cards from `docs/POLYRHYTHMS.md` rows with three or more parts (each with its verified source), plus a 3:4:5 rate stack. Cards carry their mapping preset as today.

Checkpoint: Nico's smoke test of the lanes.

## Left to the builders

Exact cell sizes, wrap rule on narrow phones, how the playhead outline animates (it reads the player view; no timers in models), the copy wording (in `copy.ts`), and the pass drawing style.

## Rulings

- 2026-10-29 (governor, D): a mapping equal to `withPartCount(preset, n)` is that preset; `decodeMapping` takes the part count so a preset name decodes with one voice per part.
- 2026-10-29 (governor, C): with one or two parts no part colour is drawn and the picture is unchanged; part colours appear on ladder lines and hand bars from three parts. One part draws as today's pair of hand bars; a one-handed figure is only an odd last part from three up. The lanes UI shows the colour dot from three lanes, to match.
- 2026-10-29 (governor, A): `AppState.ratio` stays stored but is resynced to `ratioOf(parts)` after every change to the parts; `setRatio` needs exactly two parts. `MAX_EDITOR_PARTS` stays 2 (the most parts one `/` input writes); from three parts each lane has its own input. `encodeState` no longer takes the ratio. `rescale` keeps a part's flights when its spacing changes by a whole factor. A refusal past `MAX_LINK_CYCLE` sets the notice `copy.cycleTooLong`. Rates are shown reduced: 2:2 is 1:1.
- 2026-10-29 (governor, F): layered cards carry `ratioOf(parts)`; About lists each opened source once and unsourced cards (3:4:5) as "No page opened"; the every-pulse hosho is a choice made here.
- 2026-10-29 (governor, B): rate and steps sit in a row under the lane header; phase on its own row; later lanes of a manual group read "Balls shared with hand n"; the Rhythm tab has its own notice line.
