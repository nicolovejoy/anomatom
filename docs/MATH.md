# anomatom — the math

What the app rests on, in the order the code needs it. Each section ends with what the app does with the result. Citations are to `BIBLIOGRAPHY.md`.

## 1. Siteswap

A juggling pattern on one shared beat is a sequence of non-negative integers t₁ … tₙ. The ball thrown on beat i lands on beat i + tᵢ. Beats alternate hands, so an odd throw crosses to the other hand and an even throw returns to the same hand; 0 is an empty hand, 2 is a hold. The sequence repeats with period n.

Examples: `3` the three-ball cascade; `441`; `531`; `51` the three-ball shower; `4` the four-ball fountain; `97531` a five-ball trick.

App: the input is this sequence, one per hand.

## 2. Validity (Buhler, Eisenbud, Graham, Wright 1994 [1])

A sequence is a juggling pattern iff the landing beats i + tᵢ (mod n) are all distinct for i = 1 … n. Equal landing beats mean two or more balls arrive in one hand at once: a collision.

Corollary (the average theorem): the number of balls is the mean of the digits, so a sequence whose mean is not an integer is already invalid.

App: the validator. A failure names every throw in a colliding group; when several errors follow from one cause (a collision usually leaves some beat with no ball), the first is the one shown. The check is O(n) and runs on every keystroke.

## 3. The swap property

Swapping the landing beats of two throws gives another valid pattern with the same ball count. If throws at positions i and j have heights a and b, the new heights are b + (j − i) at i and a − (j − i) at j. 51 ↔ 24; 441 ↔ 531 (swap positions 1 and 2; positions 2 and 3 give 423). When a throw is marked `x`, the mark belongs to the landing and moves with it. This is where the name "siteswap" comes from.

Because a swap only exchanges two landings, the set of landing beats is unchanged: a swap keeps a valid pattern valid and an invalid one invalid. It cannot repair a collision.

App: the Swap knob. Not a fix for a collision.

## 4. States and the state graph (Polster [5]; Chung and Graham 2008 [4])

At any beat the juggler's state is the set of future beats that already have a ball due to land: a bit vector of length max height, with b ones for b balls. A throw of height h from a state is legal iff bit h is empty; it moves to the next state by shifting and setting bit h. Patterns are cycles in this graph. Two patterns can be chained without a drop only through a state they share. The ground state (balls landing on the next b beats) is shared by every pattern that passes through it; `3`, `441`, `531` all do. Chung and Graham call a cycle that visits its base state once *primitive*; longer cycles are concatenations of primitive ones.

App: v1 changes pattern at any cycle boundary, without transition throws. Balls the two patterns share at the boundary carry over; when both pass through the same state (`3`, `441`, `531` share the ground state) all of them do. Otherwise the leftover balls drop into the hands or appear from them, as for a change of ball count. Some patterns v1 must play never reach the ground state: `51` is excited, so `3` → `51` cannot carry every ball. v2 uses the graph for real transitions between arbitrary patterns and for generating patterns from a state.

## 5. Crossings (Ehrenborg and Readdy 1996 [3])

Draw the ladder diagram: pulses across, each flight an arc from throw to landing. Ehrenborg and Readdy weight a pattern by q^c where c is the number of times arcs cross. For v1, c counts the pairs of arcs in one cycle with s₁ < s₂ < e₁ < e₂, comparing each arc against the arcs of the following cycles it overlaps; this is the ladder's arc count, not the count of ball paths crossing in space, so a fountain's overlapping same-hand arcs count too. Zero-length flights are not arcs. c is a property of the pattern, cheap to count from the flights.

App: one scalar per pattern, exposed to the sound panel ("crossings to filter").

## 6. Two hands on different grids (Nickmans 2015 [7], after Tiffany)

Vanilla siteswap assumes both hands throw on one shared beat. Drop that and each hand runs its own evenly spaced grid; a 3:2 pattern has hand 1 making 3 beats while hand 2 makes 2, coinciding once per span. Nickmans' example is a four-ball pattern in which the balls do not cross, with a synchronous throw at the coincidence. He names ratios 4:3, 5:3, 8:5, 8:7 as further possibilities, and "galloped" variants with no synchronous throws, which he calls mostly theoretical.

