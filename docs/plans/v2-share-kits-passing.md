# v2: sharing, kits, passing

Status: drafted 2026-10-29, not started. On hold for a rethink of the mental model: see `docs/plans/rethink-brief.md`. Nico decided: share link always in reach, a few drum kits to choose from, then straight to passing (not independent layers first). Process as in `docs/plans/v1-parallel.md` (Roles and process) and `docs/plans/phone-sheet.md`; one PR per stream, governor merges on green CI after a fresh-eyes review, checkpoint smoke test after each wave.

## Wave 1: polish (three parallel streams, small)

**K · Kits** (Sonnet). Owns `src/sound/*`, the Kit select in `mount-sound-panel.ts`, `Mapping` and its hash encoding.
- Kit select offers the smplr drum machines: TR-808 (default), Casio RZ-1, LinnDrum LM-2, MFB-512, Roland CR-8000. Per kit, the Mapping's height-to-sound table needs a sensible default (each kit names its samples differently); presets ("Height to drum" etc.) resolve per kit.
- The kit rides in the share link; an old link without one means TR-808.
- Before building: check the sample licences of each kit in smplr's sample repo; ship only kits whose samples may be redistributed. Record the result here.
- Done means: switch kit while playing, hear the new kit from the next hit, no silence gap beyond its load; e2e with stubbed CDN.

**S · Share in reach** (Sonnet). Owns `src/app/share.ts`, `mount-share.ts`, the summary row's share button (one button in A's sheet markup), `hash.ts`.
- A share button in the closed sheet's summary row (and in the wide layout's header): `navigator.share` where it exists (iPhone gets the native sheet), else copy to clipboard with a "Link copied" status. Removed from the bottom of the Sound tab.
- Readable links: `#531`, `#531@140`, `#3:2/2-2x-2/2x-2` style for the common cases (pattern, ratio, tempo); the full encoded `#v1.…` form only when the Mapping differs from the kit's default. Old `#v1.…` links still open. Exact grammar decided by the stream and recorded here before code.
- Done means: unit tests round-trip every first-minute preset through the short form; e2e taps share and reads the clipboard (Chromium).
- Merges after K (K adds the kit to the encoding).

**F · Fixes** (Sonnet). Owns `mount-knobs.ts` key handling, `mount-sheet.ts`, `mount-ladder.ts` label, `main.ts` About glyph, `style.css` landscape.
- Space bar: today the whole sound panel is `[data-keeps-space]`, so once a select there has focus, Space never reaches play/pause. Only a select that is open, or a text field, keeps Space; after a select's `change`, Space plays/pauses again. e2e: change Kit, press Space, playback toggles.
- The PR 27 review backlog in `docs/plans/phone-sheet.md`: About "?" into `copy.ts`; ghost label via `sheet-model.ts`; phone landscape under 760 px fits without the sheet leaving the screen (screenshot 667×375); Home/End on the tabs.

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
