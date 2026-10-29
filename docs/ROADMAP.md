# anomatom — roadmap

One PR per step, or two when a step's logic and UI are built in parallel (`docs/plans/v1-parallel.md`), merged on green CI after a review by a subagent that has not seen the branch. Each step names what a person can do at its end; that is the acceptance test, not the code.

## v1

Steps 1-3 shipped serially. Steps 4-7 run in parallel streams under `docs/plans/v1-parallel.md`, which reassigns their end states to its streams; where the two differ, the plan wins.

1. **Repo and core math.** Public repo `nicolovejoy/anomatom`, MIT. Validity, swap, ball count, crossings, and the Schedule for 1:1 and for per-hand ratios, with the worked cases in `MATH.md` §8 as tests. End state: `npm test` proves every row of that table. No UI, no sound.
2. **Clock and sound.** The one clock, the smplr instrument factory (from L6), the default Mapping. A bare page: type a siteswap, press play, hear the 808. End state: the first audible milestone; `3` and `441` sound different.
3. **Ladder strip.** The piano-roll view, playhead locked to the clock, both hand grids as ticks. End state: see and hear 3 against 2 with `2` / `2` at 3:2.
4. **Juggler.** sani.js's motion model ported to TypeScript, its scheduler replaced by our clock, the second hand grid added. End state: the demo as pitched; a visitor gets it without reading.
5. **Knob panel and fix state.** The knobs in `SPEC.md` §4.1, the collision display and fix buttons in §4.2, copy strings in one module, phone layout. End state: every "done means" item in §7 except 5 and 7.
6. **Sound panel and share link.** `SPEC.md` §4.3; the URL hash round-trip. End state: §7 item 5.
7. **About and ship.** `SPEC.md` §4.4 from `BIBLIOGRAPHY.md`, GitHub Pages, README with the math. End state: §7 item 7; a link Charlie can open.

## v2 candidates (no order, none started)

- Several jugglers and passing, with state-graph transitions between patterns.
- Pattern generation from a state (walk the graph).
- Web MIDI in: tap a pad to throw (the L6 `midi-input.ts` module is already in the tree).
- Soundfont world-percussion kit as a second palette.
- A live-coding pane for the Mapping (Strudel).
- Ableton Link or MIDI out, so Live can be the instrument.