The timing rule, which the article leaves implicit but its non-crossing example settles:

1. Time is continuous; each hand's grid is a quantisation of it. The common grid is the LCM of the two: 6 pulses per span for 3:2. Call one pulse the tatum.
2. A throw is legal iff it lands on a beat of the **catching** hand's grid. Same-hand throws therefore obey ordinary siteswap on that hand's own grid, and a hand's digits still count that hand's beats.
3. A cross throw is legal only where both grids coincide. For 3:2 that is once per span; for 4:3 once per span. (For a reduced ratio, rule 2 already implies this: a landing on the catching hand's grid that was launched from the throwing hand's grid is a multiple of both beat lengths.)
4. Phase: beat 0 of each hand's sequence is pulse 0, the coincident pulse. Rotating a sequence changes which throws can cross, so two rotations of the same digits are different patterns.
5. Vanilla siteswap is not the 1:1 case of this model but its half-beat-offset case: both hands on 2-pulse beats, hand 2 one pulse behind, every pulse a beat of exactly one hand. Since 2026-10-29 this is not a separate rule but a corollary of the phase rule of §9.6: two parts on one beat with part 2 asked to sit half a beat late refine the lattice by 2, which gives exactly this layout, and the crossing of odd digits follows from it rather than being assumed. The app models vanilla this way, so a vanilla `3` is a 3-pulse flight and odd digits cross. Rule 4's fixed phase 0 is likewise the special case φ = 0 of §9.6; equal spacings at phase 0 are hands striking together (synchronous siteswap).

Notation. At 1:1 the input is one vanilla siteswap on the shared beat, hands alternating, odd digits crossing, exactly as jugglers write it. At any other ratio each hand has its own sequence in one-hand counting: a digit is the number of that hand's beats the ball is in the air, and a throw crosses only when marked with `x`. Note that one-hand `2` is a two-ball fountain on that hand (vanilla `4`), not a hold. Both notations become the same thing internally: a list of flights with launch and landing in integer pulses, so the Schedule has one shape.

Consequences:

