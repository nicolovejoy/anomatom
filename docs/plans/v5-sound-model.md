# v5 · sound and kit: the data model, with mocks

Status: planned, 2026-11-02 (design governor Fable, session 1212; build governor Opus, session 1218). The first draft's model (one kit, pan and gain per juggler slot, a `#v3.` that lists slots) is replaced by §2 below. Mocks: https://claude.ai/artifact/YYYjTQp8CgfoMnxaxtrEk2 (round 3 is current; its per-juggler kit selects are superseded by ruling 3).

## 0. Decided with Nico, 2026-11-01 and 02

- A pattern carries no sound. The rule is global and an enum: height / ball / pitch. Named **Listen for** ("Listen for the height of each throw", "each ball", "the height, as a pitch"). Voice per part is cut.
- No pan, no gain, no per-height or per-part sample editor, no crossings filter. Pan is derived from the juggler's place on the stage.
- **Drummers:** each juggler on stage plays through a drum machine of their own. Nico, 02: keep it as simple as possible; no detailed options, just an easy way to hear a couple of different sounds. So no per-juggler kit picker (ruling 3). The deck bar's Kit select goes.
- Also play: catches, the downbeat tick, the pad chord. Three switches.
- Web: one panel at a time, Patterns / Sound / Stage, a segmented control in the top bar. Bottom bar variant **A** (Play alone, key caps), with the pattern name in the top bar beside the anomatom mark. ← → pattern, ↑ ↓ listen for, space play, shown as key caps. No ‹ › carets anywhere.
- Phone: hands only on the stage (as today). While the wheel turns it takes the whole sheet; 1.5 s after it settles the controls return.
- Deck: cut the 9 in §4, keep 18. Nico may put any back after hearing it.
- Vocabulary for every reader-facing string: pattern, juggler, hand, throw, catch, height, ball, sound, drum machine. About copy rewritten in `src/ui/copy.ts` (Nico edits).
- The pad is a switch only: Mellotron, Dm9, as today's default. No instrument or chord picker.
- Issues 79 and 82 ride with the phone stream; 81 (iPhone sound drops) waits for a device session.

## 1. What is built today

### 1a. The store

`AppState` (`src/app/state.ts`) holds, besides UI state:

```ts
parts: Parts        // the pattern: one Part per hand, each with spacing, phase, unit, flights
ratio: Ratio        // hand ratio, kept for the Rhythm chips
bpm: number         // tempo of hand 1
volume: number      // master, 0 to 1; never in the link
mapping: Mapping    // everything about sound, see below
```

### 1b. The Mapping: two things in one object

`Mapping` (`src/sound/mapping.ts:33`) is one object holding two different kinds of thing.

The **sound rule**, which says how a throw picks its sample:

```ts
byHeight: boolean                       // read the digit (height) or the part's own voice
perHeight: Record<1..9, Sample>         // the sample for each height
byBall: string[] | null                 // ball to pitch: entry `ball mod length` instead
catches: { on, sample }
crossAccent: { velocity, downbeat }
pass: { velocity, sample }
filter: { on, low, high }
pad: { on, instrument, chord }
```

And the **voices**, one per part, a part being a hand:

```ts
parts: PartVoice[]   // { kit, sample, pan, gain } for hand 0, hand 1, hand 2, ...
```

Four named presets exist for the rule (`PRESET_MAPPINGS` in `tunables.ts`): Voice per part, Height to drum, Height to pitch, Ball to pitch. The bar's Sound select picks one. `presetOf(mapping)` works out which preset the mapping equals, kits aside, or `custom`.

### 1c. Where the coupling is

- **Every card carries a whole Mapping** (`src/app/presets.ts`, field `mapping`). Juggling and sync cards bake in Height to drum. Passing cards bake in Height to drum plus a kit and a pan per hand from `PASSING_CARD.voices` (TR-808 left, LM-2 right).
- **Loading a card replaces the Mapping** (`loadPreset` in `src/app/actions.ts`). So picking Ball to pitch, then turning the wheel, puts you back on Height to drum. This is the reset Nico saw.
- **A kit belongs to a hand.** The panel shows one Kit select under three parts, else one select per juggler, where a juggler's kit is read from its first hand (`jugglerKits`, `src/app/sound-panel-model.ts:167`). The deck bar's Kit select writes every hand's kit, so a passing card's two kits collapse to one on the first pick.
- **The link carries the whole Mapping** as `m` (`src/sound/mapping-hash.ts`): a preset name, or `{ n: name, k: kits }`, or the full object in short keys. Short links name the rule with `~name`.
- **`DEFAULT_MAPPING` is Voice per part** but no card uses it, so a fresh page and a loaded card disagree about the default.

Nico's instinct was right: the pattern owns the sound, and sound and pattern should be independent.

## 2. Rulings (build governor, 2026-11-02)

