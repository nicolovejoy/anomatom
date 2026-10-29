# v1 in parallel — rough plan

Status: agreed with Nico 2026-10-29; not started. A fresh session runs it with subagent-driven development (SDD). Delete this file when wave 2 merges; git keeps it. Spec: `docs/SPEC.md`. Roadmap: `docs/ROADMAP.md` (steps 4-7 remain).

## Shape

Waves. Inside a wave, 3-4 streams run at once, each in its own git worktree and branch, each ending in its own PR. Implementers never spawn agents.

Roles:

- Governor: the session itself, on Fable. It dispatches implementers (`isolation: worktree`) and task reviewers, rules on conflicts, and merges each PR on green CI after its final review without asking Nico, one at a time, rebasing the streams still running.
- Final review of each PR's whole branch: Fable.
- Implementers and task reviewers: Opus or Sonnet, as marked on each stream.

SDD runs one plan's tasks serially in one tree; here each stream is its own SDD loop in its own worktree, so parallel implementers do not share files.

The conflicts are in three files every stream wants to touch: `src/main.ts`, `src/tunables.ts`, `src/ui/copy.ts`. Wave 0 exists to defuse them: it carves those files into named sections and mount points, so each stream appends inside its own region.

## Wave 0 — shell (one agent, serial, small)

1. Rename: done in PR 6 (title, copy, package, doc headers) and the GitHub repo rename. Nico moves the local folder to `~/src/anomatom` before the governing session starts, so no worktree points at the old path.
2. `src/app/state.ts`: the one AppState (pattern text per hand, ratio, bpm, volume, Mapping) plus a tiny store (get, set, subscribe). Pure, 100% lines. Knobs write it; the hash codec, the player and the sound panel read it. Today `main.ts` holds this ad hoc.
3. `main.ts` split into `mountJuggler`, `mountLadder`, `mountKnobs`, `mountSoundPanel`, `mountAbout`, each in its own file under `src/app/`. Each receives the store and its root element. Stubs where nothing exists yet. One shared rAF loop calls the draw functions.
4. `tunables.ts` and `copy.ts` get one section header per stream. The ball palette moves out of `LADDER` to a shared `BALL_COLOURS` (the juggler and the ladder must agree).
5. Headless Playwright smoke test (SPEC §7.8): load, press play, see the first Event. Edge desktop, headless. CI runs it. Every later stream can add a check to it.

Exit: main is green, the page behaves exactly as before, every mount point exists.

## Wave 1 — four streams in parallel

A. **Juggler** (roadmap 4; Opus). A port of sani.js's motion model, not a fork: its rAF delta clock and `siteswap.js` are dropped. MIT notice in the file header.
   - `src/view/juggler.ts`, pure, 100% lines: `jugglerFrame(schedule, position, layout)` → per ball `{ ball, x, y, held: Hand | null, progress, flash }`, plus scene bounds per schedule. `held` and `progress` exist so hands and clubs (spin = f(progress, height)) can be drawn later without reshaping the output; neither is drawn now.
   - Motion: each throw event owns `[t, t + flight)`. The ball is airborne for `flight − d`, then rides a scoop in the catching hand for `d`, from its catch point (outer) to its throw point (inner), arriving exactly at the next throw. `d = min(dwell × catching hand's pulsesPerBeat, maxDwellShare × flight)`. Parabola under a constant gravity, so apex ∝ air time². Scene fits the canvas, uniform scale, per schedule. Catching hand = `cross ? 1 − hand : hand`. Zero flights are already absent from the Schedule.
   - Flash: a cross flight whose landing pulse `isCoincident` flashes during its scoop. Never at 1:1.
   - Tests: ball at the catching hand's throw point at every catch event (SPEC §7.6, picture half); apex ∝ square; cross ends at the other hand; continuous across the period wrap and at large positions; `2 2x 2` / `2x 2` at 3:2 flashes at pulse 6; `3`, `441`, `97531` never flash.
   - `src/app/juggler-canvas.ts` draws balls only; mounted above the ladder.
   - A vanilla `2` is a small toss. Ball-count changes mid-play are left to step 5.

