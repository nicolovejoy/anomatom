# jugglebeat — the math

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

App: the Swap knob, and the first suggested fix for a collision (swap the colliding pair, which moves one landing off the other).

## 4. States and the state graph (Polster [5]; Chung and Graham 2008 [4])

At any beat the juggler's state is the set of future beats that already have a ball due to land: a bit vector of length max height, with b ones for b balls. A throw of height h from a state is legal iff bit h is empty; it moves to the next state by shifting and setting bit h. Patterns are cycles in this graph. Two patterns can be chained without a drop only through a state they share. The ground state (balls landing on the next b beats) is shared by every pattern that passes through it; `3`, `441`, `531` all do. Chung and Graham call a cycle that visits its base state once *primitive*; longer cycles are concatenations of primitive ones.

App: v1 uses the ground state as the common start and changes pattern only at a cycle boundary that returns to it. v2 uses the graph for transitions between arbitrary patterns and for generating patterns from a state.

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
5. Vanilla siteswap is not the 1:1 case of this model but its half-beat-offset case: both hands on 2-pulse beats, hand 2 one pulse behind, every pulse a beat of exactly one hand. The app models 1:1 this way, so a vanilla `3` is a 3-pulse flight and odd digits cross.

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

Pulse length in seconds = 60 / (bpm₁ × pulsesPerBeat₁), where pulsesPerBeat₁ = ratio₂ / gcd(ratio₁, ratio₂). Hand 2's bpm follows. A flight of height h on a hand with k pulses per beat lasts h × k pulses; its apex height is proportional to (h × k)², as a parabola under gravity gives. Pulses stay integers in the Schedule; multiplication by the pulse length happens only when an audio event is scheduled or a frame is drawn.

## 8. Worked cases for tests

| Pattern | Ratio | Balls | Valid | Note |
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
| `510` | 1:1 | 2 | no | landings 6, 3, 3 → mod 3 all 0: three-way collision with a `0` |
| `2` / `2` | 3:2 | 4 | yes | Nickmans' non-crossing 3:2 pattern: each hand fountains two balls on its own grid; cycle 6 |
| `2x 2 2` / `2 2x` | 3:2 | 4 | no | hand 1's `x` leaves pulse 0 and lands at 4, between hand 2's beats 3 and 6; hand 2's `x` leaves pulse 3 and lands at 9, off hand 1's even grid |
| `2 2x 2` / `2x 2` | 3:2 | 4 | yes | the same digits rotated: hand 1's `x` leaves pulse 2, hand 2's leaves pulse 0, both land at pulse 6, each into the slot the other vacated. The demo pattern; its period is 18 pulses |
| `2x 2` / `2 2` | 3:2 | 4 | no | period 2 on a 3-beat hand makes a 12-pulse cycle; the `x` fires at pulses 0, 4, 8 and lands at 4, 8, 12, legal only the third time |

The 3:2 rows are the ones that prove the project. Their ladders were drawn by hand (2026-10-28) before the tests were written; the tests in `src/core/table.test.ts` encode this table row for row.
