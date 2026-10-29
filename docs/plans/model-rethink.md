# The model, rethought: one state, two renderers

Status: design approved in principle by Nico on 2026-10-29 (this session, Fable); the six decisions in §6 are his. Not yet turned into a wave plan. This document replaces the model parts of `docs/SPEC.md` §3 and §5 and adds a section to `docs/MATH.md`; those edits are the first PR of the wave that follows. `docs/plans/v2-share-kits-passing.md` wave 1 (kits, share in reach, space bar) is untouched by this and may run alongside. Its wave 2 (passing) is rewritten by §9 here.

## 1. Why

`docs/POLYRHYTHMS.md` reduced nineteen real rhythms to what the app plays and found that twelve of them do not fit: the app has one vanilla siteswap at 1:1 or one sequence per hand at other ratios, picks a drum by throw height, and stops at two hands. The rhythms are lines of hits, one voice each, two to four of them, with a phase between them. The brief (`docs/plans/rethink-brief.md`) asked what the primary object is.

Nico's answer, in his words: what matters is to visualize the juggling, hear the polyrhythm, and play within the constraints that are supported. A strictly juggling visualizer and a strictly polyrhythmic synthesizer are both legitimate, and the app should be able to be either. That rules out picking a side. It asks for one description of "who does what when, and who hands what to whom" that both a juggler and a sequencer can read.

## 2. The model in one paragraph

Time is an integer lattice. Each **part** (a hand) throws on a **grid**, evenly spaced beats on the lattice with a spacing and a phase, and owns a set of **onsets** on that grid. **Flights** join an onset to a later onset, in the same part or another, and carry an **object** (a ball). That is the whole state. Everything else is derived (cycle, ball count, streams) or an attribute hung on it (a voice per part, a juggler grouping parts). The sound reads onsets, parts and the mapping. The juggler reads flights and objects. The ladder draws both. A short list of predicates says whether the flights are juggleable; failing them removes the picture, never the sound.

## 3. Primitives

Names below are the ones code and copy should use. "Hand" stays the reader-facing word for a part until there is a reason to say "part" to a user.

**Lattice.** Integer pulses. The pulse is the largest time unit on which every grid's beats and every part's phase fall. Cycle = the lcm of the grid spacings in pulses, times whatever the onset patterns' periods add (§4). Nothing in `src/core` is ever a float; this is already the rule.

**Grid.** `(spacing, phase)` in pulses. Two grids with different spacings are a polyrhythm proper: 3:2, 5:4, 16:3. Two grids with the same spacing and different phases are a displacement: Reich, mbira, kotekan. The two meanings of "1:1" the brief found are one parameter. Vanilla siteswap is two grids of spacing 2 at phases 0 and 1; "hands striking together" is both at phase 0; synchronous siteswap is native, not a relaxation. Grids are isochronous by definition; Nickmans' galloped patterns are out, on purpose.

**Part.** A hand: one grid, a periodic set of onsets on it, a phase (§4), and a ball-count knob `k` (§5). The part is where the one juggling-only structural rule lives, "one object per onset", which costs music nothing: a drummer's limb is a part too. There are N parts, not two. Today's `Hand = 0 | 1` becomes an index.

**Onset.** A pulse on which a part throws. Onsets are a subset of the part's grid beats. In digit notation a nonzero digit is an onset and a `0` is a grid beat with no onset. The sound is a function of onsets and nothing below this line.

