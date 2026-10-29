# Brief for the rethink session (Fable)

Written 2026-10-29 by the Opus governing session, for a planning session with Fable. Nico's concern: zoom out and rethink the basic mental models before more waves. Nothing here is decided; it is the situation and the questions.

## Where things stand

- v1 shipped (`docs/plans/v1-parallel.md`) and the phone sheet and first-minute picker shipped (`docs/plans/phone-sheet.md`, PRs 24-28). Live at https://anomatom.com, smoke-passed on iPhone.
- `docs/plans/v2-share-kits-passing.md` (merged, not started): wave 1 kits / share-in-reach / space-bar fix; wave 2 passing; 3D juggler (#7) after passing (decided).
- `docs/POLYRHYTHMS.md` (Nico's sourcebook, new): 19 real polyrhythms reduced to presets. Every one-ball line in its table was checked: each sums to its length and lands on its own hits.

## The tension the sourcebook exposed

The app's model is juggling-first: one juggler, two hands, a vanilla siteswap at 1:1 or a one-hand sequence per hand at other ratios, sounds chosen by throw height. The sourcebook thinks rhythm-first: lines of hits, each line a voice (an instrument), two or more lines, phase between lines, a ratio between grids. Concretely:

1. **1:1 means two different things.** The app's 1:1 is one vanilla sequence alternating hands; 12 of the sourcebook's 19 rows are "1:1, two independent lines, hands striking together", which the app cannot take today.
2. **Voice follows height, not line.** The Mapping picks a drum per throw height, so a clave line (`3 0 0 3 0 0 4 0 0 0 2 0 4 0 0 0`) plays three drums. The sourcebook wants one voice per hand (per line), possibly from different kits.
3. **Streams are capped at two.** Several sources (kotekan with pokok, Agbekor, Reich's Drumming) need three or four. Passing gives four hands, so passing with zero passes is "four lines", which is the multi-layer idea Nico set aside in favour of passing; the two may be one feature.
4. **Balls are incidental to the rhythm.** Every sourcebook row is one ball per hand, so the juggler is visually dull. Any hit pattern can be juggled with k balls (each throw lands k hits later: son clave with 2 balls is `6 7 6 6 7` on the same hits). Ball count could be a free knob over a fixed rhythm, which inverts today's model (the pattern defines the rhythm).
5. **Missing controls the sources want:** rotate/phase one line against another (Clapping Music, mbira); per-line kit; ratios beyond 9 (16:3 acid polymetre); tempo below 40 (Eno at 12 bpm).

## Questions for the session

1. What is the primary object a user edits: a juggling pattern that happens to make rhythm, or a rhythm (lines of hits, per voice) that a juggler then performs?
2. What are "hands", "lines", "voices" and "jugglers" to each other? One line per hand always? Can a voice span hands?
3. Is the share-link / preset format the rhythm, the siteswap, or both?
4. Does passing stay the next big feature, or does a general N-line model (of which passing is a case) come first?
5. How do the sourcebook presets enter the app: as siteswaps, as hit grids converted to siteswap, or as a new rhythm notation?
6. What do SPEC.md and MATH.md need to say differently, and which v2 plan items survive?

Wave 1 of the v2 plan (kits, share button, space-bar fix) is independent of the answers and can run in parallel with the rethink if Nico wants.
