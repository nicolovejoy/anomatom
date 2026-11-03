# v6.1 · the wheel's feel, the editor, the arrows

Status: planned 2026-11-03 (build governor Opus, session 1219).

## 0. Decided with Nico, 2026-11-03 (smoke of v6)

- The web wheel's stepping (one row per `wheelStepPx`, rate limited by `wheelStepMs`) feels jerky. Nico chose option **A, scaled native scroll**.
- Scrolling far enough brings the digit pad back: the band settling on Make your own opens the editor (v6 ruling 2) and the wheel drops to 5 rows. Nico: only a click opens the editor.
- Swap the arrows: ↑ ↓ step the pattern (it matches the scroll), ← → change Listen for.
- Three-juggler cards are hard to reach. The chip shape is under discussion with mocks; not in this stream.

## 1. Rulings (build governor, 2026-11-03)

1. **Scaled native scroll (web, docked).** The wheel keeps taking `wheel` events, but applies them continuously: each event moves the list by `deltaY × DECK.wheelScale` (0.5, deltaMode lines and pages converted to px), so a trackpad drag follows the fingers at half speed and keeps its momentum tail (scaled). A mouse notch (a large, discrete delta, at or above `DECK.notchPx`) does not jump: it adds one row to an eased glide target, animated by requestAnimationFrame over `DECK.glideMs` (about 180 ms), and further notches extend the target. After the last event the list settles onto the nearest row with an eased scroll (the existing `settleMs` pick). No rate limit; `wheelStepPx`, `wheelStepMs` and the accumulator go if nothing else needs them. Pure parts (delta to px, notch detection, the glide's eased position at time t, the settle target) in `deck-model.ts` at 100% lines, tested with fake times; the rAF loop in `mount-deck.ts`. Phone unchanged (native touch scroll).
2. **The editor opens only on a click.** On web the editor shows when the reader clicks (or presses Enter or Space on) Make your own, or when the stage's pattern is not a card (typed or from a link). The band passing over or settling on Make your own loads nothing and opens nothing. Picking a card hides the editor, as today. Phone sheet unchanged.
3. **Arrows.** ↑ ↓ step the pattern (previous / next, as ← → do today, within the lit filter); ← → step Listen for. Key caps in the bottom bar and the keys line in About (`copy.ts`) change to match. A focused wheel keeps its own ↑ ↓; a focused chip or editor input keeps its native keys. Phone has no key caps; nothing changes there.

## 2. Stream

**W4 · Wheel feel** (Opus). Rulings 1 to 3. Owns `mount-deck.ts` (docked wheel input, editor trigger, key handler), `deck-model.ts`, `tunables.ts` (`DECK`), `copy.ts` (key caps, keys line), e2e. e2e at 1280×800: a sequence of small wheel deltas (trackpad-like, 10 × deltaY 8) moves the list by about 40 px (half), not in row jumps; one deltaY 100 event glides to the next row and settles there; scrolling the whole loop twice never shows the editor; clicking Make your own shows it; ↓ steps to the next card, → changes Listen for. Phone e2e unchanged and green.
- End state for a person: on a laptop the wheel glides under the trackpad and the mouse, slower than a page, and the digit pad shows only when you click Make your own.

CI green, one fresh-eyes Fable review, headless screenshots in the report.