**Flight.** From one onset to a later onset, in the same part or another, carrying one object. The set of flights is a map `f` on onsets. In digit notation a flight is the digit (its length in the throwing part's own beats) plus an `x` when it lands in another part, exactly as `MATH.md` §6 has it today.

**Object.** A ball. Objects are the orbits of `f`; their count is derived (§5). Clubs, rings and colours are attributes.

### Derived, never stored

- Cycle and period (§4).
- Ball count, per part and total (§5).
- Streams, what a listener hears as one line (Bregman's term), and inherent patterns, lines nobody plays but everyone hears (Kubik's term, Scherzinger's "phantom patterns"): a flight is a stream link the user has made explicit; the default flight rule (§5) is our model of what the ear does when nobody has said otherwise. Citations to be verified before they reach the About page (§10).

### Attributes

- **Voice**: the mapping from a part (and, if a preset asks, from an onset's flight length, object, cross or coincidence) to a sound. Many parts may share one voice; one part has one voice. Default is voice per part (§7).
- **Juggler**: a grouping of parts, used to draw hands side by side and to call a flight between groups a pass (§9). Not a constraint.

## 4. Phase and the lattice (decision 5)

A part's **phase** is a shift of the whole part, grid and onsets, by `p` pulses, with `0 ≤ p < P` where `P` is the part's onset pattern's period in pulses. The grid's phase is `p mod spacing`. The phase quantum is the lattice pulse, not the grid beat.

Rule: asking for a phase that is not on the current lattice refines the lattice (halves the pulse, or finer) until it is; the cycle length in pulses changes and the cycle readout updates live. Pulse length in seconds adjusts so nothing audible moves except the shifted part. Stepping the phase knob in current pulses never refines anything.

Worked cases for `MATH.md`:

- Clapping Music: two parts on a 12-pulse lattice, spacing 1, onsets `x x x . x x . x . x x .`, part 2 at phase `p = 0..11`. Cycle 12 at every `p`; `p = 3` and `p = 9` are the famous positions.
- Vanilla `531`: both parts spacing 1 beat, onsets on every beat, part 2 at phase half a beat. Half a beat is not on a 1-pulse-per-beat lattice, so the lattice refines to 2 pulses per beat: spacing 2, phases 0 and 1, cycle 6 pulses for period 3. This is exactly what `MATH.md` §6.5 does today by hand.
- Mbira: `3 0 0` repeated on 12 against the same at phase 1. Cycle 12.
- 3:2 with part 2 at phase 1: grids spacing 2 at 0 and spacing 3 at 1 on a 6-lattice; beats 0,2,4 and 1,4; they coincide at 4. Legal, isochronous, and not something today's app can say.

## 5. Flights: the default rule, the theorem, manual edits

**Default rule.** Within a part with ball knob `k`, onset `i` flies to onset `i + k` of the same part (indices cyclic over the period). Every part starts at `k = 1`.

**Theorem (k balls over a fixed line).** For one part, the default rule is a bijection on its onsets for every `k ≥ 1`, and the part then carries exactly `k` objects, because the flight lengths over one period sum to `k` periods. So any rhythm anyone types or taps is already a valid juggling pattern, and ball count is a knob turned afterwards. Son clave at `k = 2` is `6 0 0 7 0 0 6 0 0 0 6 0 7 0 0 0` on the same five hits. This is the inversion the brief asked about, and it is free.

**Ball count is per part (decision 2).** The knob is `k` per part; the summary row shows the sum. Cross flights change the global winding number, so the true derived total is what the summary shows when it differs from the sum of knobs. The winding number is the average theorem in `MATH.md` §2: over a period, the sum of `f(o) − o` is a whole number of cycles for any bijection, so a fractional ball count is not a separate error but a non-bijection seen from the digits. The model drops it as a check. The digit editor keeps the message: someone typing `43` reads "3.5 balls" before "collision at beat 3", because it is the cheaper of the two presentations of one fault.

**Manual flights.** The Pattern view edits a part's digits directly (lengths and `x` marks) as today. A part whose digits were edited by hand is *manual*; the default rule leaves it alone.

**Manual is a property of a cross group (my call after the builder check).** Parts joined by any `x` flight form a cross group. A cross out of part A lands on an onset of part B that B's own default rule already feeds, so a lone `x` is always a collision; crosses only balance when both parts are edited together, as `2 2x 2 / 2x 2` is. So editing an `x` makes every part in the group manual, and a reset re-derives the whole group. A part with no crosses is a group of one. Flights are stored as each part's digits (form 2 of §8), as today; the group is derived from the `x` marks.

**The `k` knob on manual parts.** A manual group does not offer `k`; its row shows the group's derived ball count (a part with crosses has no well-defined count of its own: hand 1 of a shower throws 2.5 balls' worth). It offers "reset to default", which makes every part in the group default at `k = 1`, after which `k` applies. The vanilla preset cards and `#531@140` links parse as one manual group of two parts (form 1), so turning a knob can never silently turn `531` into something else.

**Dangling manual flights (decision 1).** When a manual group's onsets change (the Rhythm view toggled a hit, the generator ran, a phase change moved an `x` landing off its onset), the manual flights are dropped and the whole group is re-derived by the default rule at `k = 1` per part, with a one-line notice ("hands 1 and 2 reset to 1 ball each"). The two views stay in sync with no reconcile step and no modal.

## 6. Predicates (decision 6)

One list, over all parts at once. The flights are juggleable iff:

1. `f` is a bijection on the set of all onsets of all parts: every flight lands on an onset, every onset throws one object and receives one, no onset receives two.
2. Every flight goes forward in time: `f(o) > o`.

There is no height ceiling in validity (Nico, 2026-10-29). The ceiling is presentation: the juggler fits its vertical axis to the longest flight in the pattern; the mapping clamps heights above `MAX_HEIGHT` into the top drum as it does today; and a flight whose airtime at the current tempo exceeds a tunable (`HUMAN_AIRTIME_SECONDS`, about 3 s) draws dimmed or dashed with the copy "not a human throw". Tempo-dependent, which is fine for a picture and wrong for a rule. The parser accepts standard siteswap letters `a`-`z` for 10-35 so long flights can also be typed.

In the model a flight's endpoint is an onset by construction. The digit form (§8) can still write a cross that lands on a pulse where the catching part has no onset (`2x 2 2 / 2 2x` at 3:2, or an `x` landing on a `0`); that is a failure of predicate 1, not a parse error, and the message names the landing pulse and the nearest onset as today's `cross-off-grid` does. The rejected 3:2 row of `MATH.md` §8 and `SPEC.md` §7 item 3 survive with "rejected" read as "not juggleable, still sounds". Passing adds nothing to this list (§9). Multiplex would relax rule 1 to a per-part capacity; it is not planned, and this is where it would go.

**What failing does.** The sound plays regardless: onsets are always a rhythm. `buildSchedule` no longer throws: it always returns events for every onset, with ball ids only for parts in cross groups that pass. The *broken* parts are the cross group containing any failing onset; other groups keep their balls. The juggler shows the fault (today's colliding flights in the warning colour meeting at the landing pulse) and draws no balls for the broken group. The ladder still draws, as today, and `carry.ts` carries the passing groups' balls across the boundary. Play is never disabled. This reverses `SPEC.md` §4.2 "Play is disabled" and the `playButton.disabled` line in `mount-knobs.ts`; the "last valid pattern keeps playing, broken one greyed above" behaviour goes with it, since there is no longer a last valid pattern to fall back to.

**Fix suggestions survive**, relabelled "make it juggleable": the same edit-distance search as today's fix state, offered in the Pattern view under a manual part, optional and never blocking. The swap knob stays (it cannot repair a collision, `MATH.md` §3).

## 7. Mapping (decision 3)

Default: **voice per part**. Each part has a kit and a sample (and pan and gain, as today's `HandVoice`). Height, object, cross and coincidence are modifiers a preset may read; "Height to drum" and "Height to pitch" stay as presets and are where you hear the juggling.

Consequence to say out loud in the Sound tab copy: **the sound is invariant under ball count** unless the mapping reads flight length. Turning `k` changes the picture and not the sound; that is honest and intended.

**Fallback when the predicates fail.** `hitFor` uses the part's voice, and takes flight length as the gap from the onset to the next onset in that part (the `k = 1` value, always defined), so height-reading presets still produce a sound and the ear never notices the picture is broken.

Per-part kit and the Soundfont voices the sourcebook wants (kalimba, agogo, pad) are the v2 kits stream's business and fit this model with no change: a voice is an attribute of a part.

**What existing things sound like (my call).** A preset card carries a mapping preset: the five juggling cards keep "Height to drum", because height is what makes `531` interesting to hear; sourcebook presets carry voice per part. Old `#v1.…` links already carry their mapping and restore it. Only a fresh state with no card and no link takes the new default. So nothing that plays today changes its sound.

**Ownership against v2 wave 1.** The kits stream adopts the per-part shape (`parts: { kit, sample, pan, gain }[]`) rather than extending the two-hand one; this document's first PR (types, `MATH.md`, `SPEC.md`) lands before the kits stream starts, so the type is frozen once and the hash encodes it once.

## 8. Notation, parsers and the share link (decision 4)

Three readable forms, all producing the same state. No fourth.

1. **Vanilla**: one siteswap for two hands, `531`. The parser writes two parts, spacing 1 beat, onsets on every beat, phases 0 and half a beat, flights from the digits (odd crosses). Today's five preset cards and short links such as `#531@140` keep working unchanged. The Pattern view is a superset of today's, not a replacement.
2. **Digits with zeros per part**, one-hand counting with `x`, as `MATH.md` §6 defines: `2 2x 2 / 2x 2 at 3:2`, `3 0 0 3 0 0 4 0 0 0 2 0 4 0 0 0`. A digit is a flight length in the part's own beats; a `0` is a grid beat with no onset. Every sourcebook row is already written this way. Two rules settled here: a `/` means form 2, so at 1:1 a single string is vanilla and `a / b` is two independent parts both at phase 0 (which is what every sourcebook "1:1" row means); and with more than two parts `x` alone is ambiguous, so `x2`, `x3` name the destination part by number, bare `x` staying legal when there are exactly two. Three- and four-part textures are therefore writable in form 2.
3. **Multihand Notation** (Carstens; what Juggling Lab builds internally) on the lattice for the general case: one row per part, one column per pulse, each cell the flights launched there as `(length, destination part)`. This is the model's own serialization and the only form that can say everything (N parts, arbitrary grids, phases, passes). To be verified against the Juggling Lab source before it is named on the About page.

The share link: the short forms of the v2 share stream for forms 1 and 2 plus ratio, phase, `k` per part and tempo; the full encoded form carries form 3 and the mapping. Old `#v1.…` links still open. The share stream's grammar must leave room for `N` parts and a phase per part; that is the one change to its brief.

## 9. Passing is grouping, layers are parts

A **juggler** is a group of parts. A **pass** is a flight whose endpoint is in another group. With the predicates of §6 over all parts, passing needs no second validator, no `pass: boolean` on events (it is derivable), and no separate notation beyond form 3; `<3p 3|3p 3>` becomes a fourth parser into the same state if passers want to type it. "Independent layers" (the sourcebook's three- and four-part textures) is N parts with no flights between groups. The brief's question 4 ("passing or a general N-line model first") dissolves: the N-part model is the passing model.

What the v2 passing wave keeps: the stage drawing N figures, the world-coordinate motion model, one ladder lane per part, per-part voice and pan. What it drops: the `juggler` and `pass` fields, the passing-specific validator and notation decisions 1 to 5. Hand-assignment conventions for passes (which hand an odd pass lands in) become a parser concern for the `<…|…>` form, checked against Juggling Lab as planned.

## 10. Presets, the About page and citations

A preset is an onset set per part, a ratio, phases, `k` per part, a voice per part, a tempo, and a cited source. The sourcebook's table is the list; its rows are rewritten into this shape by the presets stream. The **Euclidean generator** E(hits, pulses) plus rotation (Toussaint, after Bjorklund) becomes a control in the Rhythm view and covers the bell E(7,12), tresillo E(3,8), Brubeck's 2+2+2+3 E(4,9), the afrobeat hat E(6,16) and kotekan E(8,12). It does **not** cover son clave (gaps 3,3,4,2,4), rumba, cascara, Clapping Music or the tihai, which stay as presets; the sourcebook's "maximally even" on son clave is wrong and is corrected when that file is next edited.

About page: one section per layer of §3 (time, grids and ratio versus displacement, lines and necklaces, flights and objects, parts and streams), each with its sources; the bibliography grows accordingly. **Every citation is opened and the claim checked at the moment it is written or changed** (Nico, 2026-10-29). The sources this design leans on and has not yet opened: Krebs, *Fantasy Pieces* (1999) for grouping versus displacement dissonance; Bregman, *Auditory Scene Analysis* (1990) for streams; Kubik (1962) for inherent patterns; Pressing (1983) for the bell as diatonic; London, *Hearing in Time* (2004) for isochronous meter; Toussaint, *The Geometry of Musical Rhythm* (2013) and his 2005 Euclidean-rhythms paper; Carstens' MHN via Juggling Lab. None goes on the page until opened; unverified entries keep the HTML-comment marker `BIBLIOGRAPHY.md` already uses. A PR that adds or changes a citation says in its description which sources it opened.

## 11. What changes where

- `docs/MATH.md`: new §9 "Parts, onsets, flights" stating §3 to §6 of this document formally, with the worked cases of §4 and §5 added to the test table (Clapping Music at `p = 0, 3, 9`; son clave at `k = 1, 2`; kotekan both as two one-ball parts and as one ball crossing `1x`/`1x`, same sound and a different picture; 3:2 with phase 1). §6.5 (vanilla as half-beat offset) becomes a corollary of §4.
- `docs/SPEC.md`: §3 definitions (Part, Onset, Flight, Object, Grid phase, Juggler; Hand becomes Part), §4.2 fix state (no disabled play; "make it juggleable"), §5 rules (sound never gated; N parts; phase), §6 default mapping (voice per part default). §2 "Not in v1" and §7 "Done means" gain a v2 list.
- `src/core/types.ts`: `Hand` to a part index; `PatternInput` to parts with grid, onsets, phase, `k`, manual digits; `Event` gains nothing (part replaces hand). `validate.ts` collapses to the three predicates; `fixes.ts` stays; new `flights.ts` default rule; `schedule.ts` reads flights per part.
- `src/sound/mapping.ts`: `hands: [HandVoice, HandVoice]` to a per-part list with kit and sample; fallback of §7.
- UI: deferred (§12).

## 12a. Implementation paradigm: primitives stored, actions with rules, one derived selector (proposed)

Nico asked (2026-10-29) whether a reducer-like approach would serve derived values. Proposed, no library:

- **Stored state holds primitives only**: parts (grid, onsets, phase, `k`, manual digits), ratio, bpm, mapping, UI state. Nothing derived is ever stored, so nothing derived can disagree with the primitives.
- **Transitions with rules are named actions** handled by one pure function in `src/app` (toggle onset, set phase, set `k`, edit digits, reset group, set ratio, load preset). The rules of §4 and §5 live there and nowhere else: editing an `x` marks the cross group manual; an onset change drops a manual group's flights and returns the notice; a phase off the lattice refines it. Mounts dispatch actions and stop writing patches. Tested with fakes, 100% lines.
- **Everything derived is one memoized selector**: normalised parts, lattice, cycle, cross groups, predicate results, ball counts, schedule, computed once per state change and keyed by state identity, read by every mount. Today's `analyse` (called separately by four mounts) becomes this selector; the store's existing `derive` hook is where it runs. A reset notice is an action result, not state.

## 12. Deferred, and a hint

The interface comes after the model is in code and tested. Nico's current leaning (2026-10-29): something that looks like a mixer or a DAW arrangement, one strip or lane per part with its voice, grid, phase and ball knob, in the spirit of Logic or Ableton Live. Not decided; the two views (Rhythm edits onsets, Pattern edits flights) and the phase knob are the only UI commitments in this document. The builder designs the layout in its own plan, mocked on the phone first as `docs/plans/phone-sheet.md` was.

## 13. Left to the builder

- Internal representation of onsets (bitmask per period versus index list) and of `f`.
- Where `k` lives in `AppState` and how the hash encodes N parts compactly.
- The exact "reset to default" notice copy and where it shows.
- Which Toussaint rotation convention the generator's phase uses (the generated necklace starts on a hit).
- Test fakes for N-part schedules.

## 14. Resolved after the builder check

1. **Height ceiling: decided, Nico 2026-10-29.** Out of validity; presentational substitute as §6 states. Reason: a beat ceiling falsified the §5 theorem (one kick per 16-step bar is a 16-beat flight), and a seconds ceiling would make validity depend on tempo.
2. **UI scope of this wave: decided (b), Nico 2026-10-29.** A minimal rewire inside today's sheet: Play always on, a phase stepper and a `k` stepper per hand in the Rhythm tab, form 2 accepted at 1:1, still two parts on screen. The mixer-style UI (§12) comes after, in its own plan.
