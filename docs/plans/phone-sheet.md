# Phone sheet and first minute

Status: wave 1 merged 2026-10-29 (PRs 25 C, 26 B, 27 A); awaiting Nico's checkpoint.

Source: the "iPhone-first play view" boards 2a, 2b and 3 on the design canvas https://claude.ai/artifact/6DnKUCfmbQB4tYpM43B1Jq (Nico chose 2 + 3 over the keypad instrument, 1a/1b). Spec: `docs/SPEC.md` stays binding on behaviour; this plan changes layout only, except where a stream says otherwise. Process as in `docs/plans/v1-parallel.md` (Roles and process), with: governor Opus, frugal on tokens; one review per stream at its end; merge on green CI without asking.

## Look (all streams)

From the mocks. Ground `#0e1013`, surface `#171a20`, raised `#20242c`, rule `#2a2f38`, text `#e6e8ec`, secondary `#c9ced8`, muted `#8b93a1`, accent `#f0c33c` (Play, selected chip, tab underline), valid `#8fd3a8`, warning `#ff9f43`. Type: Unbounded 700 for the wordmark, IBM Plex Sans for UI, IBM Plex Mono for patterns and numbers, from Google Fonts (OFL fonts, not code; system fallbacks). Touch targets 44 px or more. Stream A defines these as CSS custom properties in `src/style.css`; B and C use the names A publishes there (`--ground`, `--surface`, `--raised`, `--rule`, `--text`, `--text-2`, `--muted`, `--accent`, `--valid`, `--warn`, `--font-ui`, `--font-mono`, `--font-mark`).

## Contract frozen in this plan's PR

`AppState.sheetTab: 'pattern' | 'rhythm' | 'sound' | null` (null = sheet closed). UI state, never in the share hash. B sets it to `'pattern'` from "Make your own"; A owns everything else about it and may retire `soundPanelOpen` in favour of `sheetTab === 'sound'`.

## Wave 1 (parallel, one worktree and PR each)

**A · Sheet** (Opus). Owns `src/style.css`, `main.ts` layout markup, `mount-knobs.ts`, `mount-sound-panel.ts`, their CSS.
- Phone (narrow) layout per 2a: wordmark and About at top, juggler large, ladder under it, bottom sheet. Closed sheet: grab handle; a summary button (pattern in mono, "N balls · B bpm" in valid colour) that opens the Pattern tab; Play/Pause 64 px accent circle; tabs Pattern · Rhythm · Sound. Open sheet per 2b: grows up, juggler and ladder shrink, selected tab underlined in accent; handle drag or tap and Escape close it.
- Pattern tab: pattern input(s), digit buttons, x, backspace, Swap, validity, fix state and fix buttons (SPEC 4.1 items 1, 4; 4.2). Rhythm tab: ratio chips 1:1 3:2 4:3 5:4 and More (reveals the steppers), tempo as a slider with the big bpm readout and "Hand 1 · X bpm / Hand 2 · Y bpm" under it, master volume. Sound tab: the existing sound panel's content.
- Wide (desktop) layout: same parts, sheet docked as a right-hand column, always open on a tab.
- Backlog fix while in the file: Enter in the tempo box commits.
- Done means: on a 390×844 viewport the closed sheet matches 2a and the Rhythm tab matches 2b (screenshots); every existing e2e passes, updated for the new structure where it must be; SPEC §7 items still hold.

**B · First minute** (Sonnet). Owns new `src/app/first-minute.ts` (pure, 100% lines, added to `vitest.config.ts`), `src/app/mount-first-minute.ts`, its CSS, its copy, its tunables, one mount line and one region in `main.ts`.
- Shows when the page opens with no state in the hash (About route excluded). Per board 3: one line of copy ("I juggle a pattern and play every throw as a drum. Pick one."), preset cards 3 · 441 · 531 · 97531 (2×2) and "2 2x 2 / 2x 2" at 3:2 (full width, ratio badge in accent), each with a short name; "Make your own" and Play/Pause at the bottom. While it shows, the ladder and the sheet are hidden (an `is-first-minute` class on `#app`).
- Tapping a card loads that pattern and ratio into the store and starts playing (the tap is the user gesture iOS needs); the playing card gets the accent outline and "· playing". "Make your own" leaves first minute and sets `sheetTab: 'pattern'`. Leaving never stops playback. Any later visit with a hash skips it.
- Done means: unit tests for the model; an e2e that opens `/`, taps 441, sees events scheduled, taps "Make your own" and sees the play view; screenshot at 390×844.

**C · Sound backlog** (Sonnet). Owns `src/sound/*` and `src/app/share.ts`; touches no layout.
- One TR-808 download shared by both hands (today one DrumMachine per hand in `tr808.ts`).
- Per-hand pan and gain through a GainNode and StereoPannerNode in `drum-sound.ts`, so changing them never reloads the kit.
- The nested `lastStateHash` set re-runs listeners once per shared change: make it one change.
- Done means: unit tests with fakes proving one load for two hands and no reload on pan/gain change; coverage thresholds unchanged or raised.

Merge order: C, then B, then A (A rebases last over B's `main.ts` line). Then checkpoint: governor posts Nico's smoke test.

## Rulings and backlog

- C: `Store.derive` added to `state.ts` (governor ruling) instead of share wrapping `store.set`. `dm.json` is still fetched once per hand; samples once.
- A: Stop and the time slider show only while paused (SPEC §4.1 lists play/pause and the slider, no Stop while playing). `soundPanelOpen` retired for `sheetTab`. Hand bars added under the juggler.
- Backlog from the PR 27 review: the About "?" glyph is inline in `main.ts`, not in `copy.ts`; the ghost-strip label in `mount-ladder.ts` duplicates `summary()` in `sheet-model.ts`; phone landscape under 760 px likely overflows (juggler min 120 px + ladder + 62dvh sheet); tabs lack Home/End keys.
