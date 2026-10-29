# anomatom polyrhythm sourcebook

Oct 29, 2026 · @Nicholas Lovejoy

## Purpose

A catalogue of real polyrhythms, each reduced to what anomatom can play: a hand ratio, a siteswap per hand, cross marks, a kit and a tempo. The code agent turns the preset table (below) into loadable presets with a one-line note on where each comes from. Nothing here is a transcription of a recording; each entry is the rhythmic skeleton that musicians and ethnomusicologists agree defines the style.

Scope: polyrhythm, meaning two or more pulse grids sounding together or one grid grouped two ways at once. Polyphony (independent melodies) is out.

## How an example becomes a preset

The app has four levers, and most patterns use two or three:

1. **Ratio** carries the true polyrhythm: 3:2, 4:3, 3:4, 2:3, 5:4. One hand is one pulse stream.
2. **Per-hand siteswap** carries the grouping inside a stream: digits of different heights give accents of different lengths, a `0` is a rest, a `2` a held beat. Any single line of hits on a grid is a one-ball siteswap: a throw at each hit with height equal to the gap to the next hit, zeros between. One ball means the mean of the digits is 1, which is a free sanity check on a transcription.
3. **Cross marks** place the coincidences: a cross is legal only where the two grids meet, so marking one makes that beat the accent, which is where traditional patterns put the bell or the clave's downbeat.
4. **Mapping** picks the voices: which 808 sound each height gets, and the pan and gain per hand.

What siteswap cannot express, so these presets will approximate rather than replicate: (a) patterns on one grid whose accents are not a repeating integer sequence (free rubato); (b) swing and microtiming; (c) more than two simultaneous streams in v1, so a three-part texture is reduced to its two most characteristic parts; (d) pitch melodies, since v1 maps height to drum, not note. Where an entry needs (c), the table says which two parts were kept.

Reading the entries: a pattern written as `x . . x . . x .` is a grid of equal pulses with hits on the x. A "3:2" ratio means hand 1 makes 3 beats while hand 2 makes 2.

## West and Central Africa

The root of nearly everything else in this document is a 12-pulse cycle heard two ways at once: as 4 groups of 3 and as 3 groups of 4 (or 6 of 2). That is 3:2 (and 4:3) held in one bell line, which is exactly what a two-hand ratio with cross marks on the coincidences gives the app.

