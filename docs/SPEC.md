# anomatom — specification

Status: v1 spec, 2026-10-28; model changes for v2 marked "(v2, 2026-10-29)", from `docs/plans/model-rethink.md` and `docs/plans/model-waves.md`. Owner: Nico. This file says what the app does and how we know it is done. How it is built is for the PRs; `CLAUDE.md` holds the conventions. Where a v2 passage and a v1 passage disagree, the v2 passage holds.

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

v2, the model waves (2026-10-29). What a user can do in addition:

1. Hear any pattern, juggleable or not: Play is never disabled, and a pattern that fails the juggling predicates still sounds as a rhythm (§4.2).
2. Shift a hand's phase in pulses, which plays Clapping Music, mbira interlocks and displaced 3:2 (`MATH.md` §9.6).
3. Turn a ball count per hand on a fixed rhythm: any line of hits is a one-ball pattern, and k balls fly over the same hits (`MATH.md` §9.5).
4. Type two lines at 1:1 as `a / b`, alongside the vanilla siteswap, and use the letters `a`-`z` for heights 10-35.
5. Load presets from the sourcebook (`POLYRHYTHMS.md`), each with its source. The Euclidean generator E(hits, pulses) (`MATH.md` §9.7) is in the core and the actions from wave 1; its control in the Rhythm tab is not in the wave 2 interface list and needs a ruling before it is promised.
6. Give each hand its own voice (the new default) or keep a height preset.

Still not in v2's model waves: the mixer-style interface (`docs/plans/model-rethink.md` §12), more than two hands on screen, passing on screen, multiplex, galloped (non-isochronous) grids, MIDI, accounts.

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

v2 definitions (2026-10-29). These are the names code uses; `MATH.md` §9 states them formally, and `docs/plans/model-waves.md` "Core types" is their TypeScript. They replace "Hand grid", "Siteswap" and "Valid" above, and refine "Pulse", "Cycle" and "Event".

- **Part**: what the v1 text calls a hand. One grid, a notation unit, and its flights, decided either by the default rule from its onsets and a ball knob k, or by hand (manual digits). There are N parts, indexed from 0; today two are on screen. **"Hand" stays the reader-facing word**: copy says "hand 1" for part 0 until there is a reason to say "part" to a user.
- **Grid**: a part's evenly spaced beats on the pulse lattice, a spacing and a phase in pulses. Different spacings are a polyrhythm (3:2); one spacing at different phases is a displacement (Clapping Music, mbira). Grids are isochronous; galloped patterns are out.
- **Phase**: a shift of a whole part, grid and onsets, in pulses, from 0 to the part's period less one. A phase off the current lattice refines the lattice (`MATH.md` §9.6).
- **Unit**: the pulses one written digit stands for: the spacing in one-hand counting, 1 for a vanilla pair.
- **Pulse** (v2): the largest unit of time on which every grid's beats and every part's phase fall. Parts are kept normalised so the gcd of all spacings and phases is 1.
- **Onset**: a beat of a part on which it throws. In digits, a nonzero digit is an onset and a `0` is a beat with none. The sound is a function of onsets, parts and the Mapping only.
- **Flight**: from an onset to a later onset, in the same part or another, carrying one object; written as the digit plus `x` (two parts) or `x<n>` (part n, counted from 1) when it crosses. The flights are a map on onsets.
- **Object**: a ball; the orbits of the flight map. The count is derived, never stored: per cross group, the winding number (`MATH.md` §9.4).
- **Cross group**: parts joined by crossing flights, judged together. A part with no crosses is a group of one. "Manual" is a property of a whole group.
- **Juggleable** (replaces Valid): the flight map is a bijection on all onsets of all parts, and every flight goes forward in time. No height ceiling. A fractional mean is a sign of failing the first condition, not a third one (`MATH.md` §9.3, §9.4). Not juggleable means no balls for that group in the picture; it never means silence.
- **Juggler**: a grouping of parts, for drawing hands side by side and calling a flight between jugglers a pass. An attribute, not a constraint; nothing in validity depends on it.
- **Cycle** (v2): the lcm over parts of spacing × period in beats. It does not depend on phases.
- **Event** (v2): a throw or catch at an integer pulse with its part, ball id (none for a part in a faulted group), height (the digit), flight length in pulses and whether it crosses.

