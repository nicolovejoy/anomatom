# v1 in parallel

Status: agreed with Nico 2026-10-29, revised after the PR 8 review; not started. Delete this file when wave 2 merges; git keeps it.

Spec: `docs/SPEC.md` (binding). Theory: `docs/MATH.md`. Conventions: `CLAUDE.md`. This plan covers roadmap steps 4-7 and wins where the roadmap's end states differ.

## Roles and process

- **Governor**: the session that runs this plan, on Fable. For each stream it writes the SDD task list from this file, dispatches implementers (`isolation: worktree`, one worktree and branch per stream) and per-task reviewers, rules on conflicts, and records rulings in the stream's ledger.
- **Final review** of each stream's whole branch: Fable.
- **Implementers and task reviewers**: the model marked on each stream (Opus or Sonnet). Named on every dispatch.
- Implementers never spawn agents.
- **Rebasing**: only at a stream's end, before its final review, and never while an implementer is dispatched in that worktree.
- **Merging**: the governor merges each PR on green CI after its final review, without asking, one at a time.
- **Checkpoints**: after wave 0 merges and after wave 1 merges, the governor stops, posts a short smoke test (exact URL, numbered steps, pass/fail) and waits for Nico before the next wave.
- **Deploys**: Pages publishes every merge to anomatom.com, so partial UI goes live between waves. Accepted.

## Contracts frozen in wave 0

Every later stream codes against these. Changing one is a governor ruling recorded in the ledger.

**Player view.** The picture reads only this; it can express a pattern switch from day one.

```ts
interface Segment {
  readonly schedule: Schedule;
  /** Audio-clock seconds at this segment's pulse 0. */
  readonly startTime: number;
  readonly pulseLen: number;
  /** Seconds at which the next segment takes over; null for the last. Flights launched before it are drawn to their landing, retimed to the next segment's pulse length (see Retiming). */
  readonly endTime: number | null;
  /**
   * Ball identity across the switch into this segment: new ball id → the previous segment's ball
   * id it continues. Empty for the first segment. Computed by `carryOver` (stream B).
   */
  readonly carry: ReadonlyMap<number, number>;
}
interface PlayerView {
  /** The time the picture shows: the audio clock while playing, frozen while paused, set by the scrub slider. */
  readonly now: number;
  readonly state: 'stopped' | 'playing' | 'paused';
  readonly segments: readonly Segment[];
  /** True while a queued change waits for the next cycle boundary. */
  readonly pending: boolean;
}
```

When stopped, `player.view()` returns one segment of the latest valid edit placed so that `now` is pulse 0 (or the scrub position). Wave 0 implements this with the current single-schedule player and converts `ladderFrame` to take `(segments, now)`, including several segments: each segment's throws are drawn from its start until its `endTime`, flights to their landing (retimed, see Retiming), colours through `carry`. Wave 0 tests that with hand-built two-segment views (a tempo change and a pattern change). B adds queued switches and tempo changes behind the same shape.

**Carry-over rule** (`carryOver(old, new, boundary)`, pure, in `src/core`, owned by B; A and the ladder read only `carry`). Let B be the boundary in the old segment's pulses.

- The crossing flights are the old flights with launch < B ≤ land, including one that lands exactly at B.
- A crossing flight landing at (B + p, hand) is matched only to the new ball whose *first* throw is at (p, hand) in the new segment. That makes the map one-to-one: each new ball has one first throw, and each (pulse, hand) one throw.
- The new ball id maps to the old one and keeps its colour.
- When both patterns pass through the same state at B, every ball carries (`3` → `441`). Otherwise, or when the ball count changes, the rest go unmatched (MATH §4; `3` → `51` cannot carry all three, since `51` is excited).
- An unmatched old flight lands and vanishes into the hand. An unmatched new ball appears held at its first throw point at `startTime`. Accepted for v1: while an unmatched old flight is still landing, the count can briefly exceed both patterns' (`3` → `51` can show 4 for under one cycle).

**Retiming across a tempo or ratio change.** A crossing flight is drawn from its launch, in old time, to its landing, in new time: `startTime + p × new.pulseLen`. It is one parabola over that span, so a carried ball lands exactly when its new throw sounds. Old throws at or after `endTime` are never played; the new segment owns them.

**App state and store.** `src/app/state.ts`, pure, 100% lines. It holds:
- pattern text per hand
- ratio
- bpm
- volume
- Mapping
- the last play-view state hash, for About's back link (written by F's `mountShare`)
- the copy voice (see "Copy voice" below), if it turns into a setting

The store has `get`, `set(patch)` and `subscribe`.