**The standard bell pattern (Ewe gankogui, also Yoruba and across the region).** Twelve pulses, seven strikes on pulses 1, 3, 5, 6, 8, 10, 12; rests on 2, 4, 7, 9, 11. In grid form: `x . x . x x . x . x . x`. The clap against it (Ewe "dzi") falls every three pulses, on 1, 4, 7, 10. The bell is the asymmetric line, the clap is the 4-beat feel, and the 3-beat feel (pulses 1, 5, 9) is felt rather than struck. [ancient-future.com bell and clap](https://ancient-future.com/bellclap.html)

As a preset: ratio 4:3 (hand 1 the four claps, hand 2 three felt beats), and the bell as a siteswap on a third stream would need v2. In v1 the honest version is **hand 1 on a 12-pulse grid playing the bell as the one-ball siteswap \`2 0 2 0 1 2 0 2 0 2 0 1\`, hand 2 at 3 beats per cycle (ratio 12:3, or 4:1 on a 4-beat grid) on a low drum**, with a cross mark on pulse 1, the one point where bell, clap and triple beat all meet. Listen for the bell flipping between duple and triple as the ear chooses a hand.

**Agbekor (Ewe war dance, Ghana and Togo).** Same bell, with a lead drum (atsimevu), supporting drums (sogo, kidi, kagan) and rattle (axatse) each locking to a different subdivision. Kagan plays the off-pulses, kidi answers the lead; the texture is three or four streams. For the app: bell on hand 1, kagan's offbeats as the `0 x` siteswap on hand 2 at 1:1 over 12 pulses. The lead drum is improvised and out of scope.

**Shona mbira (Zimbabwe).** Two players, kushaura (leader) and kutsinhira (follower), interlock so that "the other player places his series of notes within the spaces of the first player"; Scherzinger: "one is always playing one pulse off", "no player is responsible for a single musical line", and the result throws up "phantom patterns" that neither plays. The felt meter and the heard meter differ, and a piece can be heard in 3/4 or in 12/8 depending on which pulses the listener holds. The hosho rattle holds the 12-pulse triple feel. [Afropop, Scherzinger on Shona mbira](https://afropop.org/articles/phantom-patterns-martin-scherzinger-on-shona-mbira-music)

As a preset: two hands at 1:1 on a 12-pulse grid, hand 2 a one-pulse offset of hand 1 (`3 0 0 3 0 0 3 0 0 3 0 0` against `0 3 0 0 3 0 0 3 0 0 3 0`), ratio 3:2 for the hosho layer later. This one is the strongest argument for a Soundfont kalimba or marimba voice (see Sound palette), since the point is a phantom melody.

**Gnawa (Morocco).** Krakeb iron castanets and guembri bass. The krakebs play a 12/8 figure that the ear hears as 6/8 and then, as tempo rises through a ritual, as 3/4 over a bass in duple. Not opened as a source for this doc; included as a 3:2 example with a very different timbre (metal castanets against bass), which the 808 can imitate with cowbell against kick. Mark as unsourced until a reference is added.

## Afro-Cuban and Afrobeat

**Son clave, 3-2.** Five hits in a sixteen-pulse cycle. The standard grid is `x . . x . . x . . . x . x . . .` (onsets at pulses 0, 3, 6, 10, 12, counting from 0). Ethan Hein, following Toussaint, lists it among the sixteen-step rhythms he calls "maximally even", meaning, in his words, "spaced more or less equally in time"; he credits it with "rhythmic oddity" (no two hits sit opposite each other on the circle), and notes its first three hits imply triple meter against the 4/4 underneath, which is the polyrhythmic hook. He also notes the Ghanaian kpanlogo bell is the same rhythm. [Hein, Why is son clave so awesome](https://ethanhein.substack.com/p/why-is-son-clave-so-awesome). The grid itself is the standard one in Toussaint's *Geometry of Musical Rhythm*; Hein's diagrams are images, so the positions here are from that standard, not quoted from his page.

Correction (2026-10-29): in the strict sense son clave is **not** maximally even, and this document said otherwise in its first draft. Its gaps are 3, 3, 4, 2, 4: three different lengths. A maximally even (Euclidean) rhythm of k hits on n pulses has gaps of at most two lengths, ⌊n/k⌋ and ⌈n/k⌉, differing by one; for five on sixteen that is E(5,16) with gaps 3, 3, 3, 3, 4, which Toussaint's 2005 paper names "the Bossa-Nova rhythm necklace of Brazil", not the clave. Clave is *nearly* even, which is the loose sense Hein uses. The converse also fails: two gap lengths differing by one is necessary but not enough (cascara, below, has gaps of 1 and 2 and is not E(10,16)). Checked by running Bjorklund's algorithm on every grid in this file (2026-10-29).

**Rumba clave** moves the third hit one pulse later: `x . . x . . . x . . x . x . . .`. **Tresillo** is the 3-side alone, `x . . x . . x .` over eight pulses, and is the 16-pulse cousin of the 12-pulse bell's first half. Tresillo is Euclidean, E(3,8), gaps 3, 3, 2; Toussaint 2005 opens with it. Rumba clave (gaps 3, 4, 3, 2, 4) is not.

**Cascara** (timbale shell pattern): `x . x x . x . x x . x . x x . x` over sixteen, played with 3-2 clave underneath. Standard pattern, not quoted from a source here.

As presets: any single line of hits on a grid is a **one-ball siteswap**: a throw at each hit whose height is the gap to the next hit, zeros in between. Son clave on sixteen is `3 0 0 3 0 0 4 0 0 0 2 0 4 0 0 0` (landings 3, 6, 10, 12, 16; one ball). Rumba is `3 0 0 4 0 0 0 3 0 0 2 0 4 0 0 0`. Hand 2 keeps the pulse with `4 0 0 0 4 0 0 0 4 0 0 0 4 0 0 0`, or, with a 4:1 ratio, simply `1`. The three-against-two feel comes from the first digits, not from the ratio. Cascara on hand 1 against clave on hand 2, both one-ball on sixteen, is the richest two-stream Afro-Cuban preset and needs no ratio at all. The ladder strip then shows clave as five arcs of unequal length, which is the piano roll of clave.

**Afrobeat, Tony Allen.** All of Allen's patterns are in 4/4; the variety is in how they are composed and grouped ([Rolling Stone on the *Birth of Afrobeat* clip](https://www.rollingstone.com/music/music-news/tony-allen-afrobeat-drum-patterns-unseen-doc-clip-993318)). Modern Drummer: the hi-hat is his "secret weapon", inspired by Max Roach, with patterns that "make cruel demands on limb independence" and can seem at odds with the kick and snare yet mesh; the bass drum is "often kicked in double strokes"; the snare is dry and placed unpredictably; afrobeat fused James Brown's funk with highlife and jazz. "My drumming is like orchestration by itself." [Modern Drummer, Tony Allen: Afrobeat Innovator](https://moderndrummer.com/2011/10/tony-allen-afrobeat-innovator)

So Allen is not a ratio polyrhythm; he is several additive patterns on one 16-pulse grid that imply different groupings. For the app: hand 1 the hi-hat as a one-ball line (a classic afrobeat hat figure groups sixteen as 3+3+2+3+3+2, i.e. `3 0 0 3 0 0 2 0 3 0 0 3 0 0 2 0`), hand 2 the kick with doubles, e.g. `4 0 0 0 2 0 2 0 4 0 0 0 4 0 0 0`. Ratio 1:1, tempo 100 to 110. The listen-for is the hat's 3+3+2 fighting the kick's 4. This is the preset most likely to make Charlie grin, and the one where the 808's closed hat and kick are the right voices without apology.

## Minimalism

**Steve Reich, Clapping Music (1972).** One performer claps a 12/8 pattern, described as "a variation on an African bell pattern", for the whole piece; the second claps the same pattern shifted ahead by one eighth note after every eight or twelve bars, until twelve shifts bring them back to unison; a typical recording runs just under five minutes. [Wikipedia, Clapping Music](https://en.wikipedia.org/wiki/Clapping_Music). The pattern (standard, not quoted from that page) is `x x x . x x . x . x x .` on twelve pulses: hits at 0, 1, 2, 4, 5, 7, 9, 10. As a one-ball siteswap: `1 1 2 0 1 2 0 2 0 1 2 0`.

This is the ideal anomatom preset because it is already two hands on the same 12-pulse grid, and the shift is a rotation of hand 2's siteswap by one digit. A "phase" knob that rotates hand 2 would play the whole piece: twelve positions, hand 2 = hand 1 rotated by k. The app has no such knob today; it is one line in the Rhythm tab and a strong candidate for the presets wave. Listen for the resultant pattern changing character at each position (positions 3 and 9 are famous for sounding like a new piece).

**Piano Phase (1967).** Same idea with a 12-note melody and continuous drift rather than stepped shifts; two pianists, one holding tempo and the other speeding up slightly until a full note ahead. The app cannot drift (pulses are integers), so Piano Phase is approximated by the stepped version, which is what Clapping Music is. The pitched version needs the height-to-pitch mapping.

**Drumming (1971).** Four parts, bongos, marimbas, glockenspiels and voices, built from one 12-pulse pattern by phasing and by "rhythmic construction" (adding one note at a time to rests). A preset could start from the completed pattern and let the user zero digits to hear the construction in reverse. Three-plus streams; out of v1 scope beyond two parts.

**Brian Eno, Music for Airports (1978), 2/1.** Seven tape loops, each one sung note, of unequal length: C at 20.1 s, high F at 19.6 s, D flat the longest by a wide margin. In a 1996 talk Eno described loops that repeat "in cycles that are called incommensurable" and "are not likely to come back into sync again", giving figures of 23 1/2, 25 7/8 and 29 15/16 seconds for three of them. [Reverb Machine, Deconstructing Music for Airports](https://reverbmachine.com/blog/deconstructing-brian-eno-music-for-airports/)

This is polyrhythm at the scale of tens of seconds, and in the app's terms a ratio like 23.5 : 25.875 : 29.9375, which is 376 : 414 : 479 in sixteenths of a second, with an LCM in the millions. Two lessons for anomatom. First, a hand ratio near 1:1 but not equal (8:7, 9:8, 11:10) at a slow tempo with a long sustained voice gives the Eno effect: a slow drift of coincidence across minutes. Second, this is where the pad on the downbeat earns its place: each hand is a note, not a drum, and the coincidence is a chord. A preset: ratio 8:7, one ball per hand (`1`), tempo 12 bpm, Mellotron voices, no drums. The ladder strip becomes a slow moire.

## Gamelan and India

**Balinese kotekan.** Fast interlocking figuration, mostly on gangsa and reyong, over the slower pokok melody; two parts, polos and sangsih, each filling the gaps in the other so that neither is complete alone, running four or eight times faster than the pokok and giving "the illusion of a single melodic line". Named types: nyog cag (strict alternation, every other note), nyok cok, kotekan telu (three shared pitches) and kotekan empat (four pitches, no sharing). [Wikipedia, Kotekan](https://en.wikipedia.org/wiki/Kotekan). Grids from that page over a 12-pulse pokok of three notes:

- Pokok `1 . . . 2 . . . 3 . . .`
- Telu, polos `1 2 . 1 2 . 1 2 . 1 2 .` and sangsih `. 2 3 . 2 3 . 2 3 . 2 3`
- Empat, polos `1 2 . 1 2 . 1 2 . 1 2 .` and sangsih `4 . 3 4 . 3 4 . 3 4 3`

This is not a ratio polyrhythm; it is two hands at 1:1 whose rests interlock, a 3-pulse figure over a 4-pulse pokok, so the figure and the pokok realign every 12. In one-ball terms, polos (hits 0, 1, 3, 4, 6, 7, 9, 10) is `1 2 0 1 2 0 1 2 0 1 2 0` and sangsih (hits 1, 2, 4, 5, 7, 8, 10, 11) is `0 1 2 0 1 2 0 1 2 0 1 2`; every pulse is struck, and pulses 1, 4, 7 and 10 (the shared pitch 2) are struck by both hands. An earlier draft said "every pulse is struck by exactly one hand", which the hit lists above contradict (corrected 2026-10-29; it matters because a single ball can only visit onsets on distinct pulses, `MATH.md` §9.5). The preset should use two metallic 808 voices or, better, two pitched Soundfont voices, since kotekan is heard as melody. Nyog cag is the trivial case: `2 0` against `0 2`, the hocket.

**Colotomic structure** (Javanese and Balinese): the gong cycle is nested, with the big gong once per cycle, kempul and kenong at halves and quarters, kethuk at finer points. Nested powers of two, not a polyrhythm, but the app's cycle marker and downbeat accent are exactly a two-level colotomy; worth a note on the About page, not a preset.

**Carnatic tala and konnakol.** The tala is a fixed count (adi tala is 8 beats); nadai changes the subdivision of each beat (3, 4, 5, 7, 9 per beat), and a phrase in one nadai against the tala's count is a ratio polyrhythm in the strict sense: five per beat against the hand-clap of the tala is 5:1, and a 3-pulse phrase repeated in 4-nadai is 3:4 until it realigns. Konnakol is the spoken form (ta ka di mi, ta ki ta, ta ka). [Wikipedia, Konnakol](https://en.wikipedia.org/wiki/Konnakol). A **tihai** is a phrase played three times, spaced so that the last stroke lands on sam, the cycle's first beat; working out the gap is the arithmetic every student learns. The tihai page was not opened for this doc; the definition is standard, with the figures below from general knowledge.

As presets: ratio 5:4 (hand 1 five per beat, hand 2 four) with `1` on each hand is the plain nadai exercise and already sounds like konnakol practice. A tihai preset on a 16-pulse cycle: hand 2 keeps the count with `4 0 0 0 4 0 0 0 4 0 0 0 4 0 0 0`; hand 1 plays a three-stroke phrase on pulses 0, 2, 3, repeats it at 5 and at 10, and the last stroke at 13 lands on sam (16): `2 0 1 2 0 2 0 1 2 0 2 0 1 3 0 0`. That one reads beautifully on the ladder: three identical arcs sliding across the grid and the last one closing on the downbeat.

## Electronic, trance and ambient

Most dance-floor polyrhythm is **polymetre**: a short loop against a 16-step loop, so the two realign every few bars. That is exactly a hand ratio with a 1-ball `1` on each hand, or a long siteswap on one hand against a short one on the other. Zoe Blade's notebook gives the canonical examples ([Polymetre and polyrhythm](https://notebook.zoeblade.com/Polymetre_and_polyrhythm.html)):

- Richie Hawtin, "F.U." and "Substance Abuse": three- or five-note TB-303 patterns against 16-step 909 patterns. Ratio 16:3 or 16:5 in app terms, or at 1:1 a 3-digit siteswap on hand 1 against 16 on hand 2 (the app's cycle is the LCM, 48 or 80 pulses).
- Hardfloor, "Acperience 1" and Autechre, "Windwind": a 303 or MC-202 part with a shorter pattern length than the drums; exact ratios not given.
- N-Trance, "Set You Free": a piano arpeggio in triplets throughout against a 4/4 track. Ratio 3:2 or 3:4, the trance example.
- Kraftwerk, "Autobahn" and Aphex Twin, "On": an eighth-note arpeggio with a dotted-eighth delay, or the reverse, so the delay implies a 3-against-4 grid without anyone playing it.
- Fatboy Slim, "Santa Cruz": a long run of dotted eighths by hand, 3 against the 4.

The page also makes the point the app's cycle marker embodies: three bars of 4/4 and four bars of 3/4 both hold twelve sixteenths, so the two notations are interchangeable and only the accents decide.

**Trance specifically.** The genre's polyrhythm is almost always the dotted-eighth delay or a 3-note arpeggio over 4/4 (the "Set You Free" and "On" cases), plus the off-beat open hat. The 808 kit covers the drums; the arpeggio needs the height-to-pitch mapping and a sustained synth voice, which is the pad instrument. Preset: hand 1 `1` at 3, hand 2 `1` at 4 (ratio 3:4), hand 1 on a pitched voice, hand 2 on kick, 138 bpm. A second trance preset at 16:3 with hand 1 on a short pluck is Hawtin's trick at trance tempo.

**Ambient.** See Eno under Minimalism: near-equal ratios (8:7, 9:8, 11:10) at very slow tempo with sustained voices. Jon Hopkins and Four Tet are often cited for polyrhythmic textures, but no source was opened that gives a pattern, so they stay out of the preset table until one is.

**Aphex Twin, Autechre.** Beyond "On" and "Windwind" above, their reputation for polyrhythm rests on programmed patterns with shifting lengths and microtiming the app cannot do. Autechre's "Windwind" is the honest preset; the rest is better covered by letting users enter odd ratios themselves.

## Jazz and rock cameos

Short, because these are single-figure polyrhythms a user can type in a few seconds, and none was researched beyond common knowledge for this doc.

- **Dave Brubeck Quartet, "Blue Rondo à la Turk"**: 9/8 grouped 2+2+2+3, three times, then 3+3+3 once. One hand on nine pulses, `2 0 2 0 2 0 3 0 0`, against a hand playing `3 0 0` three times. Ratio 1:1 over 9. "Take Five" is 5/4, a one-hand `3 0 0 2 0` against a 5:4 second hand if you want the strain.
- **Elvin Jones** (Coltrane quartet): the triplet ride against a duple left hand and bass, a 3:2 feel more than a figure. Preset: ratio 3:2, `1` on both hands, ride on hand 1, kick on hand 2, 200 bpm.
- **Radiohead, "Pyramid Song"**: the famous piano rhythm is heard either as a 3+3+4+3+3 grouping of sixteen or as swung 4/4. One-ball on sixteen: `3 0 0 3 0 0 4 0 0 0 3 0 0 3 0 0`. Note the resemblance to clave's first half.
- **Meshuggah**: long odd cycles (23, 25) on guitars against a steady 4/4 on cymbals, realigning every several bars. Hand 1 a 23-digit line, hand 2 `4 0 0 0`; the cycle is 368 pulses, which is also a stress test for the ladder strip.
- **Tool, "Schism"** and **King Crimson, "Discipline"**: shifting odd meters and 5-against-7 interlocking guitars respectively. Ratio 5:7 with `1` on each hand is the Crimson preset in one line.

## Preset table

For the code agent. Notation follows the app: `hand1 / hand2 at r1:r2`; digits are one hand's beats; `x` marks a cross. Every one-ball line sums to its period (mean 1), which the validator should confirm. Where the ratio column is 1:1 the polyrhythm is inside the digits. Kit voices name 808 sounds unless stated; "Soundfont" rows want the pitched kit when it exists and fall back to the 808 voice given. Tempo is hand 1 bpm. The first five rows are a good default card set; the rest go behind a "more" control.

| Preset | Source | Ratio | Hand 1 | Hand 2 | Voices (h1 / h2) | bpm | Listen for | Euclidean? (hand 1) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Standard bell | Ewe gankogui, 12/8 | 4:1 | `2 0 2 0 1 2 0 2 0 2 0 1` | `1` | cowbell / low tom | 120 | the bell flipping between 2-feel and 3-feel | yes: E(7,12), rotated (gaps 2 2 1 2 2 2 1) |
| Son clave 3-2 | Afro-Cuban | 1:1 | `3 0 0 3 0 0 4 0 0 0 2 0 4 0 0 0` | `4 0 0 0 4 0 0 0 4 0 0 0 4 0 0 0` | rimshot / kick | 95 | the 3-side implying triple against the 4 | no: gaps 3 3 4 2 4 (E(5,16) is 3 3 3 3 4) |
| Clapping Music | Reich 1972 | 1:1 | `1 1 2 0 1 2 0 2 0 1 2 0` | same, rotated k digits (k = 0..11) | clap / clap, panned apart | 160 | the resultant changing at each k; needs a rotate control | no: gaps 1 1 2 1 2 2 1 2 |
| Afrobeat hat and kick | Tony Allen style | 1:1 | `3 0 0 3 0 0 2 0 3 0 0 3 0 0 2 0` | `4 0 0 0 2 0 2 0 4 0 0 0 4 0 0 0` | closed hat / kick | 105 | 3+3+2 against 4 | yes: hat E(6,16), rotated, which is two tresillos E(3,8); kick no |
| Three against two | the juggling-native one | 3:2 | `2 2x 2` | `2x 2` | tom / snare | 90 | cross marks only on the coincidence; already a card today | not a line of hits; n/a |
| Rumba clave | Afro-Cuban | 1:1 | `3 0 0 4 0 0 0 3 0 0 2 0 4 0 0 0` | pulse as above | rimshot / kick | 95 | one hit later than son, more tension | no: gaps 3 4 3 2 4 |
| Cascara over clave | Cuban timbales | 1:1 | `2 0 1 2 0 2 0 1 2 0 2 0 1 2 0 1` | son clave line | hat or rim / rimshot | 95 | two 16-lines interlocking; ladder shows the mesh | no: two gap lengths but not E(10,16) |
| Kotekan telu | Balinese gamelan | 1:1 | `1 2 0 1 2 0 1 2 0 1 2 0` | `0 1 2 0 1 2 0 1 2 0 1 2` | two metallic voices (Soundfont gamelan or 808 cowbell/clave) | 180 | every pulse struck, the shared pitch by both, heard as one line | yes: each part E(8,12), which is E(2,3) four times |
| Hocket | kotekan nyog cag | 1:1 | `2 0` | `0 2` | two voices | 200 | the simplest interlock | trivially: E(1,2) each |
| Nadai 5:4 | Carnatic | 5:4 | `1` | `1` | clave / kick | 60 | pure ratio, konnakol practice | trivially (`1`) |
| Tihai on 16 | Hindustani/Carnatic | 1:1 | `2 0 1 2 0 2 0 1 2 0 2 0 1 3 0 0` | `4 0 0 0 4 0 0 0 4 0 0 0 4 0 0 0` | snare / kick | 100 | three equal phrases, the last landing on sam | no: gaps 2 1 2 2 1 2 2 1 3 |
| Mbira interlock | Shona | 1:1 | `3 0 0 3 0 0 3 0 0 3 0 0` | `0 3 0 0 3 0 0 3 0 0 3 0` (hand 2 one pulse late) | Soundfont kalimba, fallback cowbell / low tom | 130 | the phantom third pattern | trivially: E(4,12), which is E(1,3) four times |
| Trance arp over four | N-Trance, Aphex "On" | 3:4 | `1` | `1` | pitched pluck (pad voice) / kick | 138 | dotted-eighth feel | trivially (`1`) |
| Acid polymetre | Hawtin, Autechre | 16:3 | `1` | `1` | pluck / hat | 128 | the 3-loop walking across the bar, realigning every 3 bars | trivially (`1`) |
| Eno drift | Music for Airports | 8:7 | `1` | `1` | Mellotron voices, no drums | 12 | coincidences minutes apart; pad on both hands | trivially (`1`) |
| Blue Rondo | Brubeck | 1:1 | `2 0 2 0 2 0 3 0 0` | `3 0 0 3 0 0 3 0 0` | hat / snare | 180 | 2+2+2+3 against 3+3+3 | yes: E(4,9) (Toussaint names Brubeck); hand 2 E(3,9) |
| Pyramid Song | Radiohead | 1:1 | `3 0 0 3 0 0 4 0 0 0 3 0 0 3 0 0` | `4 0 0 0 4 0 0 0 4 0 0 0 4 0 0 0` | pitched voice / kick | 80 | 3+3+4+3+3 against straight 4 | yes: E(5,16), rotated (gaps 3 3 4 3 3), the bossa-nova necklace |
| Elvin triplet ride | Coltrane quartet | 3:2 | `1` | `1` | ride (hat) / kick | 200 | 3-feel over 2 | trivially (`1`) |
| Discipline | King Crimson | 5:7 | `1` | `1` | two plucks | 120 | 35-pulse cycle, interlocking guitars | trivially (`1`) |

Validation notes for the agent: (1) cascara line above is derived from `x . x x . x . x x . x . x x . x` (hits 0, 2, 3, 5, 7, 8, 10, 12, 13, 15; gaps 2, 1, 2, 2, 1, 2, 2, 1, 2, 1), check it. (2) Clapping Music and mbira need a per-hand rotation or phase control that does not exist yet; without it, ship them with hand 2 pre-rotated to one good position (Clapping k = 3; mbira leading `0`) and note the limitation on the card. (3) Rows marked Soundfont are better served by the pitched kit in the kits wave; until then use the 808 fallback named. (4) Tempi are starting points, not sourced. (5) The "Euclidean?" column (2026-10-29) was checked by running Bjorklund's algorithm for each E(k,n) and testing whether the hand 1 line is a rotation of it; "trivially" marks evenly spaced lines (`1`, or one hit repeated), which are E(k,n) with k dividing n. The yes rows are what the Euclidean generator (E(hits, pulses) plus rotation) can produce; the no rows stay presets. E(7,12), E(3,8), E(4,9) and E(5,16) agree with the patterns printed in Toussaint 2005; E(6,16) and E(8,12) are not in that paper's list because they are repetitions (of E(3,8) and E(2,3)), which it deliberately omits. (6) The kotekan empat sangsih grid above, `4 . 3 4 . 3 4 . 3 4 3`, has eleven symbols, not twelve; it is not in the preset table, but check it against the Wikipedia page before anyone uses it.

## Sound palette notes

What the 808 can stand in for, what it cannot, and what the kits wave should add. The named kits are the smplr DrumMachine set already planned (808, RZ-1, LM-2, MFB-512, CR-8000).

| Traditional voice | 808 stand-in | Better option | Why |
| --- | --- | --- | --- |
| Iron bell (gankogui, agogo, krakeb) | cowbell | CR-8000 or RZ-1 cowbell/agogo; Soundfont agogo | the 808 cowbell is iconic but one pitch; bells are two |
| Hand clap (dzi, Reich) | clap | 808 clap is right; pan two instances apart | Clapping Music lives on stereo separation |
| Shaker, axatse, hosho | closed hat | RZ-1 or LM-2 shaker if present; Soundfont shaker/cabasa | hat is too bright for a gourd rattle |
| Low drum (sogo, dundun, surdo) | low tom or kick | LM-2 or MFB tom | 808 kick is too sub-heavy for a skin drum at speed |
| Conga, bongo, djembe | mid tom, rimshot for slap | Soundfont congas/bongos | two pitches and a slap are the idiom |
| Clave, woodblock | rimshot or clave (808 has a clave) | 808 clave | fine as is |
| Kalimba, mbira, gamelan metallophone | cowbell (pitched by height-to-pitch) | Soundfont kalimba, marimba, or a dedicated gamelan set | these presets are melodies; drums miss the point |
| Sustained note (Eno, trance pad) | none | Mellotron or Soundfont pad, already planned as the downbeat pad | needs a voice that holds for seconds |
| Pluck (303, arpeggio) | none | Soundfont synth bass or a short pluck | polymetre presets need a tonal short voice |

Two mapping features these presets want that the Sound tab does not have today: (1) a **per-hand instrument** choice, so hand 1 can be a bell and hand 2 a drum from a different kit; (2) **height-to-pitch** as a live preset, already in the spec, so kotekan, mbira and the trance arp are melodies. Both are small; both are worth naming in the kits wave.

## Sources

Pages opened for this document. Patterns marked "standard" in the text come from common reference grids (Toussaint, *The Geometry of Musical Rhythm*, and standard drum pedagogy) and were not quoted from a page opened here; the code agent should keep that distinction on the About page.

- Ewe bell and clap pattern: https://ancient-future.com/bellclap.html
- Scherzinger on Shona mbira (Afropop): https://afropop.org/articles/phantom-patterns-martin-scherzinger-on-shona-mbira-music
- Ethan Hein, Why is son clave so awesome: https://ethanhein.substack.com/p/why-is-son-clave-so-awesome
- Rolling Stone, Tony Allen demonstrates afrobeat patterns: https://www.rollingstone.com/music/music-news/tony-allen-afrobeat-drum-patterns-unseen-doc-clip-993318
- Modern Drummer, Tony Allen: Afrobeat Innovator: https://moderndrummer.com/2011/10/tony-allen-afrobeat-innovator
- Wikipedia, Clapping Music: https://en.wikipedia.org/wiki/Clapping\_Music
- Reverb Machine, Deconstructing Music for Airports: https://reverbmachine.com/blog/deconstructing-brian-eno-music-for-airports/
- Wikipedia, Kotekan: https://en.wikipedia.org/wiki/Kotekan
- Zoe Blade, Polymetre and polyrhythm: https://notebook.zoeblade.com/Polymetre\_and\_polyrhythm.html
- Wikipedia, Konnakol (found, not opened): https://en.wikipedia.org/wiki/Konnakol

Not yet sourced, flagged in the text: Gnawa krakeb figure; tihai definition; Jon Hopkins and Four Tet; the jazz and rock cameos.