## 4. Screens

### 4.1 Play view (the default)

Layout top to bottom: juggler, ladder strip, knob panel. On a phone the knob panel folds under a button; the two views stay.

Juggler: front view, hand 1 on the left and hand 2 on the right (matching the pan), N balls in stable colours. v1 draws the balls only; the hands are where the balls are caught and thrown, drawn later along with clubs. A ball's apex height grows with the square of its air time. A cross throw that lands on a pulse where both hand grids coincide flashes.

(v2, 2026-10-29) The juggler fits its vertical axis to the longest flight in the pattern. A flight whose air time at the current tempo exceeds `HUMAN_AIRTIME_SECONDS` (about 3 s, in `src/tunables.ts`) draws dimmed with the copy "not a human throw". This is the only height ceiling, and it is presentation: it depends on tempo, so it is never part of juggleability.

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

(v2, 2026-10-29) The model waves rewire today's sheet minimally (`docs/plans/model-rethink.md` §14, option b); the mixer-style layout comes later in its own plan. Play is always on. The Rhythm tab gains, per hand, a phase stepper in pulses and a ball stepper k; on a hand in a manual cross group the ball stepper is replaced by the group's derived count and "reset". A one-line notice shows the result of the last action and clears on the next. The Pattern view accepts `a / b` at 1:1 (two lines, both at phase 0) as well as the vanilla siteswap, `x<n>` for a cross to hand n, and the letters `a`-`z` for heights 10-35. Still two hands on screen.

### 4.2 Fix state (v2, 2026-10-29)

When a cross group is not juggleable (`MATH.md` §9.3):

- The sound plays regardless. **Play is never disabled.** Every onset of every part is an event whatever the verdict; a non-juggleable pattern is still a rhythm. (v1 disabled Play here; that is reversed.)
- The faulted group is the cross group containing any fault; other groups keep their balls. The juggler draws the fault, the colliding flights in the warning colour meeting at the landing pulse, and draws **no balls for the faulted group**. The ladder strip still draws, as in v1, and balls of passing groups carry across cycle boundaries as before.
- The input shows the faulted digits in the warning colour; the message names every throw involved: "throws 2 and 4 both land on beat 3", "throws 1, 2 and 3 all land on beat 5". A flight landing where the catching hand has no onset names the landing pulse and the catching hand's next onset at or after the landing (`MATH.md` §9.3). A fractional ball count is shown before the collision it implies ("3.5 balls"), because it is the cheaper presentation of the same fault.
- Up to three fixes, now labelled **"make it juggleable"**, under a manual hand's input in the Pattern view: each a full pattern the user can read before clicking, the nearest juggleable patterns by edit distance, searched over the manual throws of the faulted group. They are **optional and never block** anything. Swap is not among them: a swap leaves the set of landings unchanged, so it cannot repair a collision (`MATH.md` §3). A fractional ball count gets the single-digit change that makes it whole: the smallest change to one digit that fixes it, then the lowest position, then raising over lowering.
- No automatic correction, ever. The one automatic change in v2 is not a correction: when a manual group's onsets change, its manual flights are dropped and the group re-derived at one ball per hand, with a one-line notice ("hands 1 and 2 reset to 1 ball each"; `MATH.md` §9.5).

The v1 rule that the last valid pattern keeps playing, with the broken one greyed above it, is removed: since a broken pattern plays, there is no last valid pattern to fall back to.

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

(v2, 2026-10-29) The preset list gains "Voice per part", the new default for a fresh state (§6), and item 4 becomes per hand: kit, sample, pan and gain. The Sound tab copy says that the sound is invariant under ball count unless the preset reads flight length.

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

v2 rules (2026-10-29):