**Mount contract.** `mountX(root: HTMLElement, ctx: { store, player, sound }) => { draw?(view: PlayerView): void }`, one file per region under `src/app/`:
- `mountJuggler`
- `mountLadder`
- `mountKnobs`
- `mountSoundPanel`
- `mountAbout`
- `mountShare` (a stub in wave 0, no element; stream F fills it)

`main.ts` builds the context, calls each mount and runs one rAF loop over the returned `draw` functions. No stream after wave 0 edits `main.ts`.

**Routes and hash.** `route(hash) -> { view: 'play' | 'about'; state: string | null }`, pure.
- `#about` is reserved. Play-view state is `#v1.<base64url JSON>` of the AppState minus volume (SPEC §4.3 lists pattern, ratio, tempo and Mapping).
- The hash updates live (`replaceState`, debounced) on every state change, so "Copy share link" copies `location.href`.
- About's back link returns to the last state hash, held in the store.
- A `hashchange` on an open page (a pasted link) restores state like any knob change: it lands at the next cycle if playing and never auto-plays.
- Playback continues while About shows.
- A junk hash falls back to defaults and never throws.

**File ownership.** One CSS file per mount, imported by that mount; `src/style.css` keeps only the globals.
- `vitest.config.ts` switches from a list to globs, so adding a module never touches it: `src/core/**`, `src/view/**`, `src/sound/**` except `tr808.ts`, the named pure files in `src/app/`, and test files excluded. Threshold stays 100% lines per file.
- Wave 0 adds every new dependency, so no stream edits `package.json`:
  - `@playwright/test` (Apache-2.0, recorded in the README as an allowed licence)
  - nothing else; D renders `BIBLIOGRAPHY.md` with a small hand-written parser.
- `player.ts` is edited by wave 0, then B (wave 1), then F (wave 2), never by two streams at once.
- `tunables.ts` and `copy.ts` get one section per stream; each stream edits only its own section. `DEFAULT_MAPPING` belongs to C.

**Copy voice.** The robot, in the first person, chosen by Nico 2026-10-29; the guide lives at the top of `copy.ts`. Wave 0 rewrites the existing strings in the chosen voice and writes a five-line voice guide at the top of `copy.ts`. Every later string follows it. Hand 1 and hand 2 read as left and right on screen.

## Wave 0: shell (one stream, Opus)

1. The contracts above: `state.ts`, the store, `route()`, the mounts, the rAF loop, `player.view()`, `ladderFrame(segments, now)`, vitest globs, per-mount CSS, section headers.
2. `BALL_COLOURS` moves out of `LADDER`, shared by the juggler and the ladder.
3. The copy rewrite in Nico's chosen voice.
4. The headless smoke test (SPEC §7.8): load the page, press play, and see `data-events-scheduled` on `#app` go above 0. The player sets that attribute because audio output isn't observable: samples load from a CDN and stay silent until they arrive. CI uses Playwright's bundled Chromium; local runs use Edge (`channel: 'msedge'`), headless.

Check for Nico: the page looks and behaves exactly as before, apart from the new wording. `npm test` and the smoke test are green in CI.

## Wave 1: four streams in parallel

**A. Juggler** (roadmap 4; Opus). This ports sani.js's motion model; it does not fork the repo. sani.js's rAF delta clock and its `siteswap.js` dependency are dropped, and its MIT notice goes in the file header.

`src/view/juggler.ts`, pure, 100% lines:
- `jugglerFrame(segments, now, layout)` returns one entry per ball: `{ ball, x, y, held: Hand | null, progress, flash }`, plus scene bounds.
- `held` and `progress` exist so hands and clubs can be drawn later without reshaping the output. Club spin would be a function of `progress` and height.

Motion:
- Each throw event owns `[t, t + flight)`. The ball is airborne for `air = flight − d`, then rides a scoop in the catching hand for `d`, from the hand's catch point (outer) to its throw point (inner). It arrives exactly at the next throw.
- `d = min(dwell × catching hand's pulsesPerBeat, maxDwellShare × flight)`.
- The catching hand is `cross ? 1 − hand : hand`, the same as the catch event's `hand`.
- Apex = `g·air²/8` (SPEC §4.1, MATH §7).
- Before a ball's first throw at or after pulse 0, it sits held at that throw point. The ladder draws nothing before 0, and the two views must agree (SPEC §7.1).

Switches follow the carry-over rule above: a carried ball moves without a jump from its old flight into its new throw; an unmatched old ball lands and vanishes; an unmatched new ball appears held. Scene bounds fit the larger of the old and new segments across a switch, so the scale doesn't jump.

Flash: a cross flight landing on a coincident pulse flashes over `[land − d, land + flashPulses)`, centred on the clap.