- Validity is one check per hand, generalising §2: the pulses on which balls land in that hand (its own uncrossed throws plus the other hand's `x` throws, taken mod cycle) must be exactly the pulses on which that hand throws, no pulse twice. A hand validated by §2 alone is not enough once `x` throws leave it; the check also catches a hand asked to throw a ball it never received. A `0` is a zero-length flight landing on its own beat, which keeps the landing set a permutation of the beat set.
- The average theorem applies to the combined count: the sum over hands of each hand's mean digit. A single hand's mean may be fractional when crosses are unbalanced; the per-hand check catches that.
- A cross throw's landing pulse must be a multiple of the span; otherwise the validator reports "cross throw from hand 1 beat 2 lands between hand 2's beats; nearest legal landing is pulse 6" (the next multiple of the span at or after the landing).
- The musical downbeat and the only legal crossing point are the same pulse, which is why the crossing flashes and gets the accent.
- The cycle is the LCM over both hands of (siteswap period × that hand's pulses per beat). For vanilla, the period rounded up to even.
- Ball identity can take several cycles to repeat: following each landing to the next throw from that hand partitions a cycle's flights into orbits, and an orbit whose flights total m cycles of air time carries m balls one cycle apart. In `441` one orbit carries all three balls, so the same ball returns to the same throw after three cycles. The Schedule's period is the cycle times the LCM of the orbit sizes, and events span one period.

App: this is the data model (one siteswap per hand, a ratio, cross throws on the LCM lattice) and the second validator check. Galloped patterns are out of scope.

## 7. From pulses to seconds and pixels

Pulse length in seconds = 60 / (bpm₁ × pulsesPerBeat₁), where pulsesPerBeat₁ = ratio₂ / gcd(ratio₁, ratio₂). Hand 2's bpm follows. A flight of height h on a hand with k pulses per beat lasts h × k pulses; a ball's apex height is proportional to the square of its air time, as a parabola under gravity gives; the air time is the flight less the dwell in the catching hand, so roughly (h × k)². Pulses stay integers in the Schedule; multiplication by the pulse length happens only when an audio event is scheduled or a frame is drawn.

## 8. Worked cases for tests

| Pattern | Ratio | Balls | Juggleable | Note |
| --- | --- | --- | --- | --- |
| `3` / `3` | 1:1 | 3 | yes | cascade; every throw crosses |
| `441` / `441` | 1:1 | 3 | yes | 4s stay, 1 crosses |
| `531` / `531` | 1:1 | 3 | yes | swap of 441 at positions 2,3 |
| `51` / `51` | 1:1 | 3 | yes | shower |
| `12` | 1:1 | 1.5 | no | fractional mean |
| `21` | 1:1 | 1.5 | no | fractional mean |
| `43` | 1:1 | 3.5 | no | fractional mean |
| `4441` | 1:1 | 3.25 | no | fractional mean |
| `432` | 1:1 | 3 | no | landings 5, 5, 5: all three throws collide |
| `510` | 1:1 | 2 | no | the 5 and the 1 both land on pulse 2, where the `0` is: no onset there, so two `no-onset` faults (§9.3), not a collision |
| `2` / `2` | 3:2 | 4 | yes | Nickmans' non-crossing 3:2 pattern: each hand fountains two balls on its own grid; cycle 6 |
| `2x 2 2` / `2 2x` | 3:2 | 4 | no | hand 1's `x` leaves pulse 0 and lands at 4, between hand 2's beats 3 and 6; hand 2's `x` leaves pulse 3 and lands at 9, off hand 1's even grid |
| `2 2x 2` / `2x 2` | 3:2 | 4 | yes | the same digits rotated: hand 1's `x` leaves pulse 2, hand 2's leaves pulse 0, both land at pulse 6, each into the slot the other vacated. The demo pattern; its period is 18 pulses |
| `2x 2` / `2 2` | 3:2 | 4 | no | period 2 on a 3-beat hand makes a 12-pulse cycle; the `x` fires at pulses 0, 4, 8 and lands at 4, 8, 12, legal only the third time |
| `3 0 0 3 0 0 4 0 0 0 2 0 4 0 0 0` | one part | 1 | yes | son clave as a default part at k = 1 (§9.5): onsets 0, 3, 6, 10, 12, each height the gap to the next onset; H = 16 = C |
| `6 0 0 7 0 0 6 0 0 0 6 0 7 0 0 0` | one part | 2 | yes | son clave at k = 2: the same five onsets, each flying to the onset after next; H = 32 = 2C; the Schedule's period is 2 cycles |
| `g 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0` | one part | 1 | yes | a 16-step line with one hit at k = 1 is a single 16-pulse flight (`g` = 16). No height ceiling (§9.3) |
| `1 1 2 0 1 2 0 2 0 1 2 0` / same, part 2 at phase 0 | 1:1 | 2 | yes | Clapping Music, two default parts at k = 1 (§9.6); C = 12; the lines coincide on all 8 onsets (unison) |
| `1 1 2 0 1 2 0 2 0 1 2 0` / same, part 2 at phase 3 | 1:1 | 2 | yes | C = 12; part 2's onsets 0, 1, 3, 4, 5, 7, 8, 10; the lines coincide on 6 pulses (0, 1, 4, 5, 7, 10) |
| `1 1 2 0 1 2 0 2 0 1 2 0` / same, part 2 at phase 9 | 1:1 | 2 | yes | C = 12; part 2's onsets 1, 2, 4, 6, 7, 9, 10, 11; the lines coincide on 6 pulses (1, 2, 4, 7, 9, 10) |
| `1 2 0 1 2 0 1 2 0 1 2 0` / `0 1 2 0 1 2 0 1 2 0 1 2` | 1:1 | 2 | yes | kotekan telu as two default parts at k = 1, two groups of one; the parts share pulses 1, 4, 7, 10, so no one-ball version exists (§9.5) |
| `2 0` / `0 2` | 1:1 | 2 | yes | nyog cag (the hocket) as two one-ball parts, two groups of one |
| `1x 0` / `0 1x` | 1:1 | 1 | yes | the same onsets as one ball crossing on every throw: one cross group; the same sound as the row above, a different picture |
| `1` / `1`, part 2 at phase 1 | 3:2 | 2 | yes | grids (2, 0) and (3, 1) on a 6-pulse cycle: beats 0, 2, 4 and 1, 4, coinciding at 4, not 0 (§9.6) |
| `531` as two parts of spacing 1, part 2 at half a beat | 1:1 | 3 | yes | half a beat is off the lattice, which refines by 2: spacing 2, phases 0 and 1, unit 1, C = 6; the same Schedule as the `531` row above (§9.6, corollary) |

The 3:2 rows are the ones that prove the project. Their ladders were drawn by hand (2026-10-28) before the tests were written; the tests in `src/core/table.test.ts` encode this table row for row.

The column read "Valid" until 2026-10-29. "Juggleable" is the verdict of the two predicates of §9.3; a "no" removes the balls from the picture for the faulted cross group and nothing else. A pattern that is not juggleable still sounds: every onset is an event whatever the verdict (`SPEC.md` §4.2). The rows from son clave down test §9 and were added the same day; "one part" means a single default part, and `a / b` at 1:1 means two parts at phase 0 unless a phase is given.

## 9. Parts, onsets, flights (2026-10-29)

Sections 1 to 6 describe two hands, a siteswap per hand and a ratio. This section restates the model for any number of parts on one lattice, following `docs/plans/model-rethink.md` §3 to §6, and is what `src/core` implements from the model waves on. Where it and §6 differ, this section holds; §6's results reappear below as special cases. A part is what the reader calls a hand, and the copy keeps saying "hand".

### 9.1 Lattice and grids

Time is the integers, counted in pulses. A grid is a pair (s, φ) of integers, the spacing s ≥ 1 and the phase φ, whose beats are the pulses φ + js for every integer j. A set of grids is normalised when the gcd of all its spacings and phases is 1; the pulse is then the largest unit of time on which every beat falls, the tatum of §6, and normalising only renames the unit. A grid is isochronous by definition: each beat is s pulses from the next. Meters with uneven beats, which London's account of meter as entrainment explicitly admits [21], and Nickmans' galloped patterns are not grids, and are out of scope on purpose.

Two grids with different spacings are a polyrhythm proper: 3:2 is spacings 2 and 3 on a 6-pulse span. Two grids with the same spacing and different phases are a displacement: Reich, mbira, kotekan. These are Krebs' grouping dissonance (incongruent layers) and displacement dissonance (congruent layers, not aligned) [19]. The two meanings of "1:1" are therefore one parameter: equal spacings at equal phases are hands striking together, which is synchronous siteswap, and spacing 2 at phases 0 and 1 is vanilla siteswap (§9.6).

App: the ratio sets the spacings and a stepper per hand sets the phase. Nothing in `src/core` is a float.

### 9.2 Parts, units and onsets

A part is a grid (s, φ), a period of n beats, a notation unit u ≥ 1, and its flights (§9.3). Beat j of the part, 0 ≤ j < n, sits on pulse φ + js and recurs every P = sn pulses, the part's period in pulses. The phase is a shift of the whole part, grid and onsets together, taken in 0 ≤ φ < P; the phase of its grid in the sense of §9.1 is φ mod s. The cycle C is the lcm of sn over all parts. It is a multiple of every part's period and does not depend on the phases. Pulses are read modulo C from here on.

The onsets of a part are the beats on which it throws, a subset of its beats. An onset is a pair (i, t) of a part i and a pulse t mod C, and O is the set of all onsets of all parts in one cycle. A part throws at most one object per onset. That is the one structural rule that is about juggling, and it costs music nothing, since a drummer's limb is a part too; multiplex juggling would relax it and is not planned.

The unit is the number of pulses one written digit stands for: a flight of height h pulses is written as the digit h / u, with the letters `a` to `z` for 10 to 35, so heights are multiples of u. In one-hand counting (§6) u = s, and a digit counts the part's own beats. For a vanilla pair (§9.6) u = 1, and vanilla `3` is a 3-pulse flight. In digit notation a nonzero digit is an onset and a `0` is a beat with no onset. Section 6 read a `0` as a zero-length flight landing on its own beat; the verdicts agree (a flight landing on a `0` is a collision there and lands off the onsets here), and only the name of the fault changes.

App: the sound reads onsets, parts and the mapping, and nothing defined below this line.

### 9.3 Flights and the two predicates

A flight leaves an onset (i, t) with a height h in pulses and a destination part d, and lands on pulse t + h of part d: unwrapped at t + h, wrapped at t + h mod C. It crosses when d ≠ i, which digit notation writes as `x` when there are two parts and as `x<n>` for the n-th part, counted from 1. The flights define a map f(i, t) = (d, t + h mod C) from O to the pairs (part, pulse). Objects are the orbits of f, and their number is derived (§9.4).

The flights are juggleable iff:

1. f is a bijection of O onto O: every flight lands on an onset of its destination part, no onset receives two flights, and every onset receives one;
2. every flight goes forward in time: h > 0.

The faults name the ways predicate 1 fails: a flight that lands on a pulse where its destination part has no onset (the `cross-off-grid` of §6, generalised, reported with the nearest onset of that part at or after the landing); two or more flights landing on one onset, a collision; and an onset that no flight lands on. Because O is finite, a map from O into O that is one-to-one is onto, so an unfed onset only ever appears alongside a fault of the first two kinds in the same cross group: those name the cause and the unfed onset the consequence, which is §2's rule that the error shown first is the cause.

Predicate 2 holds automatically in digit notation, where a `0` is not an onset. It is stated because the model's own serialisation (§9.7) could write a flight of height 0, and because it is what makes the unwrapped landing later than the launch. There is no third predicate and no height ceiling: any h ≥ 1 is juggleable. A ceiling in beats would falsify the theorem of §9.5 (one kick in a 16-step bar is a 16-beat flight), and a ceiling in seconds would make juggleability depend on tempo; the ceiling is presentation instead (`SPEC.md` §6).

For a vanilla pair, predicate 1 is §2's condition that the landings are distinct; for two parts in one-hand counting it is §6's check per hand. Passing between jugglers adds nothing to this list. Multiplex would relax predicate 1 to a capacity per onset.

App: `judge` returns the faults per cross group. Failing removes balls from the picture and never stops the sound.

### 9.4 Cross groups and the ball count

Join parts i and d whenever some flight of i lands in d ≠ i. The connected components of this graph are the cross groups, and a part with no crossing flights is a group of one. No flight leaves its group, so predicate 1 holds for f iff it holds for f restricted to each group, and every fault belongs to exactly one group. A group is judged whole: a faulted group gets no balls while its onsets still sound, and the other groups keep theirs.

Theorem (ball count as winding number). Let G be a fault-free group, so that f permutes its onsets, and let H be the sum of the heights of its flights over one cycle. Then H is a multiple of C, and G carries B = H / C objects. Proof: an orbit of f returns to the onset it started from, so the heights along it add up to a whole number w of cycles; a ball following the orbit takes w cycles to come back, and within one cycle the orbit's flights are flown by w distinct balls one cycle apart, as §6's last consequence has it. Summing over the orbits gives B = H / C. Read on a circle of circumference C, B is the winding number of f.

This is §2's average theorem in general position. In one-hand counting a digit is h / s and a part has n = P / s beats, so H / C is the sum over parts of each part's mean digit, zeros included, which is §6's combined count; for a vanilla pair it is the mean of the siteswap's digits. B is a mean over beats, not over onsets: son clave's five nonzero digits average 16/5, and it carries one ball.

A fractional mean is the same fault seen from the digits. If f is a bijection then H is a multiple of C, so an H / C that is not whole proves predicate 1 false. The converse fails: `432` has H / C = 3 and three flights landing on one pulse. The fractional mean is therefore not a predicate of its own but a sufficient sign that predicate 1 fails, found with one sum before any landing is checked. That is why the digit editor keeps it as its message: someone typing `43` reads "3.5 balls" before "collision at beat 3", the cheaper of two presentations of one fault.

Within a cross group of several parts, one part's share of H need not be a whole number of cycles even when the group is fault-free: the hand that throws the 5s of the shower `51` carries 2.5 balls' worth. Ball counts are defined per group, and the total is the sum over the fault-free groups.

App: the summary shows the count per group; the digit editor shows the fractional message; `Schedule.balls` is the sum over fault-free groups.

### 9.5 The default rule and the k-balls theorem

Let a part have onsets on pulses o₀ < o₁ < … < oₘ₋₁ within one period P, with m ≥ 1, extended periodically by oⱼ₊ₘ = oⱼ + P. With the ball knob k ≥ 1 the default rule sends oⱼ to oⱼ₊ₖ in the same part, a flight of height oⱼ₊ₖ − oⱼ. Every part starts at k = 1, where each height is the gap to the next onset: the one-ball line of `POLYRHYTHMS.md`.

Theorem (k balls over a fixed line). For every k ≥ 1 the default rule is juggleable and the part carries exactly k objects. Proof: j ↦ j + k mod m permutes the onsets and every height is positive, so both predicates hold; and the sum over one period of oⱼ₊ₖ − oⱼ telescopes to kP, so over the cycle H = kC and B = k by §9.4. ∎

Any rhythm anyone types or taps is therefore already a juggling pattern, and the ball count is a knob turned afterwards. Turning it changes the flights and never the onsets, so the sound is unchanged unless the mapping reads flight length. Because there is no ceiling this holds for every line: a 16-step line with one hit, at k = 1, is a single 16-pulse flight. The shift by k on m onsets has gcd(k, m) orbits, each carrying k / gcd(k, m) balls, so for a lone default part with C = P the Schedule's period is k / gcd(k, m) cycles.

Son clave on sixteen pulses, onsets 0, 3, 6, 10, 12, is `3 0 0 3 0 0 4 0 0 0 2 0 4 0 0 0` at k = 1, one ball, and `6 0 0 7 0 0 6 0 0 0 6 0 7 0 0 0` at k = 2, two balls on the same five hits, with a period of two cycles.

Manual parts and cross groups. The Pattern view edits a part's digits directly, and a part edited by hand is manual. A cross out of a default part lands on an onset that the catching part's own default rule already feeds, since that rule reaches every onset of its part, so a lone `x` between default parts is always a collision, and it leaves an onset of the throwing part unfed. Crosses balance only when both ends are edited together, as in `2 2x 2` / `2x 2`. Being manual is therefore a property of a cross group: editing an `x` makes every part of its group manual, and a reset re-derives every part of the group by the default rule at k = 1. A manual group offers no k, because a part with crosses has no ball count of its own (§9.4); it shows the group's B and a reset. When a manual group's onsets change (a hit toggled, the generator run, a phase change on one of its parts), its manual flights are dropped and the group is re-derived at k = 1 per part, with a one-line notice, so the onset view and the flight view never need reconciling.

Theorem (one ball through a union). Suppose no two parts have an onset on the same pulse. Sending every onset to the next onset of the union of all parts, in whichever part that is, is the default rule at k = 1 on the union: it is juggleable, carries one ball, and crosses exactly where consecutive onsets of the union belong to different parts. Conversely, if two parts share a pulse, no one-ball pattern exists on those onsets: a single orbit with H = C visits its onsets at strictly increasing times within one cycle, so no two of them share a pulse.

Kotekan shows both sides. Nyog cag, the hocket `2 0` / `0 2`, is two balls as two one-ball parts and one ball as `1x 0` / `0 1x`: the same onsets and the same sound, a different picture. Kotekan telu's polos and sangsih, `1 2 0 1 2 0 1 2 0 1 2 0` / `0 1 2 0 1 2 0 1 2 0 1 2`, share the pulses 1, 4, 7, 10 (the shared pitch is what makes it telu), so it plays as two one-ball parts and has no one-ball version.

App: a ball stepper per default part; on a manual group, its derived count and "reset". `flightsOf` applies the default rule to default parts.

### 9.6 Phase and lattice refinement

A part's phase moves every beat and onset of the part by φ pulses. Changing it by a whole number of pulses keeps the lattice and the cycle, since C does not depend on phases, and moves only where that part's onsets fall. A default part's flights move with its onsets and keep their heights, so a group of one keeps its verdict and its count at every phase. A part in a manual group of several parts is different: its crosses' landings move relative to the other parts, so a phase change there counts as a change of the group's onsets (§9.5).

Refinement. A phase that is not a whole number of current pulses (half a beat, a third of a pulse) refines the lattice: every part's spacing, phase and unit, and every height, is multiplied by the least integer r that makes the requested phase whole, and the result is normalised. Refinement is a change of unit. It multiplies C and every position by r, so it maps onsets to onsets and flights to flights, preserves both predicates, and preserves every B, since H and C both grow by the factor r. The pulse length in seconds divides by r, so nothing audible moves except the part that was shifted. Stepping the phase in whole current pulses never refines.

Clapping Music is two parts of spacing 1 on 12 pulses, each with onsets 0, 1, 2, 4, 5, 7, 9, 10 at k = 1, and part 2 at phase p = 0 … 11. Part 2 at phase p is part 1's line rotated by p, which is the whole piece. The cycle is 12 at every p. The two lines strike together on 8 pulses at p = 0, on 6 at p = 3 and p = 9 (the famous positions), and on as few as 4 at p = 1, 6 and 11.

The mbira interlock is `3 0 0 3 0 0 3 0 0 3 0 0` (onsets 0, 3, 6, 9) against the same line at phase 1 (onsets 1, 4, 7, 10), with C = 12 as written. Written `3 0 0`, the same rhythm has C = 3: the cycle follows the written period, the sound does not.

Three against two with part 2 at phase 1 is the grids (2, 0) and (3, 1) on a 6-pulse cycle, with `1` on each part: beats 0, 2, 4 and 1, 4, coinciding at 4 rather than 0. It is juggleable with two balls, and §6 could not say it, because its rule 4 fixed both phases at 0.

Corollary (vanilla siteswap is the half-beat offset; this replaces §6 rule 5 as a rule of its own). Take two parts of spacing 1 beat with an onset on every beat, and ask for part 2 at half a beat. Half a beat is not on the lattice, so r = 2: spacing 2, phases 0 and 1, unit 1, and every pulse is a beat of exactly one part. Write the siteswap t₀ … tₙ₋₁ with throw i on pulse i, repeated once when n is odd so that the cycle is even; pulse i is a beat of part i mod 2. A flight of height tᵢ from pulse i lands on pulse i + tᵢ, which belongs to part (i + tᵢ) mod 2, so it crosses iff tᵢ is odd. That is §1's rule, now derived rather than assumed. Predicate 1 on the pair is §2's condition, and B = H / C is the mean of the digits, which is the average theorem. The unit is 1 because the digits count pulses: in one-hand counting at spacing 2, vanilla `3` would be written 1.5, which is why vanilla keeps its own unit and its own parser. Vanilla `531` comes out as spacing 2, phases 0 and 1, C = 6 pulses for a period of 3 throws, which is what §6 did by hand.

App: `withPhase` applies the rule and the refinement; `partsFromVanilla` writes the corollary's layout directly; the cycle readout updates when the lattice refines.

### 9.7 Notation

Three readable forms produce the same parts. The first is vanilla siteswap, one string for two parts, laid out by the corollary of §9.6. The second is digits with zeros per part in one-hand counting, `a / b`; a `/` always means this form, so at 1:1 a single string is vanilla and `a / b` is two parts at phase 0. The third is the model's own serialisation, Multi-Hand Notation: a matrix with one row per part and one column per pulse whose cells hold the flights launched there as (height, destination part). The name is Ed Carstens'. Juggling Lab builds its patterns on it internally, as a matrix of hands and discrete times whose elements point to later elements, with a slot index for multiplex, and its source says MHN "has no standardized string (textual) representation" [13]; the textual form of the third notation is therefore ours to fix, with one slot per cell.

The Euclidean generator E(k, n) of Toussaint [16], after Bjorklund [17], spreads k onsets as evenly as possible over n pulses. Its gaps take at most two values, ⌊n/k⌋ and ⌈n/k⌉, and rotating it is a phase (§9.6). Not every line with two gap lengths differing by one is Euclidean (cascara is not), and son clave, with gaps 3, 3, 4, 2, 4, is not Euclidean at all (`POLYRHYTHMS.md`).

App: the parsers `partsFromVanilla` and `partsFromLines`, `textOf` for the way back, and `euclid` with `rotate` for the generator.

## 10. Passing (2026-10-30)

A juggler is a pair of parts, juggler j being parts 2j and 2j + 1 (`docs/plans/v2-share-kits-passing.md`, wave 2 ruling 1). A pass is a flight whose landing part belongs to another juggler. Nothing in §9 changes: the flights of several jugglers are one set of flights on one lattice, the two predicates of §9.3 judge them as they judge any cross, and the ball count is the winding number of §9.4 over the cross group the passes join. Passing adds a notation and nothing else to the model.

Passing siteswap (form 4). `<3p 3|3p 3>` writes one vanilla sequence per juggler between `|`, a `p` after a digit marking a pass to the other juggler, `p<n>` naming the n-th juggler (from 1) when there are three or more. Inside this form `p` is the pass mark and height 25 cannot be written, as `x` is not 33 in vanilla. Each sequence is laid out as the corollary of §9.6 lays out a vanilla siteswap, at parts 2j and 2j + 1: spacing 2, phases 0 and 1, unit 1, an odd-length sequence read twice. So every juggler throws its phase-0 hand on the even pulses and its phase-1 hand on the odd ones, together.

Which hand a pass lands in follows from the lattice, not from a convention. A throw of height h made at pulse i lands at pulse i + h, which is a beat of the phase (i + h) mod 2 hand of whichever juggler catches it. So a pass of height h at siteswap position i of juggler j lands in part 2t + ((i + h) mod 2) of the target juggler t; an odd pass lands in the target's other-phase hand and an even pass in the same-phase hand, the parity rule of §9.6 across jugglers. With the convention that every juggler starts in the right hand (phase 0 is the right hand), an odd pass is right to left: for two jugglers facing each other, a straight pass; an even pass, right to right, is diagonal. The convention is Juggling Lab's for its `<…|…>` notation and is confirmed against its notation page by stream P1, which records the URL here. <!-- P1: replace this comment with the page opened and what it says. -->

Worked cases for the tests. `<3p 3|3p 3>`, every-others: four parts, one beat each; part 0 throws 3 to part 3 and part 2 throws 3 to part 1 at the even pulses, parts 1 and 3 throw 3 to their own juggler's other hand at the odd ones; cycle 2, every onset fed once, H / C = 12 / 2 = 6 balls. `<3p|3p>`, ultimates: 6 balls, cycle 2. `<4p 3|3 4p>`: 7 balls, the 4p from part 0 landing in part 2 (even pass, same-phase hand), cycle 4. `<3p2 3|3p3 3|3p1 3>`: three jugglers passing in a ring, 9 balls. `<3p 3|3 3>` fails predicate 1: juggler 2's hand receives juggler 1's pass on an onset its own 3 already feeds, a collision, and juggler 1's hand that threw it is left unfed. `<5 3|3>`: two jugglers who never pass are two cross groups, 4 and 3 balls, 7 in all.

App: `partsFromPassing` and `passingText` in `src/core/passing.ts`; `jugglerOf` and `isPass` name the grouping for the pictures and the sound; the short link `#3p-3|3p-3`.
