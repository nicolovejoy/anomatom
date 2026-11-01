# v4.1: polish

Status: merged 2026-10-31 (governor Opus, session 1197; PRs 70 plan, 71 E1 (Opus); one Opus fresh-eyes review, two should-fix fixed: a continuous spin now loops and picks once, held arrow keys land on the loaded row). Rulings in review: every wide screen too short to dock the wheel (under 560 px tall, landscape phones and short desktops) opens it in the right-hand column, over the sheet, replacing v4's over-the-stage rule; at 667×375 the column shows 5 rows; the mute button is 32 px; wheel arrow keys wrap, Home and End go to the ends; credits and the repo link stay under Sources and details. Follow-ups: the longest passing names ellipsize in the wheel at 390 px and rising-passes ellipsizes in the bar; re-centring while a finger rests on the wheel needs a real-iPhone check; a WebKit mouse-wheel-notch e2e flaked once under load.

## Rulings (governor, 2026-10-31; Nico chose 3's labels)

1. **The wheel loops.** It turns forever in both directions like a real wheel: above Cascade come the last Passing patterns, below the last Passing pattern comes "Make your own", then Cascade again. No blank rows anywhere, so the empty band above the band row on a fresh page goes. ‹ › and ← → already wrap and keep doing so. Settling, picking and the "turned by the reader" rule are unchanged.
2. **Long notation fits on a phone.** The transport bar's notation shrinks to fit its space (down to 11 px, mono) before it ellipsizes; on a phone the volume slider is about 80 px wide (a tunable). At 390 px `<7p 1 3 1|3p 3 3 3>` shows whole. The name under it may ellipsize (the wheel shows it whole). If a pattern still cannot fit at 11 px at 360 px wide, it ellipsizes as now.
3. **Passing labels.** The deck's Sound select reads the mapping's rule, ignoring each part's kit, pan and gain (those belong to Kit and Details), so a passing card reads "Height to drum", not "Custom". This is a display match in the deck's model only: `presetOf` and the short link's `~name` are unchanged, so no link loses its kits. The Kit select, when the parts' kits differ, reads the kits' short names in order of first appearance joined by " / " ("TR-808 / LM-2"), as a disabled selected option, replacing "Mixed"; choosing a kit still sets every part.
4. **About.** One page in three layers, elegant and short:
   - top: what anomatom is in two lines, then three one-line bullets on how to use it (pick a pattern from the wheel or ‹ ›; tap Play; Details for the sound, Make your own to type a pattern);
   - a glossary of four or five terms, one line each (siteswap, cascade, pass, sync; the old glossary's two definitions folded in);
   - below the fold, under a "Sources and details" heading: the bibliography as now and a pointer to the math notes.
   No other prose. The hint paragraphs dropped in v4 stay dropped.
5. **Carried fixes.** The bare address at 390×844 fits exactly (it was 1 px taller than the viewport). On a landscape phone (844×390, 667×375) the wheel opens in the right-hand column, not over the beat ladder or over Kit and Sound. The WebKit e2e "a long pattern is drawn smaller, and next cycle stays on screen" (`e2e/deck.spec.ts`) is made deterministic (it flaked once on PR 69).

## Stream

**E1 · Polish** (Opus). Owns `src/app/deck-model.ts`, `mount-deck.ts`, `deck.css`, `src/app/now-playing-model.ts` if still present or wherever the Kit/Sound display values live, `src/app/mount-about.ts`, `about.css`, `src/ui/copy.ts` (About, glossary, kit short names), `src/tunables.ts`, the deck and about e2e specs, unit tests.
- Rulings 1–5. Logic in pure modules at 100% lines (the loop index arithmetic, the label rules).
- Unit tests: the looped wheel index maps to the right preset across both seams; a passing card's mapping reads "Height to drum" and kit label "TR-808 / LM-2"; a hand-edited per-height mapping still reads "Custom"; `presetOf` on the passing mapping is unchanged.
- e2e at 390×844, 844×390, 667×375, 1280×800: no blank rows above or below the band on a fresh page; scrolling up from Cascade reaches the last Passing pattern; `<7p 1 3 1|3p 3 3 3>` is not ellipsized at 390; a passing card shows Sound "Height to drum" and Kit "TR-808 / LM-2"; on a landscape phone the open wheel does not overlap the ladder; `scrollHeight <= innerHeight` everywhere; About shows the three layers and the bibliography sits below the glossary.
- Done means: unit and e2e green in CI, screenshots at the four sizes and of About in the report.

Checkpoint: the governor smokes headless on anomatom.com at the four sizes, then hands Nico a short smoke.
