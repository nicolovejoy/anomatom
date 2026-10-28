# jugglebeat — specification

Status: v1 spec, 2026-10-28. Owner: Nico. This file says what the app does and how we know it is done. How it is built is for the PRs; `CLAUDE.md` holds the conventions.

## 1. Who it is for

1. Nico and Charlie, exploring the juggling/polyrhythm symmetry by ear and eye.
2. A visitor sent a link: musician, juggler, or math person. They should get the idea in under a minute with no reading.
3. Us later, when it grows to several jugglers.

## 2. What a user can do (v1)

1. Enter a siteswap for each of two hands and a tempo ratio between the hands.
2. See at once whether the pattern is valid, and if not, which throws collide and up to three one-click fixes.
3. Press play and, from the same clock, watch the juggler, watch the ladder strip scroll like a piano roll, and hear the pattern as drums.
4. Turn the knobs (pattern, ratio, tempo, swap two sites) while it plays; changes land on the next cycle.
5. Open the sound panel and change how throws become sounds; share the result as a URL.
6. Read the About page: the idea in a few paragraphs and the bibliography.

Not in v1: more than one juggler, pattern generation, MIDI in, live-coding the mapping, Ableton or any DAW link, accounts, saving beyond the URL hash.

## 3. Definitions

- **Pulse**: the smallest time unit, the LCM grid of the two hands. In music, the tatum.
- **Hand grid**: each hand throws on its own evenly spaced beats. A ratio of 3:2 means hand 1 has 3 beats and hand 2 has 2 in the same span; the pulse grid has 6.
- **Siteswap**: at 1:1, one vanilla siteswap as jugglers write it (shared beat, alternating hands, odd digits cross). At any other ratio, one sequence per hand in one-hand counting: each digit is the number of that hand's own beats the ball is in the air, and a throw crosses only when marked `x`. See `MATH.md` §6.
- **Cycle**: the span after which the pattern repeats: lcm of (period × pulses-per-beat) over both hands. Cycle lines and knob changes land here.
- **Period**: the span after which the pattern repeats with the same ball in each throw; a multiple of the cycle (three cycles for `441`). The Schedule covers one period. See `MATH.md` §6.
- **Valid**: the ball count is whole, and for each hand the pulses on which balls land in it are exactly the pulses on which it throws, no pulse twice; a cross throw must land where both grids coincide. See `MATH.md` §2 and §6.
- **Event**: a throw or a catch at an integer pulse, with hand, ball id, height and whether it crosses.
- **Schedule**: the complete list of events for one period, with stable ball ids. The renderer and the sound read only the Schedule and the clock.
- **Mapping**: the rules that turn an Event into a sound. The sound panel edits the Mapping; nothing else does.

## 4. Screens

### 4.1 Play view (the default)

Layout top to bottom: juggler, ladder strip, knob panel. On a phone the knob panel folds under a button; the two views stay.

Juggler: side view, two hands, N balls in stable colours. Apex height grows with the square of the throw height. A cross throw that lands on a pulse where both hand grids coincide flashes.

Ladder strip: time runs left to right, a fixed playhead, one lane per hand. Each flight is a bar from throw to catch in its ball's colour; cross flights are diagonals between the lanes. Tick marks show both hand grids at different weights so 3:2 reads at a glance. A thin vertical line marks each cycle start.

Knob panel, in this order:

1. Siteswap, hand 1 and hand 2: text input plus digit buttons 0-9, `x` and backspace. The validity indicator sits beside each input. At 1:1 only one input shows and takes a vanilla siteswap; at any other ratio both show, with a one-line hint that a digit counts that hand's own beats (`MATH.md` §6).
2. Ratio: chips 1:1, 3:2, 4:3, 5:4, and two steppers for anything else up to 9:8.
3. Tempo: bpm of hand 1's own beats, 40-240; hand 2 follows from the ratio. Shown for both hands. At 1:1 a hand beats every other vanilla beat, so the vanilla beat runs at twice this number.
4. Swap two sites: tap two digits in one hand's input, then Swap. Disabled unless two are chosen.
5. Play / pause, and a time slider across the cycle that scrubs when paused.
6. Master volume.
7. Sound panel button (opens §4.3).
8. About link.

Live changes: a knob changed during play takes effect at the next cycle boundary. The indicator shows "next cycle" until then.

### 4.2 Fix state

When a pattern is invalid:

- The input shows the colliding digits in the warning colour; the message names every throw in the group: "throws 2 and 4 both land on beat 3", "throws 1, 2 and 3 all land on beat 5".
- The ladder strip still draws, with the two colliding flights in the warning colour meeting at the landing pulse.
- Play is disabled; the last valid pattern keeps playing if it was playing, and the strip shows the broken one above it, greyed, so the user can compare.
- Up to three fix buttons under the input, each a full pattern the user can read before clicking: Swap (the swap property on the colliding pair), and the nearest one or two valid patterns by edit distance. A fractional ball count gets the single-digit change that makes it whole.
- No automatic correction, ever.

