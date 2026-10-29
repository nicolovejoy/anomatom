# anomatom

A browser demo that juggles a siteswap pattern on screen and plays it as music at the same time, from one clock. Type a pattern, see whether a juggler could do it, and if so hear it and watch it.

The idea: a siteswap ladder diagram is a piano roll. Each throw is a note that starts when the ball leaves a hand and ends when it lands; throw height is note length; left and right hands are two voices. Two hands at different tempos are a polyrhythm by construction, and the rule that says "these balls do not collide" is the rule that says "these notes do not collide". One data structure drives both the animation and the sound, so what you hear is provably what you see.

Target sound: ambient, afrobeat, world percussion, trance. Open source, MIT, static site, no server, no account.

## The math in brief

Full treatment, with citations and worked cases, in `docs/MATH.md`.

- **Siteswap.** A pattern is a sequence of non-negative integers. The throw on beat i lands on beat i + t. Odd throws cross to the other hand, even throws stay; 0 is an empty hand, 2 is a hold.
- **The validity test.** A sequence is a pattern iff the landing beats (i + t mod n) are all distinct. Two equal landings are a collision: two balls arriving in one hand at once.
- **Ball count.** The number of balls is the mean of the digits at 1:1, and the per-hand means summed at other ratios; a count that is not a whole number is invalid. `441` has 3 balls, `12` has 1.5 and is rejected.
- **Hand ratio.** Each hand runs its own evenly spaced grid. At 3:2, hand 1 makes 3 beats while hand 2 makes 2, and they coincide once per span. A throw is legal iff it lands on a beat of the catching hand; a cross is legal only where both grids coincide, and that pulse is the downbeat.
- **Pulses and the cycle.** Everything is an integer number of pulses, the common grid of the two hands. The cycle is the least common multiple of each hand's period times its pulses per beat. Seconds appear only when a sound is scheduled or a frame drawn.

## Documents

- `docs/SPEC.md` — what the app does and how we know it is done
- `docs/MATH.md` — the juggling theory the app rests on, with the timing rule for polyrhythmic hands
- `docs/ROADMAP.md` — build order, one PR per step
- `docs/BIBLIOGRAPHY.md` — papers and prior art, also shipped on the About page
- `CLAUDE.md` — conventions for building this repo with Claude Code

Design doc with the full discussion: https://claude.ai/artifact/Svd3Vd6dcB8DkfGZzmSRiQ

## Develop

Node 20. Then:

    npm install
    npm test          # vitest with coverage; src/core is held at 100% lines
    npm run typecheck
    npm run dev       # Vite dev server

    npm run e2e       # headless browser smoke test (Playwright; Edge locally)

CI runs the same on every push, the smoke test on Playwright's bundled Chromium. Locally, `npm run e2e` needs Microsoft Edge installed; `npx playwright test --project=chromium` uses the bundled Chromium instead (after `npx playwright install chromium`).

## Licence

MIT. Dependencies must be MIT or more permissive; Apache-2.0 is allowed alongside MIT (`@playwright/test` uses it). No GPL code.

## Origin

A conversation between Nico Lovejoy and Charlie about vibe-coding music, and the symmetry between polyrhythm rules and juggling math. Juggling theory from Buhler, Eisenbud, Graham, Wright and those who followed; see the bibliography.
