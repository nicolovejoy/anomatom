# v6.2 · the wheel has ends

Status: merged 2026-11-03 (build governor Opus, session 1219; PRs 99 plan, 100 W6 (Opus, one fix round); one Fable fresh-eyes review). W6 rulings kept: the deck's steps (↑ ↓ docked, ‹ › narrow) walk the cards only and stop at the last card, never onto Make your own; the focused wheel's own keys walk every row; ‹ › at an end carry aria-disabled; a hand-made pattern puts the band on Make your own; docked rows are whole (`menuRows`), no odd rule. Review fix: a key at an end never loads the card on stage again (it queued the same pattern for the next cycle while playing); a dead key on a phone takes no sheet; the tab stop follows focus. Phone drum rests 1 px off the drawn band (pre-existing).

## 0. Decided with Nico, 2026-11-03 (smoke of v6.1)

- Under a filter (Jugglers 3: three cards and Make your own) the web column shows the same four rows six times over. Nico: why loop? Hit the end of the list.
- Looping makes little sense on the phone either with three options: no loop anywhere.
- Web: a list that shows each card once, the band moving to the chosen card, as a menu does.
- Phone: a finite drum, the band fixed in the middle (the iOS picker), blank space past both ends.
- Make your own stays at the bottom.

## 1. Rulings (build governor, 2026-11-03)

1. **No loop.** The list holds each card once, then Make your own, in every layout. `wheelCopies`, the copy rows (`.deck-copy`, `data-echo`), the ring of CSS `order` places, `recentre`, `offset` and the slot maths that only the loop needs (`slotNear`, `offsetFor`, `placeOf`, `nearEnd`, `loopDelta`, `DECK.loopMarginRows`, whatever else goes unused) are deleted, with their tests. A slot is its row.
2. **No wrap.** ↑ ↓ (and ‹ › on narrow layouts, and the focused wheel's own ↑ ↓ PageUp PageDown) stop at the ends: ↑ on the first card does nothing, ↓ on Make your own does nothing. ‹ is disabled on the first card and › on the last row, with `aria-disabled` or `disabled` as the buttons do today. From a hand-made pattern (no card) ↓ goes to the first card and ↑ to the last, as `stepIndex` does now. Within a filter the ends are the filter's.
3. **Web (docked): a menu.** The rows sit once, top-aligned under the chips, `DECK.dockedRowPx` tall. The gold band is the chosen row's own highlight and moves with the choice; nothing turns under a fixed band. A list taller than the column scrolls natively (no scaled scroll, no glide, no snap) and scrolling only browses: it never picks, never moves the band. A click, Enter or Space on a row, or ↑ ↓, picks; the picked row is brought into view with `block: 'nearest'`. The custom wheel input of v6.1 ruling 1 (`wheelInput`, `Glide`, `glideAt`, `notchGlide`, `shiftGlide`, `settleGlide`, `burstAdd`, `settleTarget`, `BURST_AT_REST`, `DECK.wheelScale`, `glideMs`, `notchPx`) goes with its tests, unless the phone still needs a part. The editor rule (v6.1 ruling 2: a click on Make your own opens it) holds. The wheel's height still stops above `Math.max(sheet.offsetHeight, .deck-bar offsetHeight)` (the WebKit ResizeObserver invariant); the list may now be shorter than the column, and is then as tall as its rows.
4. **Phone: a finite drum.** The band stays fixed in the middle; scrolling turns the list under it and the settle picks, as today. The list gets padding of `half` rows above the first row and below the last, so both ends reach the band and stop there, with blank rows past them (at most two in a five-row wheel). Snap points as today. The sheet-taking turn (v5 B2) is unchanged.
5. **Order.** Cards in deck order, Make your own last, in every layout and filter.

## 2. Stream

**W6 · The wheel has ends** (Opus). Rulings 1 to 5. Owns `mount-deck.ts`, `deck-model.ts`, `tunables.ts` (`DECK`), `deck.css`, `layout-model.ts` (only if a key handler moves), unit tests and e2e (`web-wheel`, `wheel-feel`, `filters`, `phone-wheel`, `deck` and any spec that counts copies or wraps). `deck-model.ts` stays at 100% lines.
- e2e at 1280×800: Jugglers 3 shows exactly four rows (three cards, Make your own), no row twice, no scroll; the band is on the chosen card and moves on ↓; ↓ on Make your own changes nothing; ↑ on the first card changes nothing; a wheel scroll over the full deck moves the list but not the stage's card; a click picks. At 390×844: Jugglers 3 turns to each of the four rows and no further, the first and last reach the band; the full deck has no copies.
- End state for a person: tap Jugglers 3 on a laptop and see the three patterns and Make your own once each, with the highlight on the one playing; on a phone the drum stops at both ends.

Every stream: CI green, one fresh-eyes Fable review, headless screenshots in the report.
