# v6.3 · iPhone: sound that comes back, Swap that lights

Status: planned 2026-11-03 (build governor Opus, session 1227). Two streams, Opus builds and Opus reviews (no Fable review this wave). Agents run every smoke that can run headless; Nico's real iPhone is the check only for what emulation cannot reach (an iOS audio session, a real touch keyboard).

## 0. Decided with Nico, 2026-11-03

- Work #81 (sound drops out on iPhone mid-session) and the open half of #82 (Swap stays greyed out on a real iPhone after two throws are tapped). #10 dropped.
- On a phone the pattern box no longer opens the iOS keyboard: the digit pad is the keyboard. The pad lacks `/ < > |`, space and letters, so it gains a keyboard key (⌨) that hands that box to the iOS keyboard until it loses focus.

## 1. Rulings (build governor, 2026-11-03)

1. **The context is watched.** `drum-sound` listens to the AudioContext's `statechange`. When the context leaves `running` while the player is playing (iOS `interrupted`, or `suspended`), the player pauses, as a press of Pause would, so the screen never shows playing over a stopped clock. Play (or Enter, or a tap on a card) resumes through the existing gesture path. No automatic resume without a gesture.
2. **A stalled clock gets a new context.** After a resume from a gesture, if the context says `running` but `currentTime` has not moved after `AUDIO_STALL_CHECK_MS` (new tunable, about 300 ms), `drum-sound` closes that context and makes a fresh one: the bus rebuilt at the current volume and cutoff, every kit and pad reloaded for the last mapping through the existing per-context cache, the epoch moved on so loads for the old context cannot land. At most one rebuild per gesture, so a clock that never runs (headless on a stalled laptop, see the local-audio-clock-stall memory) cannot loop. The player keeps one clock: it re-reads `sound.now()` after the rebuild and schedules from there.
3. **Phone keyboard off.** On a coarse pointer (`matchMedia('(pointer: coarse)')`), each pattern input carries `inputmode="none"`. Fine pointers are untouched.
4. **⌨ key.** On a coarse pointer the pad shows a ⌨ key (label and aria label in `copy.ts`) that sets the active input's `inputmode` to `text` and focuses it, so iOS opens its keyboard; on that input's `blur` it goes back to `none`. Hidden on fine pointers. The pad stays four columns (five with `p`); the key takes a free cell, not a new row, if one exists at 390 px, otherwise the implementer reports the layout choice.
5. **Choosing a throw by touch.** A tap on a throw chooses it on `pointerup` (pointer type `touch` or `pen`) from the mirror's `[data-site]` spans, not on `click`, and not through the caret: the selection a tap leaves is ignored for choosing. Mouse keeps `click`. A tap must not both toggle via `pointerup` and via `click` (once per tap). Keyboard choice (Shift and an arrow) is unchanged.

## 2. Streams

**A · #81 Sound comes back** (Opus). Rulings 1 and 2. Owns `src/sound/drum-sound.ts`, `src/app/player.ts`, `src/tunables.ts` (`AUDIO_STALL_CHECK_MS` only), their unit tests, `src/main.ts` only for wiring. Fakes for `statechange`, `close`, a frozen `currentTime`. Coverage stays at 100% where `vitest.config.ts` holds it.
- Headless smoke: e2e (Chromium and WebKit) that plays, suspends the context from the page (through whatever handle the app already exposes for tests; if none, a test-only handle is not added and the unit tests carry rulings 1 and 2), and sees the transport show paused, then Play bring the clock moving again.
- End state for a person: on an iPhone, sound that stops (a call, the lock button, the keyboard) shows as paused, and Play brings it back without a reload.

**B · #82 Swap lights on a phone** (Opus). Rulings 3 to 5. Owns `src/app/mount-knobs.ts`, `src/app/knobs-model.ts`, `src/app/knobs.css`, `src/ui/copy.ts` (new key strings only), unit tests and e2e (`knobs`, and a phone spec).
- Headless smoke, WebKit iPhone 13 emulation, touch taps: the pattern inputs carry `inputmode="none"`; type `(4,2x)(2x,4)` on the pad; tap the two left-hand throws (sites 0 and 2); both show chosen and Swap is enabled; Swap changes the pattern; ⌨ sets `inputmode="text"` and focuses, blur puts `none` back. Desktop Edge: no ⌨ key, no `inputmode`, mouse choice as before. Screenshots at 390 px in the report.
- End state for a person: on an iPhone, tapping two throws lights them and Swap, with no iOS keyboard in the way; ⌨ brings the keyboard for `<3p 3|3p 3>` or `a / b`.

Every stream: its own worktree and PR, CI green, one Opus review of the whole branch, headless screenshots and smoke results in the report. Nico's iPhone check after both merge: the two end states above.
