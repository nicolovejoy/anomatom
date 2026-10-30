# v2: sharing, kits, passing

Status: wave 1 started 2026-10-30 (governor Fable, session 1191; Nico: "carry on", so the design calls below are the governor's, open to correction at the checkpoint). Drafted 2026-10-29; held for the model rethink, which shipped as `docs/plans/model-rethink.md` and `docs/plans/lanes.md` (parts, N lanes, a `PartVoice` per part with a `kit` field). Nico decided: share link always in reach, a few drum kits to choose from, then straight to passing (not independent layers first). Process as in `docs/plans/lanes.md`: one worktree and branch per stream, implementers never spawn agents, every stream keeps `npm run typecheck`, `npm test` (100% lines per file in `vitest.config.ts`), `npm run e2e` and `npm run build` green and returns screenshot paths; one fresh-eyes review per stream; the governor merges on green CI without asking; checkpoint smoke after the wave, run by the governor headless first (Nico has no time for smokes this week).

## Wave 1: polish (three parallel streams, small)

### Rulings (governor, 2026-10-30)

1. **Sample names are roles.** The Mapping keeps naming samples in the TR-808 vocabulary (`KIT_SAMPLES`): `kick`, `snare`, `hihat-close`, ... are roles. Each kit carries a table role → its own sample name, applied when a hit reaches the browser kit; a role the kit lacks borrows the nearest (the table says which). So presets, the panel's dropdowns, `perHeight`, `byBall` and the hash are unchanged by kits; only `PartVoice.kit` changes. The hash already carries `kit` per part and `KIT_IDS` already validates it, so an old link without one is TR-808 as it was.
2. **The Kit select sets every part.** One select, as today; it writes every part's `kit`. A per-part kit stays in the model for passing (juggler 1 on one kit, juggler 2 on another) but has no UI this wave.
3. **Space.** Space is kept by a `select`, a text or number input and a textarea, nowhere else. A `select` blurs itself after `change`, so Space plays and pauses again at once. `[data-keeps-space]` on the whole Sound panel goes.
4. **Short links.** `#531` and `#531@140` for one vanilla pattern at 1:1 with the default mapping and default phases; `#3:2/2-2x-2/2x-2` (`-` for the space, `@bpm` optional) for two hands at a ratio, same conditions. Anything else writes `#v2.` as today. The hash is written in the shortest form that round-trips. Stream S records the grammar in `src/app/route.ts` before code and tests every first-minute preset with two parts through it; three or more parts always take `#v2.`.
5. **Share button.** In the head row, between the summary and Play; on a phone it is an icon with an `aria-label`, on a wide screen the icon too. `navigator.share` with `{ url }` where it exists, else the clipboard with a "Link copied" status next to it; the Sound tab's copy button goes.
6. **Landscape with the sheet open (follow-up, from the PR 50 review).** At 667×375 the open sheet column leaves about 70 px for the panel; a smaller head row while landscape is open is the suggested fix.

### Streams

**F · Fixes** (Sonnet). Owns `mount-knobs.ts` key handling, `mount-sheet.ts`, `sheet-model.ts`, `mount-ladder.ts` label, `main.ts` About glyph, `style.css` and `sheet.css` landscape, `mount-sound-panel.ts` only to drop `data-keeps-space` and add the blur after `change`.
- Ruling 3. e2e: open the Sound tab, change the Kit or a preset select, press Space, playback toggles.
- The PR 27 review backlog in `docs/plans/phone-sheet.md`: About "?" into `copy.ts`; the ghost-strip label via `summary()` in `sheet-model.ts`; phone landscape under 760 px (screenshot 667×375: juggler, ladder and the closed sheet all on screen, no page scroll); Home/End on the tabs.
- Done means: unit tests for the sheet-model changes; the e2e above; screenshot 667×375.

**K · Kits** (Opus). Owns `src/sound/*` (rename `tr808.ts` to `drum-machine.ts` or add beside it), the Kit select in `mount-sound-panel.ts` and `sound-panel-model.ts`, the kits section of `tunables.ts`, kit names in `copy.ts`.
- Before code: open the licence of each kit in smplr's sample source (https://github.com/smpldsnds/drum-machines, and the per-kit README or source it names); ship only kits whose samples may be redistributed; record the result and the URLs opened in this file under Rulings. Candidates: TR-808 (default), Casio RZ-1, LinnDrum LM-2, MFB-512, Roland CR-8000 (smplr ids `TR-808`, `Casio-RZ1`, `LM-2`, `MFB-512`, `Roland CR-8000`).
- Ruling 1: a `KIT_ROLES` tunable, one table per kit, role → sample (read each kit's `dm.json` once to fill it; every TR-808 role has an entry in every kit, borrowing where the kit lacks one). `KIT_IDS` lists the shipped kits. The browser kit factory takes the kit id, keeps the one-loader-per-context queue, caches a loaded kit per context and kit so switching back is silent-free.
- Ruling 2: the Kit select writes every part's `kit` through one action or mapping edit; `presetOf` ignores `kit` when deciding the preset name only if that is how it already works (check; record).
- Done means: unit tests with fakes for the role tables (every kit covers every role), the factory cache, and the edit; a 3-part link plays on a second kit (unit test on `hitFor` and the kit resolution); e2e with the stubbed CDN (`e2e/sound-download.spec.ts` pattern): switch kit while playing, hear from the next hit, no error.

**S · Share in reach** (Sonnet). Owns `src/app/share.ts`, `mount-share.ts`, `route.ts`, `hash.ts` (the short grammar only), the share button in the head row (`mount-knobs.ts` head markup and its CSS), removal of `#sp-copy` from `mount-sound-panel.ts`, share copy in `copy.ts`.
- Rulings 4 and 5. Old `#v1.` and `#v2.` links still open; `#about` untouched.
- Done means: unit tests round-trip every two-part first-minute preset through the short form and prove a changed mapping or phase falls back to `#v2.`; e2e taps share with `navigator.share` absent and reads the clipboard (Chromium); screenshot of the head row at 390 wide.

Merge order: F, K, S (S rebases over F's head-row and sound-panel edits; K and S do not meet in the hash). Then checkpoint: governor smokes headless, then posts a short smoke for Nico.

## Wave 2: passing

Two or more jugglers on one clock, throwing to each other. The musical hook: passes are call and response between two drum kits.

### Decisions to make first (governor writes them into `MATH.md` §9 before any code; Nico reads it)

1. **Notation.** Synchronous passing siteswap as passers write it: `<3p 3|3p 3>`, one sequence per juggler between `|`, `p` marking a pass; with three or more, `p2`, `p3` name the target. v2.0: every juggler vanilla (1:1), all on the same beat. Per-juggler ratios (A at 3 against B at 2, passing) are the anomatom twist, and come in a later wave, once the 1:1 version is solid.
2. **Which hand a pass lands in.** Jugglers throw right hands together; whether an odd or an even pass goes straight or diagonal is a convention, verified against Juggling Lab for `<3p 3|3p 3>` (every-others), `<3p|3p>` (ultimates) and `<4p 3|3 4p>` before it is written down. Getting this wrong makes every picture wrong.
3. **Validity and ball count.** Per juggler, per hand: the pulses on which balls land are exactly the pulses on which it throws, counting passes landing from partners. Ball count = sum of all heights over the period, whole. Fix suggestions reuse the edit-distance search over the joined sequence.
4. **Schedule.** `Event` gains `juggler: number` and `pass: boolean`; ball ids stable across jugglers. Everything single-juggler is the `juggler: 0` case, so v1 patterns keep one code path.
5. **Share link.** Short form `#<3p 3|3p 3>` (URL-escaped); the stream S grammar must leave room for it.

### Streams (after the decisions are merged, frozen as contracts)

- **P1 · Core** (Opus): parse, validate, ball count, fixes, Schedule for N jugglers; `MATH.md` §9 cases as tests; 100% lines.
- **P2 · Stage** (Opus): the juggler view draws N figures side by side (two first, three must fit at 390 px), passes as long arcs between them, the juggler motion model in world coordinates (x, y, z) projected to 2D, so a 3D renderer can replace the projection later.
- **P3 · Ladder and sound** (Sonnet): one ladder strip per juggler, passes drawn between strips; per-juggler kit and pan (juggler 1 left, 2 right), a pass accented in the Mapping.
- **P4 · Knobs and first minute** (Sonnet): pattern input accepts passing notation, ball count and fix state for it; a passing card in first minute (`<3p 3|3p 3>`, 6 balls, two jugglers).

State-graph transitions between passing patterns, and pattern generation, stay in the roadmap's v2 list for after this.

## 3D juggler (#7): after passing (Nico confirmed 2026-10-29)

Decided: after. Passing changes what the stage must show (two figures, passes between them) and is the musical feature; 3D is presentation. Doing 3D first means building a single-juggler 3D scene and reworking it for N jugglers right after. P2's world-coordinate model makes 3D a renderer swap afterwards (three.js is MIT; watch bundle size and phone frame rate). The case for before: depth makes passes easier to read. P2's 2D side view should show whether that matters.
