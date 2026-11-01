# v4.2 · follow-ups

Status: merged and smoked 2026-11-01 (governor Opus, session 1208; PRs 72 plan, 73 F1 (Sonnet); one Opus fresh-eyes review, its should-fixes fixed before merge: the names test waits on the 400 faces and counts its rows). Names: seven-fours "Seven, two fours"; rising-passes "Rising" (the room is about 55 px; the reviewer offered "Climbing" or "3, 4, 5", Nico to choose). The notch flake was reproduced once in about 900 runs and not caught; the fix re-centres the pointer on the button and waits for each step's hash, the likely cause, not proven. Checkpoint smoke headless on anomatom.com: deck and done-means specs, 120 passed on Edge and WebKit.

Carried from v4.1 (`docs/plans/v4-1-polish.md`, status line).

## Rulings (governor, 2026-11-01)

1. **Every wheel name shows whole at 390 px.** Names that ellipsize in a wheel row at 390×844 are shortened in `copy.presets`, not shrunk: short, plain, in the voice of the rest ("Two-count with 3, 4 and 5 passes inserted" becomes something like "Rising passes, 3 4 5"). The name under the bar's notation follows, since it is the same string. The row layout and font sizes are unchanged. A name that changes keeps its `id`, so no link changes.
2. **The bar's notation for `rising-passes` at 390 px.** v4.1 ruling 2 stands: it shrinks to 11 px, then ellipsizes; the wheel shows it whole. Not reopened here.
3. **The mouse-wheel notch e2e is deterministic.** "a mouse wheel over the pattern name steps one pattern a notch" (`e2e/deck.spec.ts`) flaked once on WebKit under load. Find why (a notch landing during a settle or before the handler is attached) and wait on the state the app exposes, not on time. No `waitForTimeout`, no extra retries.

## Stream

**F1 · Follow-ups** (Sonnet). Owns `src/ui/copy.ts` (preset names only), `e2e/deck.spec.ts`, any unit test that pins a name.
- Rulings 1 and 3.
- e2e at 390×844: every wheel row's `.deck-row-name` has `scrollWidth <= clientWidth` once IBM Plex Mono and the UI font have loaded.
- The notch test passes 30 times in a row on WebKit locally (`--repeat-each=30 --project=webkit`).
- Done means: unit and e2e green in CI, the list of old and new names in the PR body, a 390×844 screenshot of the wheel scrolled to the passing cards.

Checkpoint: the governor smokes headless on anomatom.com at 390×844, then hands Nico a short smoke.
