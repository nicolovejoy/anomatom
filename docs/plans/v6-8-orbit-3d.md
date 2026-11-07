# v6.8 · a juggler you can orbit, in 3D by default

Status: built 2026-11-07 by SDD (R1: PR #145; T1: PR #147; T2: PR #149; F: PR #148; plan PR #137; the #142 flake fix PR #144). Open from this wave: #146 (CI e2e has no timeout), #150 (WebKit flake in phone-chip-turning.spec.ts:67), Nico's iPhone check of T2.

## Build rulings (coordinator, 2026-11-06/07)

Each reversible; each with what it costs if wrong.

- Ring numbering runs counter-clockwise seen from above (+x right, +z back), which is what section 2 ruling 2's listed positions are. Cost: one sign.
- The R1 review found ring balls jumping at a part-count switch. Final rule (T1 fix round 1): on the ring, a flight crossing the switch aims at the thrower's picture's hand before the boundary and the catcher's from the boundary on, so figures, hands and those balls cut together at the boundary; the 3D camera's framing eases on audio-clock deltas (`VIEW3D.framingEaseSeconds`), snapping when stopped. Cost: one visible cut when a card changes the juggler count.
- `JugglerFrame` carries `figures` (the playing picture's places). Cost: one field.
- The 2D/3D switch (and Reset view) sit after the deck in the DOM, placed over the stage by CSS, so the wheel stays the first tab stop after About (v6.6 ruling 10 kept). Cost: none visible.
- 3D balls are never under `JUGGLER.minRadiusPx` on screen, as in 2D. Cost: far balls slightly large.
- Half-see-through capsules and an outline floor, so captions under the canvas stay legible. Look for Nico's eye.
- `@types/three` brings `@dimforge/rapier3d-compat` (Apache-2.0) into dev dependencies only; never shipped. Nico's call if he wants it gone.
- The 3D e2e skip where the browser has no WebGL 2 (CI's Linux Firefox) and fail instead of skip on Chromium; fallback tests run everywhere. Cost: 3D untested on Firefox in CI (tested locally).
- Orbit: `VIEW3D.rotateSpeed` 0.45 (about 160° per canvas height); a drag on the 3D canvas still counts as the deck's "tap outside" and compacts a grown card, as any stage tap does. Cost: one condition if it annoys on the phone.
- Five jugglers: `PART_COLOURS` grows to ten (pale butter `#f0e68c`, sand `#d6c3a5`); the five-juggler feed is "Typewriter feed for 5" (as "Ultimates for 3"); `MAX_PATTERN_CHARS` stays 64, so that card's link is `#v3.`. F was built in parallel with T2, not after the iPhone check. Cost: a longer link for one card.
- The Star's pentagram shows in motion and from above (orbit), not in a still from the default camera: there are no pass trails.

## 0. Decided with Nico, 2026-11-06

1. **Straight to 3D.** No 2D ring wave first.
2. **3D is the default view, 2D the fallback.** Today's 2D line view stays: drawn when WebGL is missing or three.js fails to load, drawn until three.js arrives, and a lighter view a reader can switch to.
3. **Five jugglers this wave**, as the last PR, after 3D works on Nico's iPhone. New cards Star (5) and a Typewriter feed with four feedees.
4. Taken by the coordinator on Nico's question "do you still have questions?", standing unless he objects: two jugglers face each other in 3D (the orbit answers the side-on view the 2D ring had); pan stays by juggler number (ruling 3); the world frame is built first.

What is on record from before: Nico, 2026-11-05, wants three or four jugglers in a triangle or a circle "as if in real life, rather than in a line", asked whether five are coming, and asked for a full 3D juggler he can orbit (#7). The v2 plan: "The passing stage keeps juggler motion in world coordinates, so 3D becomes a renderer swap." Section 1 checks that claim.

## 1. What the juggler view exposes today (measured at 13c0732)

`jugglerFrame(segments, now, layout, lookup)` in `src/view/juggler.ts` is pure: the segments (each a Schedule with its `startTime`, `pulseLen`, `endTime` and carry) and `now` in seconds on the audio clock go in, a `JugglerFrame` comes out. Nothing accumulates; `src/main.ts` runs one `requestAnimationFrame` loop that hands every mount `player.view()`, and `now` is the audio clock. So the "pure function of the Schedule and the clock" half of #7 holds.

The "world coordinates" half does not, yet. The frame is in scene metres but two-dimensional:

- `balls`: `x`, `y` (x across, y up, y = 0 the hands' height), `held` (the part holding it, or null in the air), `progress` (0 to 1 through the throw that owns it, air then dwell, one number: there is no separate air progress), `flash`, `inhuman`.
- `hands`: `{ part, catchX, throwX }`, two numbers on one line. Hands are spans on y = 0; they do not move.
- `faults`: `{ x0, x1, apex, inhuman }`, an arc between two x positions.
- `bounds`, `parts`.

Where the line is built in: `handPlaces` puts figure f at `f × figureStride` (1.9 m) along x; `along` and `waiting` interpolate a single x from the thrower's `throwX` to the catcher's `catchX`; `faultArcs` and `bounds` read x only; `figureSpans`, `handBar`, `captionRoom`, `captionPlace` and `sceneScale` are pixel helpers for a front view. There is no depth, and a pass cannot leave the line.

What is already right for a ring and for 3D, and is reused unchanged: all the timing (`owner`, the air and dwell split in `along`, `waiting`, switches, carry and retiming, `boundary`), the flash, the "not a human throw" rule, `faultedFlights`, `ballColours`, the scoop spline, the apex g·air²/8. Changing the picture means changing where hands stand and interpolating a ground point instead of an x, about a fifth of the file.

## 2. Rulings (coordinator, 2026-11-06, each reversible)

1. **The world frame first (R1), no visible change.** Each hand gets a ground point `(x, z)` for its catch and its throw, z away from the default camera, from a figure placement. `along` and `waiting` interpolate the ground point linearly and keep y exactly as now, so a ball's path is still one parabola in the vertical plane through thrower and catcher. Balls, hands and fault arcs gain z. Two placements, both pure: the line (today's, z = 0), which the 2D view keeps, and the ring (ruling 2), which the 3D view uses. With the line placement every number the frame returns is today's, so the existing `juggler.test.ts` cases are the regression check, unchanged.
2. **Who stands where in 3D.** One juggler stands at the centre facing the default camera. Two face each other across a pass of `figureStride` (1.9 m, today's spacing). Three or more stand on a circle facing its centre, hands on its tangent, neighbours `figureStride` apart: R = 1.9 / (2 sin(π/N)), 1.10 m for three, 1.34 m for four, 1.62 m for five. Juggler numbers run round the ring in order, so the Square card's passes go round its edges and the five-juggler star draws a pentagram. Three: juggler 1 at the back facing the camera, 2 and 3 front-left and front-right. Four: a square turned 45°, nobody side-on. Five: juggler 1 at the back, the rest at 72° steps.
3. **Pan stays by juggler number.** The SPEC §6.2 formula is unchanged and its row says "by juggler number" instead of "drawn on the left". No card's sound changes. The camera turns, so a pan tied to the screen would be wrong half the time.
4. **The default camera.** Raised `elevationDeg` 20 at `cameraMetres` 8 from the scene's centre (new tunables in a `VIEW3D` group). For one juggler and three or more, from the front. For two, from the side of their line turned `twoAzimuthDeg` 30 toward juggler 1, so one is seen three-quarter front and the other three-quarter back instead of both in profile. The camera frames the scene's projected box at its deepest scoop and highest apex, eased over a switch as the 2D bounds are now.
5. **2D stays, as fallback and as a choice.** The 2D view is today's `juggler-canvas.ts`, untouched. It draws on the first paint and stays until the three.js chunk has loaded and a WebGL context is made; then the 3D canvas takes the same stage region. If `import('three')` rejects or no WebGL context can be made, the 2D view stays and nothing is announced. A small button on the stage switches 3D and 2D (copy strings in `src/ui/copy.ts`). The choice is UI state like mute: never in the link, so a shared link opens in the reader's default. Reversible: one hash field if Nico wants a link to carry it.
6. **Library and loading.** three.js, MIT, with `OrbitControls` from the same package. A dynamic `import('three')` right after the first paint, as smplr is loaded, so Vite puts it in its own chunk and the first paint is unchanged. The PR states the chunk's gzipped size (estimated 130 to 150 KB, not measured: three is not installed) against the app's.
7. **One clock.** The 3D view is a mount with `draw(view)`, called from the one `requestAnimationFrame` loop in `src/main.ts`. It calls `renderer.render` there and never `setAnimationLoop`. It renders when the frame changes or the camera moves, not every tick while paused. Orbit damping, if used, is per call, not per second.
8. **The scene.** Each ball a sphere at the frame's (x, y, z), radius `JUGGLER.radius`, its ball colour. Each hand a flat disc on its catch-to-throw span, in its part colour, so it still matches its ladder lane. A floor circle under the ring. Figures as plain capsules, no faces. Faults as lines in the warning colour; "not a human throw" flights dimmed, with the same copy as 2D; the flash as a brief brighter sphere. Depth order is the renderer's, which closes #143 for the 3D view (the 2D fallback draws as today).
9. **Captions.** "Juggler n" in the part colour, a DOM label positioned each frame at the figure's projected foot, from the pure scene module's projection. Labels never cover each other: a back figure's label sits under its own feet, which in a raised view is above the front figures' heads. A unit test on the pure projection asserts no two caption boxes intersect at the default camera, at 320, 375 and 390 px wide and 200 and 360 px tall, for one to five jugglers.
10. **Orbit (T2).** One-finger drag turns the view round the scene's centre; pinch or the mouse wheel zooms between limits; elevation is kept between 5° and 80°. `touch-action: none` on the 3D canvas only, so a drag there never scrolls the page and the deck's touch handling (v6.7 ruling 3) is untouched. A "Reset view" button returns to ruling 4's camera. A switch to another card keeps the reader's camera unless the juggler count changes, which resets it.
11. **The phone.** The 3D canvas takes the stage region exactly, so the v6.6 upright grid, `DECK.minFigurePx` (200) and `sheetFigurePx` still bound it. Pixel ratio capped at 2. The risk is battery on long runs, measured on Nico's iPhone in T2.
12. **Code shape.** The scene description (placements, what sits where, colours, camera, projection, captions) is a pure `src/view` module, held at 100% lines in `vitest.config.ts`. The three.js glue is a `*.browser.ts` file in `src/app`, covered by e2e. Headless Chromium and Edge render WebGL in software; the 3D canvas exposes the same `data-balls` hook as 2D, so the e2e reads the same numbers.

## 3. Streams

1. **R1 · the world frame and placements.** `src/view/juggler.ts` and its tests; the ring and two-juggler placements as pure functions with their own tests. Check: nothing changes; every card looks and sounds as before (the agents' smoke, nothing for Nico). Reversal cost: none to the app.
2. **T1 · 3D by default.** Rulings 2, 4 to 9 and 12: the lazy chunk, the scene, the default camera, captions, the 2D fallback and the switch, SPEC §4.1 (a dated v6.8 paragraph: the juggler is drawn in 3D, 2D as fallback and choice) and §6.2's pan row. e2e at 390×844 and 1280×800 for one, two, three and four jugglers: the 3D canvas shown, balls counted by `data-balls`, the canvas inside the viewport, a screenshot each; WebGL forced off (a `getContext` stub) and the import forced to fail, each showing the 2D view; the switch both ways. Check for Nico: https://anomatom.com after merge, on a laptop and a phone, the Cascade, every-others, Triangle and Square cards in 3D from the default camera, the 2D button showing today's picture. Reversal cost: the default flips to 2D in one line.
3. **T2 · orbit, on the phone.** Rulings 10 and 11. e2e: a drag changes the camera and does not scroll the page; Reset view returns it; a card change keeps it, a juggler-count change resets it. Check for Nico: his iPhone, five minutes of the Square card in 3D, drag round it, pinch, smooth, no page scroll under a drag, battery noted. Reversal cost: remove the controls; the fixed camera of T1 stays.
4. **F · five jugglers.** Section 4. Check for Nico: the Star card, five jugglers in a pentagon with the passes drawing a star, five drum machines in the Sound panel. Reversal cost: the caps back to 4 and 8 and two cards removed; a five-juggler link then falls back to the default pattern, as any over-cap link does.

In order, one at a time: each depends on the one before, except F, which touches different files from T2 and waits only because Nico asked for it after the iPhone check.

## 4. Five jugglers

What `MAX_JUGGLERS` 4 → 5 touches:

- `MAX_PARTS` 8 → 10 (a unit test holds it at least 2 × `MAX_JUGGLERS`); `hash.ts` decodes up to `MAX_PARTS`, so a five-juggler link works once both move.
- `parsePassing`'s too-many-jugglers message reads `max`; the one-digit target after `p` is fine up to nine.
- `MAX_LANES` stays 4 (v6.6 ruling 16): a passing set is one passing siteswap; the Rhythm tab shows its first four hands.
- The ladder strip draws ten lanes: 9.2 px a lane at the phone's 92 px, which v6.6 ruling 17's `laneGeometry` already handles; its test gains 10 parts.
- `DRUMMER_KITS` has exactly five kits, so five jugglers have five distinct drum machines at every shift (a test asserts it) and there is no sixth: six jugglers would need a sixth kit or a repeat.
- Pan: the formula holds (ruling 3).
- The line at 390 px: 44 px/m, a figure 40 px wide, stride 84 px against a 60 px caption: it fits, narrowly. The 2D line is now the fallback view only (ruling 5); in 3D the five stand on the ring.

The Compendium (`BIBLIOGRAPHY.md` 27, opened again 2026-11-06, text extracted with pdftotext), "5+ -person Patterns" chapter: Star (5) (Pentagon, Pentagram): "each juggler could pass to either the person to their immediate right or two to the right"; Star Fruit (5); Double Feed (5) (Apollo, Augmented Feed): "A in 2-count, B, C, D & E are in 4-count"; Irvine Pinwheel (5); Weave with Two Feeders (5); 5,4,5,10 Trapezoid (5). Elsewhere: the W-feed (feeders and feedees A to E), Veteran's Star ("a 5-person sweep feed on 3-count"), and the large feeds, which take more feedees ("everyone just lines up across from D"). Proposed cards: Star (5), passing two to the right on a 2-count, and the Typewriter feed with four feedees. The builder writes their notation and the engine gives the balls and cycle, as v6.6 ruling 20 did; nothing here is a verified siteswap yet.

Which wave: this one, last, once 3D works on Nico's iPhone (Nico, 2026-11-06). Five in 3D stand on the ring and the star's passes draw a pentagram.

Effort: one PR (F): the caps, the presets and copy, the tests named above, SPEC §2 and §6.2 lines, MATH §10's worked cases, the bibliography entry, an e2e like `four-jugglers.spec.ts`.

## 5. Not this wave

- Clubs and moving hands. The hands stay spans that do not move, as in 2D.
- Faces, arms or any body beyond a capsule.
- A camera in the link (ruling 5).
- #142, the Firefox audio-session flake in CI, which is not part of this wave.