9. Sound is never gated. Juggleability decides what the picture draws, never whether a sound plays. Every onset of every part sounds under the Mapping whatever the verdict.
10. N parts. Nothing in the core or the app state assumes two; a part is an index. Two are shown in the model waves.
11. Phase is per part, in integer pulses. A requested phase off the lattice refines the lattice (spacings, phases, units and heights scaled together); the cycle readout updates and the pulse length in seconds shrinks so nothing audible moves except the shifted part. Stepping in whole pulses never refines.
12. Stored state holds primitives only: the parts (grid, onsets, phase, k, manual digits), ratio, tempo, volume, Mapping and UI state. Nothing derived is stored, so nothing derived can disagree with the primitives.
13. Every transition with a rule is a named action handled by one pure function, `reduce(state, action)` in `src/app/actions.ts`: toggle an onset, set k, set a phase, edit a draft, reset a group, set the ratio, set the tempo, load a preset, generate, swap sites. The rules of `MATH.md` §9.5 and §9.6 live there and nowhere else: editing an `x` makes its cross group manual; an onset change drops a manual group's flights and returns the notice; a phase off the lattice refines it; k is not available on a manual group. Mounts dispatch actions and do not write patches. It is unit tested with fakes at 100% lines.
14. Everything derived comes from one memoised selector, `derived(state)` in `src/app/derived.ts`, keyed on state identity and computed once per change: the Schedule (with cycle, lattice and verdict), the texts per hand, the cross groups and ball counts, the fixes, and the fractional-mean message. Every mount reads it; none recomputes it. A reset notice is an action result held in `notice`, not derived state.
15. The share link keeps working: `#v2.` encodes the parts, ratio, tempo and Mapping; old `#v1.` links and short links such as `#531@140` decode to the same Schedule as before.

## 6. Default mapping (v1)

| Event field | Drives | Default rule |
| --- | --- | --- |
| `kind = throw` | a hit | every throw sounds; catches silent |
| `hand` | voice and pan | hand 1: low voices, pan -0.6; hand 2: high voices, pan +0.6 |
| `height` | which drum and duration | 1-2 closed hat; 3 snare or rim; 4 low tom; 5+ kick. Duration = the flight: height × that hand's pulses per beat × pulse length (`MATH.md` §7) |
| `cross` | accent | +20 velocity; on a coincident pulse a clap |
| `ball` | a small variation | each ball a fixed sample variant or detune within its drum |
| crossings count (per pattern) | one global parameter | low-pass cutoff: more crossings, brighter (off by default) |
| cycle start | a pad | off by default |

### 6.1 Default mapping (v2, 2026-10-29)

The default is **voice per part**: each part has a kit, a sample, a pan and a gain (`PartVoice`), and every throw of that part sounds that voice. Many parts may share a voice; a part has one. Height, object, cross and coincidence are modifiers a preset may read. "Height to drum" (the v1 table above) and "Height to pitch" stay as presets and are where the juggling is heard; they read the event's height, the digit, clamped into the top drum above `MAX_HEIGHT` as in v1.

**The sound is invariant under ball count** unless the mapping reads flight length. Turning a hand's ball knob changes the picture and not the sound. That is intended, and the Sound tab says so in one sentence.

Fallback when the predicates fail. For a part in a faulted group (`event.ball` is null) the hit uses the part's voice, and the event's flight length is the gap from the onset to that part's next onset, the one-ball value, which is always defined. So height-reading presets still produce a sound and the ear never notices that the picture is broken. The Schedule guarantees this value for faulted parts (ruling of 2026-10-29 in `docs/plans/model-waves.md`), so the sound has one code path.

What existing things sound like: the five juggling preset cards keep "Height to drum", because height is what makes `531` interesting to hear; sourcebook presets carry voice per part; old `#v1.…` links carry their mapping and restore it. Only a fresh state with no card and no link takes the new default, so nothing that plays today changes its sound.

## 7. Done means