1. **What is stored.** `AppState.mapping` goes. In its place, three fields, all global, none touched by loading a card:
   ```ts
   listen: Listen              // 'height' | 'ball' | 'pitch'; default 'ball'
   also: { catches: boolean, downbeat: boolean, pad: boolean }   // default { false, true, false }
   kitShift: number            // 0 to DRUMMER_KITS.length - 1; default 0
   ```
   `height` is today's Height to drum, `pitch` today's Height to pitch, `ball` today's Ball to pitch. `downbeat` is the clap on a cross caught on the downbeat (`crossAccent.downbeat`, on in every card today), `catches` is `catches.on`, `pad` is `pad.on`. `DEFAULT_VOLUME` becomes 0.5.
2. **The Mapping is derived.** `mappingOf(listen, also, kitShift, parts)` in `src/sound/` (pure, 100% lines) builds today's `Mapping`, so the scheduler, the drum machine and their tests do not change. Rule fields come from the rule's preset; `catches.on`, `crossAccent.downbeat` (`'clap'` or null) and `pad.on` from `also`; pad instrument and chord stay `mellotron` and `Dm9`; filter off; pass as today. One voice per part: hand `h` belongs to juggler `j = floor(h / 2)`, as `jugglerKits` pairs them today; its kit is `DRUMMER_KITS[(j + kitShift) mod length]`, gain 1, and its pan comes from the juggler's place on the stage (ruling 4). `derived(state)` exposes it; the player reads it from there. `Voice per part` is gone from every list; `PRESET_MAPPINGS` keeps the three rules for `mappingOf` and for decoding old links.
3. **Drum machines.** `DRUMMER_KITS` in `tunables.ts`, in this order: TR-808, LM-2, MFB-512, Roland CR-8000, Casio-RZ1 (808 and LM-2 first, as the passing cards sound today; the thin RZ1 last). The only control is one button, **Change drum machines**, which adds 1 to `kitShift` mod the length: every juggler moves to the next kit at once. A solo pattern steps through all five kits; a passing pattern keeps its jugglers apart. The Sound panel lists each juggler on stage with its kit's name, in the juggler's stage colour where the stage has one, read only.
4. **Pan from the stage.** For N jugglers, juggler j sits at centre `c = N == 1 ? 0 : -0.6 + 1.2 * j / (N - 1)`, its hands at `c ∓ d` (left hand first) with `d = N == 1 ? 0.6 : min(0.2, 0.6 / (N - 1))`. N = 1 gives -0.6, 0.6 (today's); N = 2 gives -0.8, -0.4, 0.4, 0.8 (today's passing card). The constants live in `tunables.ts`; juggler 1 must be the one drawn on the left (check the renderer and say so in the report). `PASSING_CARD.voices` and `SOUND_LANES.voices[].sample` go.
5. **Cards carry no sound.** `Preset.mapping` goes; `loadPreset` sets the pattern only. Changing the sound, then turning the wheel, keeps the sound.
6. **The link.** `#v3.<base64url JSON>` with `p` parts, `r` ratio, `t` bpm, and `l` (listen), `a` (also, as the three booleans or a short form of the implementer's choosing) and `k` (kitShift) each only when not the default. Short links: `~height`, `~ball`, `~pitch`, written only when `listen` is not the default; a short link is written only when `also` and `kitShift` are the defaults, else `#v3.`. Old links keep opening: `#v1.` and `#v2.` `m`, and the old `~height-drum`, `~height-pitch`, `~ball-pitch`, `~voice-per-part` names, decode by: rule from `presetOf` (voice per part → height, with a notice; custom → `ball` when `byBall` is set, `pitch` when `perHeight` equals Height to pitch's, else `height`); `also` from `catches.on`, `crossAccent.downbeat != null`, `pad.on`; `kitShift` the index of part 0's kit in `DRUMMER_KITS`, else 0. The v1 and v2 fixtures in `hash.test.ts` are the regression tests, with new expectations.
7. **The Sound panel** (the Details tab called Sound, phone sheet and wide panel alike) holds, top to bottom: Volume; **Listen for** (three choices: height, ball, pitch) with an ⓘ that shows one plain line per choice; **Drum machines** (ruling 3); **Also play**: three switches, Catches, Downbeat, Pad. Everything else in it goes: per-height editors, pan, gain, accent, pass and filter sliders, pad instrument and chord, the Kit select. The deck bar's Kit select goes; its Sound select becomes Listen for. That closes issue 83 (one thing called Sound). Strings in `copy.ts`, in the agreed vocabulary (pattern, juggler, hand, throw, catch, height, ball, sound, drum machine).
8. **Web layout.** One panel at a time beside the stage, chosen by a segmented control in the top bar: Patterns / Sound / Stage (Stage: no panel, the stage alone). The pattern's name sits in the top bar beside the anomatom mark. Bottom bar variant A: Play alone, with key caps for ← → (pattern), ↑ ↓ (listen for), space (play). No ‹ › carets anywhere. Mocks: boards `W2Patterns`, `W2Sound`, `W2Stage`, `W3BarA`, `W3Two`, `W3Five`.
9. **Phone.** Hands only on the stage, as today. While the wheel turns it takes the whole sheet; 1.5 s (`tunables.ts`) after it settles the controls return. Mocks: `P2Rest`, `P2Spin`, `P2Settle`.
10. **The deck** is cut to the 18 in §4. Cut cards still work as typed patterns and short links. E2e fixtures that name a cut card move to typed patterns.

