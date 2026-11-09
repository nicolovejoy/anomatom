# v6.10 · pick a pattern without leaving full view

Status: plan, decided with Nico 2026-11-09 from four rounds of mocks (brainstorm session, gitignored;
the final mock is described in section 3). One stream.

## 0. The problem

v6.9 S5 made the pattern name in full view leave full view and open the wheel. On device Nico found
it made little sense: he taps a name at the bottom and the wheel opens at the top, while the jugglers
shrink back into the normal layout. What he wants is a different pattern, not the old layout.

Success: in full view, a tap on the pattern opens the wheel next to where the thumb is. The jugglers
stay big and change as the wheel turns, and a tap on a row picks it and closes the wheel, still in
full view. Failure even if it works: the wheel covering the jugglers on a screen that has room beside
or above them, or two copies of the pattern's name on screen at once.

## 1. Decided with Nico, 2026-11-09

1. **The pattern stays in full view.** A tap on the pattern box opens the existing wheel (the one
   `.deck-picker`, with its filter chips) inside full view. It reverses v6.9 ruling 13 (S5's "leave
   and open the wheel").
2. **The bar, wheel closed.** The pattern sits on the left as a box: square corners, the bar's full
   height, its notation and name and a ▴, a rule on its right. The controls are on the right: Play,
   then Listen for (the three buttons with a finger, the ←→ readout with a keyboard, as v6.9). **‹ ›
   are gone from full view** (↑↓ and the mouse wheel over the row still step). On the iPhone upright,
   the pattern box is a full-width row of its own on top, and Play and Listen for are the row under
   it.
3. **The bar, wheel open.** The pattern box leaves the bar (the wheel's band shows the pattern):
   only Play and Listen for stay.
4. **Where the wheel goes.**
   - **Landscape (iPad, iPhone, laptop):** the wheel takes the left part of the stage area, full
     height; the jugglers take the largest square at the right. The strip and the bar stay full
     width under both.
   - **iPad portrait (wide, taller than wide):** the jugglers move up into a square at the top,
     centred, as wide as leaves the wheel room for the filters and about five rows; the wheel takes
     the full width under it.
   - **iPhone upright:** the wheel pops up from the bar, over the lower stage, nearly full width,
     about five rows, with the filters on top (option A of the first mock).
5. **Filters wrap.** BALLS and JUGGLERS on one line where they fit, one group per line where not.
6. **Closing.** A tap on a row picks it, plays it and closes the wheel (as the phone on its side does
   today). A tap on the jugglers or anywhere outside the wheel, or Esc, closes it. Esc with the wheel
   closed leaves full view, as v6.9. ⤡ leaves full view and closes the wheel. Turning the wheel
   changes the pattern as it settles, as today.
7. **The pattern box takes all the width the controls leave (Nico, 2026-11-09)**, because many names
   are long. It drops "· n balls" only when the name still does not fit, whatever the width; an ellipsis
   is the last resort. (This replaces v6.9's rule that the row drops "· n balls" below a width.)

## 2. Rulings (coordinator, 2026-11-09, each reversible)

1. **One wheel, in its overlay mode.** In full view the picker always uses the overlay placement a
   phone on its side uses today (`placeWheel`'s non-flow branch), whatever the layout: docked and
   upright both read as "not in full view" in the checks that choose flow placement, the menu row
   style and the upright card phases. No second picker. A local `fullPick` flag (UI state like
   `wheelOpen`, never in the hash, never in `AppState`) says the wheel is open in full view;
   `wheelShown()` returns it while `full` holds. Leaving full view clears it.
2. **Layout by class.** `mount-deck.ts` sets `.full-pick` on the app while the wheel is open in full
   view. `full-view.css` lays out the three cases by it plus the existing orientation and width
   classes: the stage's grid area becomes the right square (landscape) or the top square (wide
   portrait); on the iPhone upright the stage is unchanged and the picker is absolutely placed above
   the bar. The 3D and 2D canvases already follow their element's size.
3. **The pattern box is `.deck-full-name`**, re-styled (square, full height, ▴). Its click toggles
   `fullPick` and no longer sets `full: false`. `nameTap` in `full-view-model.ts` goes or becomes the
   pure "where does the wheel go" decision (landscape-left, portrait-top, pop-up) from width, height
   and pointer kind, held at 100% lines.
4. **Esc.** The capture handler passes `fullPick` as `leaveKey`'s `wheelOpen`, so an open wheel takes
   Esc first; the wheel's own Esc handler closes it.
5. **Make your own** in full view leaves full view and opens the editor as it does outside (the editor
   lives there). Coordinator's call: Nico did not rule on it.
6. **Unchanged:** the Listen for labels (renaming is a separate question Nico has open), ‹ › outside
   full view, the strip.
7. **Docs.** SPEC §4.1 gains a dated v6.10 paragraph replacing v6.9's "the name is a button: tapping
   it leaves full view". The v6.9 plan's ruling 13 is marked "reversed by v6.10". The About line in
   `copy.ts` follows.
8. **The open wheel is the docked menu (coordinator, 2026-11-09, after the first screenshots; each
   reversible).** The drum's blank half-rows left the top of the wheel empty (three visible
   patterns on the iPhone upright, a large empty block on the iPad). In full view the picker is laid
   out as the docked menu is (v6 ruling 1, v6.2 ruling 3), through that same path, not a third one:
   `docked()` holds while the wheel is open in full view (`wide()` is the wide layout's own docking,
   off in full view), so the rows are `DECK.dockedRowPx` tall, top aligned, the band on the chosen
   row itself, no blank rows. As many rows as the room holds and the list has (the pop-up up to
   `FULL.pickPopRows`). Opened, the list is scrolled so the chosen row is `FULL.pickLeadRows` (2) from
   the top where it is deep in the list. A tap on a row picks, as before; arrow keys on a row pick at
   once (the menu's rule). **Scroll-to-turn is dropped:** a scroll of the wheel only browses and
   picks nothing, as the docked menu's does. This amends 1.6's "turning the wheel changes the
   pattern as it settles" and section 2 ruling 1's "overlay mode".

## 3. The final mock, in words

Full view, wheel closed. iPad landscape: stage; 22 px strip; bar with [3 Cascade · 3 balls ▴] as a
square full-height box at the left, then a rule, then at the right Play, Height, Each ball, Pitch.
iPad portrait: the same, with "· 3 balls" dropped. iPhone landscape: as the iPad landscape. iPhone
upright: a full-width [3 Cascade ▴] row, then a row of Play and the three buttons.

Wheel open. iPad landscape: the wheel (filters, then nine rows) fills the left ~38%, the jugglers in
the square on the right; the bar holds Play and the buttons at the right only. iPad portrait: the
jugglers in a square at the top, the wheel (filters on one line, five rows) across the full width
under it. iPhone landscape: the wheel on the left, three rows, the square on the right. iPhone
upright: the wheel pops up over the lower stage, filters wrapped to two lines, five rows; the bar is
one row of Play and the buttons.

## 4. Stream

**S1 · Pick in full view.** All of the above. e2e, headless (Edge at 1440×900, WebKit touch at
1180×820, 820×1180, 844×390 and 390×844):
- A tap on the pattern box opens the wheel and full view stays.
- The pattern box and ‹ › are hidden while the wheel is open, and ‹ › are hidden in full view
  always.
- Where the stage's box sits: right square in landscape, top square in wide portrait, unchanged on
  the phone upright.
- A row tap picks, plays, closes the wheel and stays in full view.
- A tap on the stage closes it.
- Esc closes the wheel, then a second Esc leaves.
- ⤡ with the wheel open leaves, and a reload opens normal.

Screenshots of all five sizes, closed and open.

Check for Nico: on the iPad in landscape at https://anomatom.com, ⤢, tap the pattern box. The wheel
is on the left and the jugglers are in a square on the right; the chosen pattern is in view, a row or two from the top; tap a
row, the wheel closes and full view stays. On the iPhone upright, the same, with the wheel popping
up from the bar.

## 5. S2 · Listen for as symbols (not built in S1)

Decided with Nico, 2026-11-09. Lands after S1 merges.

- Each choice gets an icon: a drum (Height), a ball (Each ball), and for Pitch a stepped ladder
  (tuned drums, not notes).
- Where there is room, the icon and a word side by side: "Drums · Balls · Pitch". Where there is not,
  the icon over a small word. Never icons alone.
- A hover (a long press on touch) shows one plain line, from `copy.ts`:
  - Drums: "A drum for each height: 1 and 2 tick the hi-hat, 3 the snare, 4 a tom, 5 and up the kick."
  - Balls: "Each ball has its own drum, whatever its height, so you hear each ball travel."
  - Pitch: "The higher the throw, the deeper the drum, nine steps from rimshot down to kick."
- This replaces `listenShort`. The Sound tab's select keeps `listenNames` unless S2 decides otherwise.