v1 is done when all of these hold in Chrome, Safari and Firefox on a laptop, and Safari on an iPhone:

1. `3`, `441`, `531`, `51`, `5551`, `97531` validate and play with a 1:1 ratio; the ladder and the juggler agree with hand-drawn ladder diagrams for each.
2. `12`, `21`, `43`, `4441` report a fractional ball count and offer a one-digit fix that is itself valid; `432` reports a collision naming the right throws, `510` reports its two flights landing where the 0 is, a beat with nothing to throw, and both offer fixes that are themselves valid.
3. `2` on each hand at 3:2 validates and plays as two fountains, and the strip shows 3 against 2; `2 2x 2` / `2x 2` validates with both crosses landing on the downbeat and the strip shows the exchange with the accent, while `2x 2 2` / `2 2x` is rejected naming the landing pulses. This is the demo as pitched. (Notation: `MATH.md` §6 and §8.)
4. Changing tempo or pattern while playing never clicks, drops a ball on screen, or stutters the strip; the change lands on the next cycle. A ball the new pattern has no place for is caught and disappears into the hand; a ball it needs appears in the hand (`MATH.md` §4); neither counts as a drop.
5. A share link round-trips: open it in a fresh tab and the knobs, sound panel and pattern match.
6. Audio events land within 2 ms of their scheduled time (measured from the audio clock in a test), and the drawn ball position at a catch is at the catching hand's throw point within one ball radius.
7. The About page renders the full bibliography with working links.
8. Unit tests cover the core at 100% lines; one headless browser smoke test loads the page, presses play, and sees the first Event fire.

Item 3's "rejected" is read in v2 as "not juggleable, still sounds".

v2, the model waves, are done when a person can check each of these (2026-10-29; streams as in `docs/plans/model-waves.md`):

1. Core (A): `npm test` is green at 100% lines with every row of `MATH.md` §8, including Clapping Music at phases 0, 3 and 9 (cycle 12 each), son clave at k = 1 and 2, kotekan as two one-ball hands and the hocket as one ball crossing (same onsets, 2 balls against 1), 3:2 with hand 2 at phase 1 (coinciding at pulse 4), vanilla `531` refined to spacing 2, and a 16-step line with one hit fault-free at k = 1; `npm run e2e` is green and `npm run build` passes.
2. Docs (D): a reader can plan the app-model stream from `MATH.md` §9 and this file alone, and every new bibliography entry names, in its PR, what was opened.
3. App model (B): every action rule of §5 has a unit test (manual group, reset with notice, phase refinement, k unavailable on a manual group); today's five preset cards, opened as `#v1.` links, decode to the same Schedule as before; e2e is green with no visible change.
4. Sound (C): the "Voice per part" preset exists and is the fresh default; height presets still read height; a faulted hand still sounds with its own voice; the Sound tab carries the sentence about ball count.
5. Interface (E), at 390×844 and on a laptop: Play is never greyed out, including on `43` and on `2x 2 2` / `2 2x` at 3:2, both of which sound; the faulted group's collision is drawn and it has no balls; the juggler's axis fits the longest flight; a flight longer than `HUMAN_AIRTIME_SECONDS` at the current tempo is dimmed with "not a human throw"; each hand in the Rhythm tab has a phase stepper and a ball stepper, the latter replaced by a derived count and "reset" on a manual group; the notice line appears after a reset; `a / b` is accepted at 1:1; "make it juggleable" fixes appear and never block.
6. Presets (F): the sourcebook's table loads as presets, five on the first screen and the rest behind "more"; Clapping Music steps through its twelve phases with the phase stepper; the About page has a section per layer of the model with only citations that were opened.

## 8. Open questions

1. Vanilla shell or React for the knob panel. (Nico, at scaffold.)
2. Hand ratio when siteswap periods do not divide the ratio: cycle = lcm, confirmed, but check that the strip reads well for, say, period 3 on a 2-beat hand.
3. Does Charlie want a hand in the sound presets?
4. Mocks as a Design artifact: before or after the first audible milestone?