B. **Fix state, core** (roadmap 5, logic half; Opus). Pure modules in `src/core`, 100% lines.
   - Collision messages exactly as SPEC §4.2 ("throws 2 and 4 both land on beat 3", the three-way form, cross-off-grid with the nearest legal pulse).
   - Up to three fixes: swap on the colliding pair; the nearest one or two valid patterns by edit distance; the single-digit change that makes a fractional count whole. Every offered fix must itself validate (SPEC §7 item 2: `12`, `21`, `43`, `4441`).
   - Player: knob changes (pattern, ratio, tempo) queue and land at the next cycle boundary, with no click and no restart (SPEC §5.5, §7.4). The player exposes "pending" for the "next cycle" indicator.

C. **Mapping and hash, core** (roadmap 6, logic half; Sonnet). Pure, 100% lines.
   - Mapping grows to every field in SPEC §4.3: presets (height→drum, height→pitch, ball→pitch) with "custom" detection, per-height sound, per-hand pan/gain, catches, cross accent and downbeat sound, crossings filter, downbeat pad.
   - `src/app/hash.ts`: AppState ↔ URL hash, versioned, round-trip tested, junk-tolerant (a bad hash falls back to defaults, never throws). Opening a link restores state and does not auto-play.
   - Sound-side wiring of the new fields in `drum-sound.ts` behind the existing factory shape (the pad instrument via smplr, preloaded, silent before load).

D. **About and README** (roadmap 7 minus ship checks; Sonnet).
   - `mountAbout`: SPEC §4.4. Three short sections, the bibliography rendered from `BIBLIOGRAPHY.md` at build time (one source, not a copy), credits for sani.js, smplr and L6, and links back to the play view and the repo. Routed by the hash (`#about`), coexisting with C's state hash: the two must agree on a format before either writes it (controller ruling at dispatch).
   - README: what it is, the math in brief, how to run it, MIT.

## Wave 2 — three streams in parallel

E. **Knob panel and fix-state UI** (roadmap 5, UI half; Opus). Needs B. Panel in SPEC §4.1 order: digit buttons, `x`, backspace, ratio chips plus steppers to 9:8, tempo for both hands, swap-two-sites, play/pause, scrub slider when paused, volume. Fix state per §4.2: warning-coloured digits, messages, fix buttons; the ladder draws the broken pattern greyed above the playing one. Phone layout: the panel folds under a button.

F. **Sound panel and share link UI** (roadmap 6, UI half; Sonnet). Needs C. The drawer over the play view, one control per Mapping field, reset to preset, copy share link.

G. **Done-means sweep** (roadmap 7, ship half; Sonnet). Playwright headless on Chromium, WebKit and Firefox for SPEC §7 items 1-5. The §7.6 timing test: audio events within 2 ms of their scheduled time, read from the audio clock. A checklist for Nico's iPhone Safari pass. Can start once E and F are close; its fixes go back to the stream that owns the file.

## Merge order

Wave 0 → A, B, C, D in any order as each goes green (the governor rebases the rest after each merge) → E, F → G. One PR per stream, so roadmap steps 5 and 6 are two PRs each (agreed 2026-10-29; `CLAUDE.md` says so).

## Down the road (not v1; recorded so A's output shape allows it)

- Hands, then clubs: draw from `held`, `progress`.
- A 3D juggler you can orbit around: issue #7, P3.
- The robot. An anomatom rendered as a polyphonic juggling robot: one view the juggler, one the drummer, a body around the same poses. A drummer at a kit means four limbs, so `Hand = 0 | 1` becomes a limb index and the grid model (one grid per limb) already says how limb independence works. Not touched in v1.
