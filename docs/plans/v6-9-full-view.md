# v6.9 · the jugglers take the screen

Status: plan, decided with Nico 2026-11-07 (the notes PR #152, then mocks in the brainstorm session
of the same day). Nothing built.

## 0. The problem

anomatom's point is the picture of jugglers passing in time with the sound. On the wide layout the
picture gets about half the screen: the pattern list holds the right third, the strip and the key
bar the bottom quarter. The 3D view can be turned, but nothing says so, so on the Mac a reader never
finds out. On iPad the wide layout shows a keyboard's hints (space, ↑↓, ←→) to someone with no
keyboard, and the one control that matters while watching, Listen for, is two taps away in the
Sound tab.

Three things, one cause: the layout was built for a laptop with a keyboard and a reader editing a
pattern, and it now also serves a reader who wants to watch and listen, often on a touch screen.

Success: on an iPad in landscape, a reader who touches the jugglers sees them fill about four fifths
of the screen and can still play, step patterns, change Listen for and get the rest back; on the
Mac a reader finds the turn within seconds. Failure even if it works: a reader stranded in full view
with no obvious way back; an editor who loses the list every time they click the stage.

## 1. Decided with Nico, 2026-11-07

1. **Full view.** A ⤢ button beside ↺ and 2D on the stage enters it; in full view the same
   button reads ⤡ and leaves. Esc leaves on a keyboard. Picked over hide-while-playing, a collapsed
   rail and a floating list (notes, PR #152), and over floating controls that fade (mock option C).
2. **Turning the jugglers enters it.** Whatever turns or zooms the 3D view enters full view: a
   drag (mouse or finger), a pinch (touch), the scroll wheel (mouse), on every device; the gesture
   still turns or zooms. A click or tap on the stage does not enter: it keeps doing what it does
   today (blurring a field, compacting a grown phone card), so an editor never loses the list by
   clicking (Nico, after the builder check, 2026-11-07). Tapping Play, ‹ ›, or Listen for inside
   full view keeps you there.
3. **What full view holds: controls in one bottom row, a thin strip above them** (the mix of mock
   options A and B). The top bar (wordmark, panel tabs, share, ?), the list and its filters, the
   phone's wheel card, Play square and volume all go. The strip stays at a third of its height,
   with its playhead, grid and flight lines only. ↺ 2D ⤡ stay in the stage's top-right corner.
4. **The row.** Play · ‹ pattern name › · Listen for. On a keyboard device, Listen for is a readout
   beside its ←→ caps, and the caps `space play · ↑↓ pattern · esc back` sit at the right. On a
   touch device, Listen for is three tap buttons. When the row does not fit the width it becomes two
   rows: Play · ‹ name › over the Listen for buttons (the phone upright; the iPad in portrait is
   checked at build time). Where width is short the name drops its "· n balls".
5. **Touch Listen for, in the normal view too.** Where the main pointer is a finger
   (`pointer: coarse`), the wide layout's key bar is replaced by Listen for as three tap buttons
   beside Play: Height · Each ball · Pitch, the chosen one lit, in step with the Sound tab's select.
   The laptop keeps the key bar. The phone keeps its bottom-bar select as today.
6. **Say the view turns.** A grab cursor over the 3D view (grabbing while dragging) and a hint under
   ↺ 2D ⤢: "Drag to turn, scroll to zoom", or on touch "Drag to turn, pinch to zoom", gone after the
   first turn.
7. **The Stage panel goes.** The top bar keeps Patterns · Sound; ⤢ is the one way to give the
   jugglers the screen. Leaving full view restores the panel the reader had.
8. **True fullscreen on ⤢** where the browser has it (iPad Safari, desktop browsers): the layout
   change and `requestFullscreen` together; leaving either leaves both. iPhone Safari has no
   fullscreen API and gets the layout alone.
9. **Thin strip everywhere.** 82% for the jugglers on iPad landscape with it was accepted over 91%
   without. Measured on the mocks: laptop 1440×900 84%, iPad 1180×820 82%, iPhone 390×844 78%
   (from 47%).
10. **Not in the hash.** Full view is UI state like mute: a shared link never opens in it.

## 2. Rulings (coordinator, 2026-11-07, each reversible)

1. **State.** `AppState.full: boolean`, never in the share hash. `Panel` loses `'stage'`;
   `columnShown` goes (the column always shows outside full view). Nothing stores the panel (the
   hash carries pattern, tempo and sound only), so there is no old value to read.
2. **One headless module**, `src/app/full-view-model.ts`, held at 100% lines: what enters (⤢; on
   the 3D canvas a pointer move past `FULL.dragThresholdPx` after a pointerdown, a second touch, or
   a wheel tick; never a pointerdown alone), what leaves (⤡, Esc, the fullscreen API's own exit), what the row holds
   for a given pointer kind and width (one row or two; the name with or without "· n balls"), and
   the hint's life (shown until the first turn, per session). `mount-layout.ts` toggles `.is-full`
   on the app and the CSS lays out by it; `mount-juggler.ts` owns ⤢/⤡ and the hint beside ↺ and
   2D; `mount-deck.ts` owns the row, since Play, ‹ › and the pattern button are its.
3. **The row is the deck bar, re-laid.** No second set of Play or ‹ › elements: the existing
   `.deck-bar` children are shown or hidden and ordered by CSS under `.is-full`, so one Play button
   has one state. In full view the pattern name is a label, not the button it is elsewhere (reversed by ruling 13; the
   button opens the list, which full view hides): the `.deck-pattern` button is hidden and a
   `.deck-full-name` span shows the same notation and name; ‹ ›, ↑↓ and the mouse wheel over the row
   step the pattern as today. On the wide layout the name lives in the top bar (`.topbar-pattern`),
   which full view hides, so the span is the deck bar's own. The Listen for buttons are new, in `mount-deck.ts`, `aria-pressed`, bound to
   `AppState.listen` as the Sound tab's select is. Short labels in `copy.ts`: `listenShort:
   { height: 'Height', ball: 'Each ball', pitch: 'Pitch' }`; the Sound tab keeps `listenNames`.
4. **Pointer kind.** `(pointer: coarse)`, as `mount-knobs.ts` already reads it (v6.3 rulings 3 and 4),
   one `matchMedia` in `mount-layout.ts` setting `.is-coarse` on the app; the key bar and the
   Listen for buttons swap on that class. A laptop with a touch screen reads as fine.
5. **Taps and the deck's "tap outside".** A pointerdown on the 3D canvas already compacts a grown
   phone card (v6.8 build ruling on orbit); it still does, and only that. A drag that goes on to
   enter full view hides the card anyway. Nothing on the 2D canvas enters: 2D has no turn to learn.
6. **Esc.** Handled in the deck's key capture (`mount-deck.ts`), the same place Escape closes the
   wheel today: a wheel or sheet that is open takes Esc first; otherwise Esc leaves full view.
7. **Fullscreen.** `document.documentElement.requestFullscreen()` on ⤢ where defined (Safari on
   iPad needs the `webkit` prefix; both tried), inside the click handler so the gesture counts;
   `fullscreenchange` with no fullscreen element sets `full: false`. A stage drag that enters full
   view does not request fullscreen (no user-activation on a move) and says nothing. Fullscreen
   is never asked for in the e2e; the headless runs test the layout only.
8. **Sizes.** New `FULL` tunables: `stripFractionWide` 1/3 (220 → 72 px), `stripPhonePx` 56,
   `rowPx` 68 (laptop) and 72 (coarse), `twoRowsBelowPx` the width under which the row splits
   (first guess 800; measured at build), `dragThresholdPx` 6 (a move shorter than this is a tap).
   No hint timer: the hint goes on the first turn only.
9. **The strip in full view** is the ladder canvas at a smaller height: `ladder-canvas.ts` already
   takes its height from the element; lanes thin as on the phone (`laneGeometry`, v6.6 ruling 17);
   captions and the beat row are hidden under `.is-full`.
10. **Leaving restores.** `full: false` puts the grid back; `panel` was never changed, so the column
    comes back as it was. On the phone the wheel card returns compact (it was hidden, not reset).
11. **About page.** One paragraph under the controls section: ⤢, Esc, drag to turn. `copy.ts`.
12. **SPEC §4.1** gains a dated v6.9 paragraph: full view, what it hides, what enters and leaves.
13. **Reversed by v6.10 (`docs/plans/v6-10-pick-in-full-view.md`): the name no longer leaves full view; it opens the wheel there.**
    **The name is a button again (Nico, 2026-11-08, after the device smoke; reverses the "label, not
    the button" part of ruling 3).** Smoked on the device, a reader in full view who taps the pattern
    name expects to choose a pattern. `.deck-full-name` is now a `<button>` (aria-label "Leave full
    view and choose a pattern", reachable by keyboard); `.deck-pattern` stays hidden. A click sets
    `full: false` (the store subscription in `mount-juggler.ts` leaves browser fullscreen with it) and
    then does what `.deck-pattern` does where it shows (`nameTap` in `full-view-model.ts`): on the
    wide layout, shows the Patterns panel and focuses the wheel row, through the same function the
    top bar's pattern button uses; upright on a phone, where that button is hidden and the card is
    always there, the card grows; on a phone on its side, the wheel opens. ‹ ›, ↑↓ and the wheel
    over the row step as before. About and SPEC §4.1 say so.

## 3. Streams

1. **S1 · Say the view turns.** Ruling 2's hint life, cursor CSS, the two hint strings in `copy.ts`.
   e2e: the hint shows under ↺ 2D in 3D, the cursor is `grab`, a drag ends the hint, a reload shows
   it again. Check for Nico: none (a device-only check does not exist here; the agents' screenshots
   suffice). Reversal cost: remove one element and two lines of CSS.
2. **S2 · Touch Listen for.** Rulings 3 and 4 in the normal view: `.is-coarse`, the three buttons
   in the deck bar replacing the key bar, in step with the Sound tab. e2e under `hasTouch` with a
   coarse-pointer emulation at 1180×820: the key bar hidden, three buttons shown, tapping one changes
   the Sound tab's select and the sound mapping (`data-` hook as `v5-sound.spec.ts` reads), and at
   1440×900 fine pointer the key bar is unchanged. Check for Nico: iPad landscape at
   https://anomatom.com, the row beside Play reads Height · Each ball · Pitch, the Sound tab
   agrees. Reversal cost: one class.
3. **S3 · Full view.** Rulings 1, 2, 3, 5 to 12 minus fullscreen: state, model, ⤢/⤡, Esc, the
   drag entry, the CSS for three layouts (wide fine, wide coarse, phone), the Stage panel's removal,
   SPEC and About. e2e at 1440×900 (Edge), 1180×820 and 390×844 (WebKit, touch): ⤢ enters and the
   list, top bar and key bar are hidden; the stage's box is at least 80% (wide) or 75% (phone) of
   the viewport; the strip is shown at its thin height; ⤡ and Esc leave with the same panel as
   before; a drag on the 3D canvas enters and turns, a wheel tick enters and zooms, a click or tap
   on it does not enter; a tap on Play inside stays; a reload opens normal; the Stage panel is no
   longer in the top bar.
   Check for Nico: iPad landscape, drag the Square card's jugglers: the list and bars go, the row
   reads Play · ‹ Square · 4 jugglers › · Height · Each ball · Pitch, the strip is thin, ⤡ brings the
   list back where it was. iPhone upright: two rows. Reversal cost: `.is-full` never set; the
   Stage panel's removal stands (ruling 7) or is one line to restore.
4. **S4 · Fullscreen.** Ruling 7. No e2e beyond "no request is made without a click" (a stub on
   `requestFullscreen` counting calls). Check for Nico: iPad, ⤢ hides Safari's bar; ⤡ or Safari's
   own exit brings everything back together. Reversal cost: one call.

S1 and S2 are independent of each other and of S3; S3 lands after S2 (it reuses the buttons); S4
after S3. Three worktrees for S1, S2, S3 can start together, S3 rebasing on S2's merge.

## 4. Mocks

Kept outside the repo in the brainstorm session (`.superpowers/brainstorm/49094-1794098431/content/
full-view-mix.html`, gitignored); the layout they fixed is in sections 1 and 2. In words, iPad
landscape full view, top to bottom: the stage with ↺ 2D ⤡ top-right; a 72 px strip; a 72 px row
of Play (icon) · ‹ 3 Cascade · 3 balls › · Height · Each ball · Pitch at the right. Laptop: the
same with "▶ Play" in words, ←→ Listen for *each ball* as readout, and `space play · ↑↓ pattern ·
esc back` at the right. Phone upright: a 56 px strip; a 64 px row Play · ‹ 3 Cascade ›; a 64 px
row of the three buttons stretched across.

## 5. Not this wave

- Controls that fade (mock option C).
- A camera or full view in the link.
- A keyboard on iPad (a hardware keyboard with a coarse pointer reads as touch; its arrows still
  work, its caps are not shown).
- The phone's landscape deck beyond following the wide coarse layout.