Tests:
- At every catch event, the ball is at the catching hand's throw point within one radius (SPEC §7.6).
- Apex height equals `g·air²/8`.
- A cross ends at the other hand.
- Positions are continuous across the period wrap and at large `now`.
- Before the first throw, balls are held.
- In a two-segment switch with a full `carry` (`3` → `441`, and `3` → `3` at a new tempo), the ball count on screen stays 3 and no ball jumps: a carried ball's position is continuous across `startTime`. With a ball-count change (`3` → `4`, `4` → `3`), the count never exceeds the larger of the two.
- `2 2x 2` / `2x 2` at 3:2 flashes at 6 − ε and 6 + ε.
- `2` / `2` at 3:2 never flashes, and neither do `3`, `441` and `97531`.

`src/app/juggler-canvas.ts` and `mountJuggler` draw balls only, above the ladder. A vanilla `2` is a small toss.

Check for Nico: `3`, `441` and `2 2x 2` / `2x 2` at 3:2 juggle in time with the sound; the 3:2 exchange flashes on the clap.

**B. Player and fix state, logic** (roadmap 5, logic half; Opus). Pure where possible, 100% lines.
- Player: queued changes (pattern, ratio, tempo, a restored hash) land at the next cycle boundary as a new segment, with no restart and no click (SPEC §5.5, §7.4). It also covers tempo changes, pause, resume, scrub while paused, and `pending`. B owns every edit to `player.ts` in wave 1.
- `carryOver(old, new, boundary)` in `src/core`, filling `Segment.carry` for every switch the player queues.
- `src/core/fixes.ts`, `fixesFor(input, errors)`, returns up to three fixes, each of which must validate (SPEC §4.2):
  - Up to three nearest valid patterns by edit distance. No swap: a swap keeps the set of landings, so it never repairs a collision (MATH §3).
  - For a fractional count, the one-digit change that makes it whole: smallest change that validates, then lowest position, then raising over lowering (`12` → `22`).
- Validation detail for highlighting: all errors, not just `errors[0]`, plus the digit indices each error involves. Structured data only; the words belong to E.
- `brokenFrame(flights, errors, segments, now, view)` in `src/view/ladder.ts`: the ladder frame of an invalid pattern, with colliding flights flagged.

Tests:
- `432` and `510` name the right colliding throws; `2x 2 2` / `2 2x` names its off-grid landing pulses (SPEC §7.3).
- `12`, `21`, `43` and `4441` get a valid one-digit fix (SPEC §7.2), `12` → `22`.
- `carryOver`: `3` → `441` carries every ball (including the flight landing exactly at the boundary); `4` → `3` is one-to-one, three carried and one unmatched; `3` → `51` leaves balls unmatched without error; a tempo change between two `3`s carries every ball.
- Every offered fix validates.
- A two-segment switch keeps `now` continuous across a tempo change.

Check for Nico: the named tests pass in CI. The audible part arrives with E.

**C. Mapping and sound, logic** (roadmap 6, logic half; Sonnet). Pure functions and sound-side methods only; C never edits `player.ts`.

The Mapping grows to every field in SPEC §4.3:
- presets (height→drum, height→pitch, ball→pitch), with "custom" detection
- the sound for each height
- pan and gain for each hand
- catches
- cross accent and downbeat sound
- crossings filter
- downbeat pad

C also writes:
- `padHitsAt(cyclePulse, mapping)` and `filterCutoff(crossings, mapping)`
- `sound.setMaster(volume)` and `sound.setFilter(hz)`
- pad instrument loading behind the existing factory shape: preloaded, silent before load
- `src/app/hash.ts`: AppState ↔ `#v1.…`, round-trip and junk tests.

A Mapping edit takes effect at once, from the next look-ahead window, not at the next cycle.

Check for Nico: the hash round-trip and preset tests pass in CI.

**D. About and README** (roadmap 7, content half; Sonnet).
- `mountAbout` implements SPEC §4.4: three short sections; the bibliography parsed from `BIBLIOGRAPHY.md` at build time by a hand-written parser; credits for sani.js, smplr and L6; a link back (to the last state hash) and to the repo. Written in the chosen voice.
- The existing README gains the math in brief, how to run it, and the licence list.

Check for Nico: https://anomatom.com/#about reads well, and every link opens.

## Wave 2: three streams in parallel

**E. Knob panel and fix-state UI** (roadmap 5, UI half; Opus). Needs B.
- The panel follows SPEC §4.1's order:
  - digit buttons, `x` and backspace
  - ratio chips and steppers up to 9:8
  - tempo for both hands
  - swap two sites
  - play, pause, and a scrub slider while paused
  - volume, via `sound.setMaster`
  - the sound panel button and the About link
  - the "next cycle" indicator from `pending`
