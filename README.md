# anomatom

A browser demo that juggles a siteswap pattern on screen and plays it as music at the same time, from one clock. Type a pattern, see whether a juggler could do it, and if so hear it and watch it.

The idea: a siteswap ladder diagram is a piano roll. Each throw is a note that starts when the ball leaves a hand and ends when it lands; throw height is note length; left and right hands are two voices. Two hands at different tempos are a polyrhythm by construction, and the rule that says "these balls do not collide" is the rule that says "these notes do not collide". One data structure drives both the animation and the sound, so what you hear is provably what you see.

Target sound: ambient, afrobeat, world percussion, trance. Open source, MIT, static site, no server, no account.

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

CI runs the same three on every push.

## Origin

A conversation between Nico Lovejoy and Charlie about vibe-coding music, and the symmetry between polyrhythm rules and juggling math. Juggling theory from Buhler, Eisenbud, Graham, Wright and those who followed; see the bibliography.
