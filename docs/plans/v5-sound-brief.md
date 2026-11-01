# v5 · sound and kit: brief for the design session

Status: brief, 2026-11-01 (governor Opus, session 1208), from Nico's feedback after the v4.2 smoke. Next session: Fable governs. Discuss the data model and show mocks with Nico **before** any plan or code.

## What Nico asked for (his words, lightly trimmed)

> In general this is way better and I'm really liking it. Let's have the volume start right in the middle, not all the way maxed out. Let's make sure that the sound setting starts as ball to pitch. I love the different options though, and there needs to be an information button that allows you to understand what these settings mean. Also the setting that you choose needs to persist as you change through the different patterns, which currently it resets to the default when you change the pattern. Lastly, the kit interface doesn't really make sense anymore because it starts with two kits, but if you select anything, you wind up with one kit, so we need to rethink that interface with multiple jugglers, and we need to think of it with four or five jugglers, even though we don't have that support yet. We want an interface that will work.

## Settled with Nico (2026-11-01)

1. **Volume opens at the middle of the slider:** `DEFAULT_VOLUME` 0.5 in `src/tunables.ts` (now 1). Slider middle, not perceived loudness.
2. **Sound opens on Ball to pitch,** for every card. It's Nico's favourite sound, and Ball to pitch as it stands (one conga sample, pitched per ball) is the sound he means. Per-user favourites can come later; don't build them now. Nico is effectively the only user.
3. **An info button** next to the Sound select explains what each choice means (Voice per part, Height to drum, Height to pitch, Ball to pitch). The strings go in `src/ui/copy.ts`.
4. **The choice persists across pattern changes.** Sound, Kit and the other settings are **independent variables**, not something a pattern brings with it. Nico: "These really should not be dependent variables. They should be independent from my perspective, and we might have something built incorrectly." Discuss the data architecture with him first (below).
5. **Kit for 1, 2 and 5 jugglers.** Mocks for all three before any build. Nico isn't sure the current paradigm is right. It ties back to item 4.

## What's built today (the coupling Nico sensed)

- **One object holds both.** `Mapping` (`src/sound/mapping.ts:33`) holds the sound *rule* (`byHeight`, `perHeight`, `byBall`, catches, accents, pass, filter, pad) *and* each part's voice: `parts: PartVoice[]` with `kit`, `sample`, `pan` and `gain` (`mapping.ts:58`).
- **Every card brings its own copy.** Each card carries a whole `Mapping` (`src/app/presets.ts`: `juggling`, `syncCard` and `passingCard` all bake in `HEIGHT_DRUM`). Loading a card dispatches `loadPreset` with `mapping: preset.mapping` (`src/app/first-minute.ts:21`, `src/app/actions.ts:199-205`), so the rule, the kits, the pans and the gains are all replaced on every pattern change. That is the "resets to the default" bug.
- **A kit belongs to a part, and a part is a hand.** A juggler is two parts. `jugglerKits` reads a juggler's kit from its first part (`src/app/sound-panel-model.ts:167`), and `kitRows` gives 0 rows under 3 parts (`:165`).
- **Choosing a kit overwrites every part.** The deck's Kit select sets every part's kit (v4.1 ruling 3). When the parts differ it shows a disabled "TR-808 / LM-2". So a passing card opens with two kits, and any pick collapses them to one. That is Nico's kit complaint.
- **The share link carries the whole thing.** `m` in the link is the full mapping (`src/app/hash.ts:64`; short link `~name` from `presetOf`). Any split must keep old links decoding.
- **`DEFAULT_MAPPING` is Voice per part** (`tunables.ts:477`), but no card uses it.

## Questions for the design session

1. **The independent variables, and where each lives.** One possible cut, to discuss and not to build blind:
   - global settings: the sound rule, master volume, tempo;
   - per juggler (not per hand): a kit, pan and gain;
   - per pattern: parts, ratio and jugglers count.
   
   Does a card ever bring a sound? Today passing cards bring a kit and a pan per juggler.
2. **The lifetime of a juggler's kit.** When you go from a 2-juggler pattern to a 5-juggler one, what do jugglers 3 to 5 get? When you go back, does juggler 2 keep its kit? A rotation like `SOUND_LANES` already exists for parts.
3. **What the link carries,** and how old `#v2.` links and `~name` short links still decode.
4. **The Kit UI at 1, 2 and 5 jugglers.** Mocks for each, at a phone width (390) and a wide one (1280). The ideas so far: per-juggler chips that each open a kit list; one kit control plus "per juggler" disclosure; colour-coded rows matching each juggler on the stage. Nico chooses, as he chose A1 for v4 (https://claude.ai/artifact/7cgHMt739LJ3nhGbEwQccX).
5. **Is Voice per part still needed** as a Sound choice once kits are per juggler?

## Not in scope

Per-user favourites; more than the jugglers the presets have today (the UI must work for 5, but the engine need not grow).
