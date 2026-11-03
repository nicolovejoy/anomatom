# v6 · the web wheel, filters, three-juggler cards

Status: planned 2026-11-02 (build governor Opus, session 1219).

## 0. Decided with Nico, 2026-11-02

- On web the pattern wheel gets more room and turns slower. Phone is untouched.
- The pattern editor (Pattern / Rhythm tabs and the digit pad) hides on web until the reader picks **Make your own**, or the pattern on stage is not a card (typed, or opened from a link).
- Filters on the patterns. Nico asked the governor to choose the shape (ruling 4).
- Three-juggler cards first; four and five jugglers in the engine is a later, separate step.

## 1. What is built today

- The docked wheel (web, `#app.deck-docked`) is `DECK.wheelRows` (7) rows of `DECK.rowPx` (32 px), 224 px, at the top of the Patterns column; the editor sits under it at all times. At 1920×1080 the wheel uses about a fifth of the column.
- The wheel is a native scroll-snap list (`src/app/deck.css`, `.deck-wheel-list`, `scroll-snap-type: y mandatory`), so a mouse notch (about 100 px) moves three rows and a trackpad fling runs as far as the fling goes. It loops (`loopMarginRows`) and picks its row `DECK.settleMs` after the last scroll event.
- Cards have a `group`: `'3' | '4' | '5' | 'passing'` (`src/app/presets.ts`). 18 cards: 6 / 4 / 3 / 5.
- The engine reads up to `MAX_JUGGLERS = 3` (`src/tunables.ts`); a three-juggler pattern can be typed (`<3p2 3|3p3 3|3p1 3>`, MATH.md §10) but no card has three. Four or five give `too-many-jugglers`.

## 2. Rulings (build governor, 2026-11-02)

1. **Web wheel room.** On web (docked) the wheel's rows grow to `DECK.dockedRowPx` (44) and the wheel shows as many rows as the column's height allows (odd, at least `DECK.wheelRows`), while the editor is hidden. When the editor shows, the wheel drops to `DECK.dockedEditRows` (5) rows above it. Phone and phone-landscape keep today's 32 px and 7 rows. Pure sizing (rows from a height) lives in `deck-model.ts` with unit tests.
2. **Editor visibility (web only).** The editor shows when the band is on **Make your own**, or the stage's pattern matches no card. Picking a card hides it. A typed edit that turns a card into a non-card keeps it shown (the reader is editing). Phone sheet unchanged.
3. **Slower spin (web only).** The docked wheel takes `wheel` events itself (`preventDefault`) and turns one row per `DECK.wheelStepPx` of accumulated delta (`deltaMode` lines and pages converted to px), at most one row per `DECK.wheelStepMs`, with a smooth scroll to the row. A mouse notch is one row; a trackpad swipe of a few rows moves a few rows, not a page. Dragging the scrollbar and keys are unchanged. The accumulator and rate limit are pure (`deck-model.ts`), unit tested with fake times.
4. **Filters.** One row of chips above the wheel, single select: **3 balls · 4 balls · 5 balls · Passing**, keyed by `CardGroup`. Tapping the lit chip clears it (all cards). No Sync chip: sync is one card (box), not a shelf. Under a filter the wheel loops over that group's cards plus Make your own; ← → step within the group. Choosing a chip whose group does not hold the current card loads the group's first card; otherwise the pattern stays. The filter is UI state in `AppState` (`deckFilter: CardGroup | null`, default null), never in the link, and kept across panel changes. Web and phone both (phone: the chips sit above the wheel when it is open). Strings in `copy.ts`. Pure filtered-order and next/prev in `deck-model.ts`.
5. **Three-juggler cards.** Add two or three three-juggler passing cards, group `passing`. Candidates: the ring `<3p2 3|3p3 3|3p1 3>` (MATH.md §10, 9 balls) and a feed (one juggler passing to two). Every card's notation and ball count must be confirmed against a source opened in the session, and the source added to `docs/BIBLIOGRAPHY.md` with what was read (memory rule: open the source before any citation lands; passist is GPL and is not used). The stage draws three jugglers left to right, each its own colour, kits and pans by `mappingOf` (v5 ruling 4, N = 3: centres -0.6, 0, 0.6). Check and say in the report that the stage and the sound panel show three jugglers correctly; fix what does not. Names and listen-for lines in `copy.presets`. Deck becomes 20 or 21 cards; update the deck-count test.

## 3. Streams

Wave 1 runs W1 and W3 in parallel. W2 runs after W1 merges, since both change the wheel's DOM in `mount-deck.ts`.

**W1 · Web wheel room and speed** (Opus). Rulings 1 to 3. Owns `mount-deck.ts` (docked wheel and editor visibility), `deck-model.ts`, `deck.css`, the shell CSS for the Patterns column, `tunables.ts` (`DECK`), unit tests, e2e at 1280×800 and 1920×1080 (wheel shows at least 11 rows at 1080 with the editor hidden; Make your own shows the editor and 5 rows; one wheel event of deltaY 100 moves exactly one row; a typed non-card keeps the editor). Phone e2e at 390×844 must still pass untouched.
- End state for a person: on a laptop, the patterns fill the right column and one click of the mouse wheel moves one pattern.

**W3 · Three-juggler cards** (Sonnet). Ruling 5. Owns `presets.ts`, `copy.ts` (`presets`), `docs/BIBLIOGRAPHY.md`, renderer or sound-panel fixes for three jugglers if needed, unit tests (each new card reads, its ball count, cycle), e2e (load each new card at 1280×800 and 390×844, three figures drawn; screenshot in the report).
- End state for a person: the wheel's passing cards include three-person patterns that play, with three jugglers on stage.

**W2 · Filters** (Opus), after W1. Ruling 4. Owns the chip row in `mount-deck.ts`, `deck-model.ts` (filtered order), `state.ts` (`deckFilter`), `actions.ts`, `copy.ts`, CSS, unit tests, e2e at 1280×800 and 390×844 (each chip filters, tap again clears, ← → stay in group, a chip loads its first card when the current card is outside it, the link never carries the filter).
- End state for a person: tap Passing and the wheel holds only passing cards.

Every stream: CI green, one fresh-eyes Fable review of the whole branch, headless screenshots in the report. Checkpoint after each merge: governor smokes headless on anomatom.com, then a short smoke for Nico.

## Not in scope

Four and five jugglers in the engine (v7). Favourites. A Sync filter. Any change to the phone wheel's turning.