- Fix state per SPEC §4.2:
  - warning-coloured digits from B's indices
  - every message, written in `copy.ts` in the chosen voice
  - the fix buttons
  - colliding flights drawn in the warning colour, and the broken pattern greyed above the playing one
- The accent mark on the strip at coincident cross landings (SPEC §7.3).
- Phone layout: the panel folds under a button.
- Space keeps toggling play from anywhere (PR 9). Any new control that wants Space (the slider, a select) gets an explicit exemption in the one handler, and the PR says so.

Check for Nico: a smoke test of every knob, plus `432` showing its collision and its fixes.

**F. Sound panel and share link UI** (roadmap 6, UI half; Sonnet). Needs C.
- The drawer, with one control per Mapping field, reset to preset, and copy share link.
- F wires the Mapping into `player.ts` (live edits, pad hits at cycle start, filter cutoff from crossings). It is the only stream editing `player.ts` in wave 2.
- F fills `mountShare`: restore from the hash on page load, `replaceState` (debounced) on every store change, the `hashchange` listener for a pasted link, and the last state hash kept in the store for About's back link. Wave 0's `route()` decides play versus About; `mountShare` handles only the state.

Check for Nico: change three sound fields, copy the link, open it in a new tab, and everything matches (SPEC §7.5).

**G. Done-means sweep** (roadmap 7, ship half; Sonnet). Starts when E and F are close.
- Playwright headless on Chromium, WebKit and Firefox for SPEC §7 items 1-5.
- The §7.6 timing test.
- About links checked for well-formed hrefs only. Live link checks are Nico's.
- A checklist for Nico's iPhone Safari pass.
- Fixes go back to the stream that owns the file.

Check for Nico: the iPhone checklist.

## Merge order

1. Wave 0, then checkpoint.
2. A, B, C and D, each as it goes green (C's hash and D's About share only `route()`, frozen in wave 0), then checkpoint.
3. E and F.
4. G.

## Down the road (not v1; A's output shape allows it)

- Hands, then clubs, drawn from `held` and `progress`.
- A 3D juggler you can orbit around: issue #7, P3.
- The robot: anomatom as a polyphonic juggling robot, one view the juggler and one the drummer at a kit. Four limbs, each on its own grid, means `Hand = 0 | 1` becomes a limb index; the grid model already describes limb independence.

## Rulings (governor)

Dated 2026-10-29.

- Colours: `src/view/colours.ts` `ballColours(segments)` is the one colour rule; the ladder and the juggler (A) both read it. Uncarried new balls avoid every colour of the previous segment.
- Segments are never dropped in v1 (B).
- Segment boundaries: B builds segments with `endTime === next.startTime`, at a whole pulse of the old segment. `carryOver` links adjacent segments only; a flight longer than the next segment (e.g. `97531` → `3` → another switch) is drawn by the ladder but its carry is not followed across two switches, accepted for v1.
- `Bar.colour` is set by `ballColours`; B's `brokenFrame` fills it too.
- Browser-only modules are named `*.browser.ts` and excluded from coverage (C's pad loading).
- `soundPanelOpen` lives in `AppState`, set by E, read by F, never in the hash (C's `hash.ts` encodes pattern, ratio, bpm and mapping only).
- D's bibliography parser lives at `src/view/bibliography.ts` (pure, covered by the `src/view/**` glob).
- Wave 1 per-task review is replaced by one review per stream at its end, to save tokens (Nico, 2026-10-29).
- E: Left/Right arrow keys move across the ratio chips (shipped in the wave 0 follow-up; E keeps it when rebuilding the panel). Labels read "Pattern", with a two-entry glossary under the panel; E keeps both.
- 2026-10-29, C: `Mapping.byBall` (per-ball sample list, used by the ball-to-pitch preset) is accepted beyond SPEC §4.3; the preset name is derived by `presetOf`, never stored. F wires: `sound.preload(mapping)` on every mapping change, `sound.setMaster(volume)` and `sound.setFilter(filterCutoff(crossings, mapping))` on change, and `sound.playPad(mapping.pad.instrument, padHitsAt(cyclePulse, mapping, cyclePulses), time, pulseLen)` at each cycle start. Pad voices and `FILTER_FULL_CROSSINGS` await Nico's ear.
- 2026-10-29, A: a ball waiting for its first throw sits at its hand's catch point and rides the scoop in over the dwell before that throw (not at the throw point), so two balls waiting in one hand never overlap; physics scale and `minRadiusPx` stay, and Nico judges the 3:2 scale at the checkpoint (alternatives: a taller region, or a compressed vertical axis).
