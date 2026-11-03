# v6.1 · the wheel's feel, the editor, the arrows

Status: planned 2026-11-03 (build governor Opus, session 1219).

## 0. Decided with Nico, 2026-11-03 (smoke of v6)

- The web wheel's stepping (one row per `wheelStepPx`, rate limited by `wheelStepMs`) feels jerky. Nico chose option **A, scaled native scroll**.
- Scrolling far enough brings the digit pad back: the band settling on Make your own opens the editor (v6 ruling 2) and the wheel drops to 5 rows. Nico: only a click opens the editor.
- Swap the arrows: ↑ ↓ step the pattern (it matches the scroll), ← → change Listen for.
- Three-juggler cards are hard to reach. Nico chose mock **B** (https://claude.ai/artifact/J11W4H99LQLoPEJi7iNDXF, board `Groups`): two labelled groups, `BALLS 3 4 5   JUGGLERS 2 3`.

## 1. Rulings (build governor, 2026-11-03)

1. **Scaled native scroll (web, docked).** The wheel keeps taking `wheel` events, but applies them continuously: each event moves the list by `deltaY × DECK.wheelScale` (0.5, deltaMode lines and pages converted to px), so a trackpad drag follows the fingers at half speed and keeps its momentum tail (scaled). A mouse notch (a large, discrete delta, at or above `DECK.notchPx`) does not jump: it adds one row to an eased glide target, animated by requestAnimationFrame over `DECK.glideMs` (about 180 ms), and further notches extend the target. After the last event the list settles onto the nearest row with an eased scroll (the existing `settleMs` pick). No rate limit; `wheelStepPx`, `wheelStepMs` and the accumulator go if nothing else needs them. Pure parts (delta to px, notch detection, the glide's eased position at time t, the settle target) in `deck-model.ts` at 100% lines, tested with fake times; the rAF loop in `mount-deck.ts`. Phone unchanged (native touch scroll).
2. **The editor opens only on a click.** On web the editor shows when the reader clicks (or presses Enter or Space on) Make your own, or when the stage's pattern is not a card (typed or from a link). The band passing over or settling on Make your own loads nothing and opens nothing. Picking a card hides the editor, as today. Phone sheet unchanged.
3. **Arrows.** ↑ ↓ step the pattern (previous / next, as ← → do today, within the lit filter); ← → step Listen for. Key caps in the bottom bar and the keys line in About (`copy.ts`) change to match. A focused wheel keeps its own ↑ ↓; a focused chip or editor input keeps its native keys. Phone has no key caps; nothing changes there.

4. **Chips in two groups (mock B).** The chip row becomes two labelled groups: **Balls** 3 · 4 · 5 and **Jugglers** 2 · 3, digits on the chips, the group word as a small label before them. Still one choice at a time across both groups; tapping the lit chip clears it. `deckFilter` becomes `{ by: 'balls' | 'jugglers', n: number } | null`. Balls n holds the solo cards (groups '3', '4', '5') of n balls; Jugglers n holds the passing cards with n jugglers (`jugglerCount`). The chips are derived from the deck (the ball counts of solo cards, the juggler counts of passing cards), so four- and five-juggler cards in v7 add their chips with no UI change. Each chip's accessible name is the whole phrase from `copy.ts` ("3 balls", "2 jugglers"); each group is a `role="group"` with its label. Everything else in v6 ruling 4 holds (loop over the group plus Make your own, ↑ ↓ within it after ruling 3, a chip loads the group's first card only when the current card is outside it, never in the link, a card outside the filter clears it). Phone and web alike; the row stays `DECK.filtersPx` tall.

## 2. Stream

**W4 · Wheel feel** (Opus). Rulings 1 to 3. Owns `mount-deck.ts` (docked wheel input, editor trigger, key handler), `deck-model.ts`, `tunables.ts` (`DECK`), `copy.ts` (key caps, keys line), e2e. e2e at 1280×800: a sequence of small wheel deltas (trackpad-like, 10 × deltaY 8) moves the list by about 40 px (half), not in row jumps; one deltaY 100 event glides to the next row and settles there; scrolling the whole loop twice never shows the editor; clicking Make your own shows it; ↓ steps to the next card, → changes Listen for. Phone e2e unchanged and green.
- End state for a person: on a laptop the wheel glides under the trackpad and the mouse, slower than a page, and the digit pad shows only when you click Make your own.

**W5 · Chips in two groups** (Opus), after W4 merges (both touch `mount-deck.ts`). Ruling 4. Owns the chip row in `mount-deck.ts`, `deck-model.ts` (filter type, filtered order, chips from the deck), `state.ts`, `copy.ts`, `deck.css`, unit and e2e (`filters.spec.ts` rewritten for the two groups at 1280×800 and 390×844: Jugglers 3 holds exactly the three three-juggler cards, Balls 5 the three five-ball cards, one lit chip across both groups, tap again clears).
- End state for a person: tap Jugglers 3 and the wheel holds the three three-person patterns.

Every stream: CI green, one fresh-eyes Fable review, headless screenshots in the report.