## 3. Streams

Wave A runs alone, since it changes the state every view reads. Wave B runs in parallel on top of it.

**A · Sound model and panel** (Opus). Rulings 1 to 7 and 10. Owns `src/app/state.ts`, `actions.ts`, `derived.ts`, `presets.ts`, `hash.ts`, `route.ts`, `share.ts`, `player.ts` (reading the derived mapping only), `sound-panel-model.ts`, `mount-sound-panel.ts`, the Kit and Sound selects in `mount-deck.ts` / `deck-model.ts`, `src/sound/mapping.ts`, `mapping-hash.ts` (or its retirement), a new `src/sound/drummers.ts` if that is where `mappingOf` lands, `tunables.ts`, `copy.ts`, `SPEC.md` §4.3 and §6 to match, unit tests, e2e that break.
- Unit: `mappingOf` for 1, 2 and 5 jugglers (kits, pans), each `listen`, each switch; `kitShift` wraps; `loadPreset` leaves `listen`, `also`, `kitShift` alone; v3 round-trips with and without each optional key; every v1 and v2 fixture decodes per ruling 6; old `~names` decode; the deck has 18 cards.
- e2e (390×844 and 1280×800): pick Listen for pitch, turn the wheel twice, the panel still says pitch and the link carries `~pitch`; Change drum machines on a passing card changes both jugglers' kit names; a fresh page opens on ball at half volume.
- End state for a person: change the sound, turn the wheel, and the sound stays.

**B1 · Web layout** (Opus). Ruling 8. Owns the top bar, the bottom bar and the keys: `mount-deck.ts` layout, the shell markup and CSS, a key handler, `copy.ts` (key cap labels; add the keys line to `aboutHow`). Unit tests for any pure key or panel-choice model; e2e at 1280×800 for each panel and each key.

**B2 · Phone wheel** (Sonnet). Ruling 9, and issues 79 (docked wheel band one row off a typed pattern) and 82 (Swap below the fold under the digit pad). Owns the phone sheet and the wheel's docked state. e2e at 390×844.

B1 and B2 both touch `mount-deck.ts`; whoever merges second rebases. Every stream: CI green, one fresh-eyes review of the whole branch, headless screenshots in the report.

Checkpoint: after each wave, the governor smokes headless on anomatom.com, then hands Nico a short smoke.

## 4. The deck: 27 cards today, 18 kept (decided)

The deck has 27 cards (`PRESETS` in `src/app/presets.ts`): 8 three-ball, 6 four-ball, 4 five-ball, 9 passing. The wheel loops, so it reads longer than it is. Nico asked for a cap of 35 or fewer, with most cards interesting. The rule applied below: keep a card when it sounds different from its neighbours (a different rhythm, a different mix of heights, or a different form), keep one entry card per group, and cut a card whose sound another card already makes.

Keep (18):

```
3 balls   cascade 3          the entry card
          shower 51          the first uneven one: high, low
          half box 441       two holds and a pass
          high middle low 531
          boston shuffle 52512   period 5, off the grid
          box (4,2x)(2x,4)   the one sync card, both hands at once
4 balls   fountain 4         the entry card
          half shower 53
          tower 7531         a ramp down
          3 against 2        the one polyrhythm, a different ratio
5 balls   five cascade 5     the entry card
          744
          ramp 97531         a ramp over the whole range
passing   two-count          the entry card
          ultimates          every throw a pass
          three-count        odd count, the sides swap
          seven fours        7 clubs, call and response
          rising passes      3p 4p 5p, three heights across the gap
```

Cut (9), with the reason:

```
two-in-ones 423       sounds like 441 with the digits moved
flash 55500           two silent beats; the rests are the point and they read as a stall
sync fountain (4,4)   sounds like the fountain; box already shows sync
high low fountain 534 sits between 53 and 7531 and adds nothing to the ear
645                   744's neighbour; one five-ball three-digit card is enough
four-count            three-count already shows the odd-count idea; four is squarer
five-pass             the 5p is the only new sound and seven fours makes it better
seven-four-count      seven fours makes the same seven-club point with more passes
seven-pass            the 7p is one tall throw in a plain pattern
```

Each cut card still works as a typed pattern and as a short link, so nothing anyone has shared breaks. `copy.presets` loses nine entries, and the e2e fixtures that name them move to typed patterns.

If 18 is too few, the first three I would put back are flash (the rests are a real lesson), four-count (the beginner's passing pattern), and 645.

## Not in scope

Per-user favourites. More than five jugglers in the engine. Any change to how a throw is scheduled. A per-juggler kit picker, pan or gain.