### 4.3 Sound panel

A drawer over the play view. Every control edits one field of the Mapping. Defaults are the v1 mapping in §6.

1. Kit: TR-808 (only option in v1; the dropdown exists so a second kit is one entry).
2. Preset: Height to drum (default) · Height to pitch · Ball to pitch. Choosing a preset rewrites the fields below; editing a field afterwards shows "custom".
3. Per height 1-9: which sound (dropdown of the kit's sounds, or none).
4. Per hand: pan (-1 to 1), gain (0 to 1).
5. Catches: audible on/off; which sound.
6. Cross-throw accent: velocity boost (0 to 40); downbeat sound (clap, cowbell, none).
7. Crossings to filter: on/off; cutoff range low-high in Hz.
8. Pad on downbeat: on/off; instrument (Mellotron, Soundfont pad); chord (a short list: Dm9, Am7, Cmaj7, F6/9, one open fifth).
9. Reset to preset. Copy share link.

The share link encodes pattern, ratio, tempo and the whole Mapping in the URL hash. Opening such a link restores all of it and does not auto-play.

### 4.4 About

Static page. Three short sections: the idea (ladder diagram = piano roll; polyrhythm = two hand grids), how the sound is made (one clock, Events, the Mapping), and the bibliography from `BIBLIOGRAPHY.md` with links. Credits: sani.js, smplr, and the L6 repo whose audio code this reuses. Link back to the play view and to the repo.

## 5. Behaviour rules

1. One clock. The audio clock is the reference; the picture reads it every frame. There is no second timeline.
2. Pulses are integers until the last step. Seconds appear only when scheduling audio and drawing.
3. Pure core. Validity, the Schedule, and the Mapping are functions of their inputs with no browser dependency, tested without one.
4. Nothing sounds before the first user gesture. Samples preload on page open; a press before they arrive is silent, never a stand-in tone.
5. Pattern and tempo changes land on the next cycle boundary, which is also where a transition between patterns is legal.
6. Every tunable (colours, sizes, ranges, default mapping) lives in one constants module.
7. Reader-facing strings live in one copy module.
8. The URL hash is the only persistence.

## 6. Default mapping (v1)

| Event field | Drives | Default rule |
| --- | --- | --- |
| `kind = throw` | a hit | every throw sounds; catches silent |
| `hand` | voice and pan | hand 1: low voices, pan -0.6; hand 2: high voices, pan +0.6 |
| `height` | which drum and duration | 1-2 closed hat; 3 snare or rim; 4 low tom; 5+ kick. Duration = height × pulse length |
| `cross` | accent | +20 velocity; on a coincident pulse a clap |
| `ball` | a small variation | each ball a fixed sample variant or detune within its drum |
| crossings count (per pattern) | one global parameter | low-pass cutoff: more crossings, brighter (off by default) |
| cycle start | a pad | off by default |

## 7. Done means

v1 is done when all of these hold in Chrome, Safari and Firefox on a laptop, and Safari on an iPhone:

1. `3`, `441`, `531`, `51`, `5551`, `97531` validate and play with a 1:1 ratio; the ladder and the juggler agree with hand-drawn ladder diagrams for each.
2. `12`, `21`, `43`, `4441` report a collision naming the right throws and offer fixes that are themselves valid.
3. `2` on each hand at 3:2 validates and plays as two fountains, and the strip shows 3 against 2; `2 2x 2` / `2x 2` validates with both crosses landing on the downbeat and the strip shows the exchange with the accent, while `2x 2 2` / `2 2x` is rejected naming the landing pulses. This is the demo as pitched. (Notation: `MATH.md` §6 and §8.)
4. Changing tempo or pattern while playing never clicks, drops a ball on screen, or stutters the strip; the change lands on the next cycle.
5. A share link round-trips: open it in a fresh tab and the knobs, sound panel and pattern match.
6. Audio events land within 2 ms of their scheduled time (measured from the audio clock in a test), and the drawn ball position at a catch is at the hand within one ball radius.
7. The About page renders the full bibliography with working links.
8. Unit tests cover the core at 100% lines; one headless browser smoke test loads the page, presses play, and sees the first Event fire.

## 8. Open questions

1. Vanilla shell or React for the knob panel. (Nico, at scaffold.)
2. Hand ratio when siteswap periods do not divide the ratio: cycle = lcm, confirmed, but check that the strip reads well for, say, period 3 on a 2-beat hand.
3. Does Charlie want a hand in the sound presets?
4. Mocks as a Design artifact: before or after the first audible milestone?
