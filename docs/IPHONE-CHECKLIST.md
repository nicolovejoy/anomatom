# iPhone Safari checklist (SPEC §7, items 1-5 and 7)

For Nico's pass on a real iPhone. The laptop browsers are covered by `npm run e2e` (Chromium, WebKit, Firefox); what only a phone can tell you is sound, touch and the folded panel. Run it in Safari, not an in-app browser. Turn the ringer switch to ring (not silent) and the volume up before you start: iOS mutes Web Audio when the ringer is silent.

URL for every step: https://anomatom.com

Each step says what pass looks like and what fail looks like.

## 0. First tap unlocks the audio

1. Open https://anomatom.com in Safari (a fresh tab, so nothing is remembered).
2. Wait for the page to finish loading. Pass: you see the juggler, the ladder strip, the pattern box showing `3`, and the line "I have 3 balls." Fail: a blank page, or an error line. Nothing should make a sound yet. If it does, that is a fail.
3. Tap Play once. Pass: sound starts within about a second of the tap (the first tap may take a moment longer while the drum samples load; that is fine), the button reads Pause, and the balls move. Fail: the button changes but you hear nothing after 5 seconds with the volume up, or you have to tap twice.
4. Tap Pause, then Play again. Pass: it picks up at once with no gap longer than a beat. Fail: it stays silent, needs two taps, or restarts from a different place.

## 1. The classic patterns (SPEC §7.1)

1. Still on https://anomatom.com, tap Stop, then tap into the pattern box. The folded panel may hide it; if so, tap Knobs first (step 6 covers the panel). Fail: no pattern box can be reached, or typing in it does nothing.
2. Type `441`, tap Play. Pass: "I have 3 balls.", a steady drum pattern, and the juggler and the strip show the same three balls. Fail: a different ball count in the two pictures, or silence.
3. Repeat with `531`, `51`, `5551` ("I have 4 balls.") and `97531` ("I have 5 balls."). Pass: each plays; the count matches the number of colours you can see in the strip.

## 2. Fractions and collisions (SPEC §7.2)

1. Stop playback. In the pattern box type `12`. Pass: the line says it makes 1.5 balls, Play is greyed out, and a fix button (such as `22`) appears. Tap the fix. Pass: the box changes, the line says "I have N balls.", and Play works. Fail: the fix leaves the pattern invalid.
2. Repeat with `21`, `43` and `4441`. Pass: each says a fractional count and offers a fix that works. Fail: no fix, or a fix that stays invalid.
3. Type `432`. Pass: the line names the colliding throws ("throws 1, 2 and 3 all land in hand 1 on beat 5") and the colliding digits show in the warning colour. Tap a fix. Pass: it becomes valid.
4. Type `510`. Pass: a collision is named and a fix works. Fail: no fix is offered, or one stays invalid.

## 3. The 3:2 demo (SPEC §7.3)

1. Tap the `3:2` ratio chip. A second pattern box appears, and the tempo line reads "Hand 1 beats at 120 bpm, hand 2 at 80." Fail: no second box, or a different tempo line.
2. Type `2` in both boxes, tap Play. Pass: "I have 4 balls.", two fountains in different rhythms, three beats against two on the strip. Fail: another ball count, silence, or a strip that shows two even rows.
3. Stop. Type `2 2x 2` in hand 1 and `2x 2` in hand 2. Pass: "I have 4 balls.", it plays, and the strip marks the crossing throws with the accent where they land together. You should hear a stressed hit on those landings. Fail: it is rejected, or no accent shows or sounds.
4. Stop. Type `2x 2 2` in hand 1 and `2 2x` in hand 2. Pass: the line says a cross lands between the other hand's beats and names the nearest pulse; Play is greyed out. Fail: it plays.

## 4. Changing while playing (SPEC §7.4)

1. Go back to https://anomatom.com with the `1:1` chip, pattern `97531`, and tap Play.
2. While it plays, change the pattern to `441`. Pass: a "Next cycle" tag shows, the current pattern keeps going without a click or stutter, then the tag clears and the new pattern takes over on its own. Fail: the sound stops, restarts, clicks, or a ball vanishes mid-air.
3. While it plays, change the tempo (the bpm field). Pass: the same: "Next cycle", then the new speed with no restart. Fail: it stops, restarts, clicks, or never switches.

## 5. Share link round trip (SPEC §7.5)

1. Change three things: the pattern to `441`, the bpm to `96`, and one sound field in the Sound drawer (for example the height 4 sound to cowbell).
2. In the Sound drawer tap "Copy share link". Pass: the robot says it copied the link. If it says it could not, copy the address from Safari's bar instead (this is the documented fallback, not a fail).
3. Open a new Safari tab and paste the link. Pass: the pattern box shows `441`, bpm 96, the Sound drawer shows the cowbell and a `Custom` preset, and nothing is playing until you tap Play. Fail: any value differs, or sound starts by itself.

## 6. The folded knob panel

1. Open https://anomatom.com in portrait. Pass: the panel is folded under a Knobs button; the juggler and the strip fill the width and stay visible. Fail: the panel covers the picture or the page scrolls sideways.
2. Tap Knobs. Pass: the panel opens (pattern box, ratio chips, digit pad, bpm). Tap Hide knobs. Pass: it folds again. Fail: the panel does not open, or stays open.
3. Turn the phone to landscape. Pass: everything still fits, with no sideways scroll. Fail: anything is cut off or the page scrolls sideways.

## 7. The About page (SPEC §7.7)

1. Tap the About link in the knob panel (open Knobs first on a phone), or open https://anomatom.com/#about.
2. Pass: the reading list (numbered 1 to 15) and the credits render. Tap three links of your choice (a paper, the sani.js repo, the repo link). Pass: each opens its page in a new tab. Fail: a dead link, a blank tab, or a link that navigates away from the app inside the same tab.
3. Tap "Back to the pattern". Pass: you return to the pattern as you left it, and any playing sound carried on while you read. Fail: the pattern is reset, or the sound stopped.
