# anomatom

Read `docs/SPEC.md` before building anything; it is the contract. `docs/MATH.md` is the theory and the test cases. `docs/ROADMAP.md` is the build order, one PR per step. `docs/BIBLIOGRAPHY.md` ships on the About page.

## Conventions

- One PR per roadmap step; merge on green CI after a subagent review of the whole branch. Discuss the approach with Nico before each step.
- Logic modules (`src/core`, `src/sound`) are plain TypeScript: no React, no DOM, no timers. They are unit tested with fakes, as L6's `piano-sound.ts` is. `vitest.config.ts` lists the modules held at 100% lines; add, never lower.
- Pulses are integers until audio scheduling or drawing. No floating-point time in the Schedule.
- One clock: `AudioContext.currentTime`. Nothing else keeps time.
- Every tunable in `src/tunables.ts`. Every reader-facing string in `src/ui/copy.ts`.
- Audio: smplr behind the factory shape copied from L6 (`dynamic import`, per-context sample cache, preload, nearest-sample borrowing, silent before load). No synthesized stand-in tone.
- Browser tests run headless; Edge (`channel: 'msedge'`) for desktop runs. Never `--headed`, `--ui`, `--debug` or `PWDEBUG` unless Nico asks in the session. Screenshots or traces for visual checks.
- Static site, Vite. No server, no database, no accounts. The URL hash is the only persistence.
- Open source from the first commit, MIT. Dependencies MIT or more permissive; no GPL code (passist was considered and declined for this reason).

## Shared conventions (from Nico's other repos)

- **Clickable URLs.** Print full bare URLs on their own line, never a markdown link.
- **Number your questions** when asking more than one.
- **Self-contained smoke-test instructions**: exact URL, steps in order, what pass and fail look like, no reliance on earlier context.
- **No marker before a copy-paste command block**: the line above a fenced block is a plain-text label ending in a colon, never a bullet or a number.
- **No bare backslash in a command block**: quote `';'`, write one long line.
- **A review another agent must act on goes on the PR** as a comment.
- **UTC at rest, Pacific on display**, should any timestamp ever appear.
