# v6.8 · jugglers in a ring; a juggler you can orbit (proposal)

Status: proposed 2026-11-06, awaiting Nico. Nothing is built from this until the questions in section 6 are answered. Issue #7.

## 0. What Nico has said, and what is on record

- 2026-11-05: with three or four jugglers he wants them in a triangle or a circle, "as if in real life, rather than in a line"; he asked whether five jugglers are coming; he asked for a full 3D juggler he can orbit (#7).
- The coordinator's recommendation on record (not accepted or rejected): an oblique ring view first, the jugglers on a circle seen from a slightly raised camera, passes crossing the ring, figures scaled by depth; the orbitable 3D view later as a second, lazily loaded view, not a replacement.
- The v6.6 plan: four jugglers drawn in a line; "Five and a ring layout come later: nothing here starts them, nothing precludes them."
- The v2 plan and #7: "The passing stage keeps juggler motion in world coordinates, so 3D becomes a renderer swap." Section 1 checks that claim.

## 1. What the juggler view exposes today (measured at 13c0732)

`jugglerFrame(segments, now, layout, lookup)` in `src/view/juggler.ts` is pure: the segments (each a Schedule with its `startTime`, `pulseLen`, `endTime` and carry) and `now` in seconds on the audio clock go in, a `JugglerFrame` comes out. Nothing accumulates; `src/main.ts` runs one `requestAnimationFrame` loop that hands every mount `player.view()`, and `now` is the audio clock. So the "pure function of the Schedule and the clock" half of #7 holds.

The "world coordinates" half does not, yet. The frame is in scene metres but two-dimensional:

- `balls`: `x`, `y` (x across, y up, y = 0 the hands' height), `held` (the part holding it, or null in the air), `progress` (0 to 1 through the throw that owns it, air then dwell, one number: there is no separate air progress), `flash`, `inhuman`.
- `hands`: `{ part, catchX, throwX }`, two numbers on one line. Hands are spans on y = 0; they do not move.
- `faults`: `{ x0, x1, apex, inhuman }`, an arc between two x positions.
- `bounds`, `parts`.

Where the line is built in: `handPlaces` puts figure f at `f × figureStride` (1.9 m) along x; `along` and `waiting` interpolate a single x from the thrower's `throwX` to the catcher's `catchX`; `faultArcs` and `bounds` read x only; `figureSpans`, `handBar`, `captionRoom`, `captionPlace` and `sceneScale` are pixel helpers for a front view. There is no depth, and a pass cannot leave the line.

What is already right for a ring and for 3D, and is reused unchanged: all the timing (`owner`, the air and dwell split in `along`, `waiting`, switches, carry and retiming, `boundary`), the flash, the "not a human throw" rule, `faultedFlights`, `ballColours`, the scoop spline, the apex g·air²/8. Changing the picture means changing where hands stand and interpolating a ground point instead of an x, about a fifth of the file.

## 2. The ring in 2D

### 2.1 One prerequisite: the world frame (no visible change)

Each hand gets a ground point for its catch and throw, `(x, z)` with z away from the viewer, from a figure placement: the line (today's, z = 0) or the ring. `along` and `waiting` interpolate the ground point linearly and keep y exactly as now, so a ball's path is still one parabola, in the vertical plane through thrower and catcher. Balls, hands and fault arcs gain z. With the line placement every number the frame returns is the same as today: the existing `juggler.test.ts` cases are the regression check, unchanged. This step is also what the 3D view needs, so it is not wasted if the 2D ring is later dropped.

### 2.2 Geometry

Each juggler stands on a circle facing its centre, its hands on the circle's tangent. Neighbours stand `figureStride` (1.9 m, today's spacing) apart, so the radius is R = 1.9 / (2 sin(π/N)): 1.10 m for three, 1.34 m for four, 1.62 m for five. Juggler numbers run round the ring in order, so the Square card's passes (each to the next juggler) go round its edges and a five-juggler star's passes (two to the right) draw a pentagram.

The camera: from the front, raised `elevationDeg` 20 (proposed tunable), at `cameraMetres` 8 from the ring's centre. A point projects to screen x = x·s and screen y = (y cos 20° + z sin 20°)·s, with s = 8 / (8 + z): further back is higher on screen and smaller. A ball's radius is scaled by its own s, never under `minRadiusPx` (6).

Who stands where (angles from the front, clockwise seen from above):

- Three: juggler 1 at the back centre, facing the viewer; jugglers 2 and 3 at front-left and front-right (±60°), three-quarter backs to the viewer. Nobody stands front centre, where they would hide the ring.
- Four: a square turned 45°: jugglers 1 and 2 back-right and back-left, 3 and 4 front-left and front-right. Nobody is seen exactly side-on.
- Five: juggler 1 at the back centre, the rest at 72° steps. Two figures (2 and 5, at ±108°) are nearly side-on: their two hands are 26 px apart across at the 200 px floor and separated mostly in depth.

Sizes at 390 px wide (worked from the formulas above with today's `JUGGLER` tunables; 18 px of caption room; the scene sized for a 1.5 m apex as `sceneScale` does), against today's line:

- At the upright floor, a 200 px region (`DECK.minFigurePx`), everything is height-bound, because depth adds height (0.56 m of screen height for three): three 75 px/m (line 79), four 69 (line 57), five 64 (line 44). Three loses about 5 %; four and five gain.
- At a 360 px region: three 152 px/m, four 134, five 111 (line: 79, 57, 44). The ring is wider than tall, so it uses a tall phone stage far better than the line.
- Depth scale front to back: 1.07 to 0.88 for three, 1.13 to 0.89 for four, 1.20 to 0.83 for five.

Captions stay "Juggler n", in the part colour, under each figure's own hand bars, so a back figure's caption sits higher than a front one's (46 px higher for four at 200 px). They are drawn before the balls, so balls fly over them. A unit test on the pure layout asserts no two caption boxes intersect at 320, 375 and 390 px wide and 200 and 360 px tall, for three, four and five (the v6.6 ruling 18 test, two-dimensional).

Drawing order is back to front by z, every frame: hand bars, captions and balls of the back figures first.

### 2.3 Passes and self-throws

A pass is the world parabola between two ground points, projected. Seen from the raised camera its two ends are at different screen heights (the catcher in front is lower), and the ball grows as it comes forward. Under the projection without perspective the path would be exactly a parabola with a tilted chord; with s it bends slightly, so balls are drawn as points per frame as now and a fault arc is drawn as a 16-segment polyline instead of `quadraticCurveTo`.

Self-throws of a figure facing the viewer (juggler 1 of three) look as today, smaller and higher up. Self-throws of a figure with its back three-quarters to the viewer look as today, narrower, its hands mirrored (its part 0 on screen right); the hand bars keep their part colours, so they still match the ladder lanes. Self-throws of a nearly side-on figure (five's jugglers 2 and 5) travel mostly in depth: a narrow, leaning loop. That is how it looks from there in real life; it reads worse than the line. The orbit (section 3) is the answer to it.

The back figures' apexes rise above the front ones; `bounds` becomes the projected box of every hand point at its deepest scoop and its highest apex, eased over a switch as now.

### 2.4 Pan (SPEC §6.2)

Today pan is "from the stage": juggler j, drawn j-th from the left, at −0.6 + 1.2·j/(N − 1). In a ring there is no left-to-right order: following the picture would put three's juggler 1 at the centre, and the square's back-left and front-left jugglers (2 and 3) within 16 px of each other at 200 px, so at almost the same pan. Proposed: pan stays by juggler number, the formula unchanged, and the §6.2 row says "by juggler number" instead of "drawn on the left". The sound of no card changes; the jugglers stay apart by their drum machines as v6.6 ruling 19 already relies on. Five: centres −0.6, −0.3, 0, 0.3, 0.6, d = min(0.2, 0.15) = 0.15, neighbours' inner hands meeting as with four.

### 2.5 Two jugglers

In a ring, two jugglers face each other at ±90° and are both seen side-on: every-others and ultimates, the most-played passing cards, would become two narrow leaning loops. Proposed: one and two jugglers keep today's picture; the ring starts at three. (The other choice, face to face in profile, is one tunable away once the ring is built.)

### 2.6 Effort

Two PRs. R1 the world frame (pure, `src/view/juggler.ts` and its tests; nothing visible changes). R2 the ring placement, the projection and its bounds, captions, back-to-front drawing (`src/view`, `src/app/juggler-canvas.ts`, `JUGGLER` or a new `RING` group in `src/tunables.ts`), the SPEC §4.1 and §6.2 lines, and an e2e at 390×844 and 1280×800 for each three- and four-juggler card (figures, balls, the canvas inside the viewport, a screenshot each).

## 3. The orbitable 3D view

- Library: three.js, MIT. Size: the full `three.module.min.js` is roughly 170 KB gzipped, and a scene of spheres with a WebGL renderer tree-shakes to roughly 130 to 150 KB (to verify: three is not installed, so neither figure was measured). Against that, the built app in the main checkout's `dist/` is 57 KB and 25 KB gzipped (a stale build, for scale only). Lighter permissive options exist (OGL, to verify its licence and size; hand-written WebGL), with more code of our own. `OrbitControls` ships in the same package, same licence.
- Loading: a dynamic `import('three')` on the first tap on the 3D toggle, as smplr is loaded today. Vite puts it in its own chunk, so the first paint is unchanged; until it arrives the 2D view stays drawn.
- One clock: the 3D view is a mount with a `draw(view)` like the others, called from the one loop in `src/main.ts`. It calls `renderer.render` there and never `setAnimationLoop`, so it keeps no time of its own. Orbit damping, if used, is per call, not per second.
- Scene: each ball a sphere at the frame's (x, y, z), radius `JUGGLER.radius`, its ball colour; each hand a flat disc at its catch-to-throw span on the ground plane, in its part colour; a floor circle under the ring. Figures as plain capsules, no faces. Faults as lines in the warning colour.
- Camera: by default the 2D view's camera (front, raised 20°, 8 m), so toggling does not jump. One-finger drag orbits round the ring's centre, pinch or the mouse wheel zooms between limits, elevation is kept between 5° and 80°. `touch-action: none` on the 3D canvas only, so a drag there turns the view and never scrolls the page. A "Reset view" button (a copy string).
- Phone: the canvas takes the same stage region, so the v6.6 upright grid and `DECK.minFigurePx` (200) and `sheetFigurePx` (120) still bound it; pixel ratio capped at 2. Fifteen spheres is far below any phone's budget; the risk is battery on long runs, measured on Nico's iPhone.
- Default: 2D stays the default, 3D is a toggle on the stage, its state in the URL hash (the one persistence) so a link can open in 3D. 3D replacing 2D would put ~150 KB and WebGL in front of every first visit, and lose the captions and the crisp 2D lines on a small phone.
- Reused unchanged from `src/view/juggler.ts`: `jugglerFrame` after R1 and everything section 1 lists as reused. Not used: `sceneScale`, `handBar`, `captionRoom`, `captionPlace`, `figureSpans` (2D pixel helpers). The scene description (what sits where, colours, camera limits) is a pure `src/view` module at 100% lines; the three.js glue is a `*.browser.ts` file, covered by an e2e (headless Chromium and Edge render WebGL in software: the test reads the same `data-balls` hook as 2D).
- Effort: two PRs, after R1. T1 the toggle, the lazy chunk, spheres, hands, default camera, orbit and pinch. T2 the phone pass (Nico's iPhone checklist: gestures, frame rate, battery over five minutes), capsule figures, Reset view.

## 4. Five jugglers

What `MAX_JUGGLERS` 4 → 5 touches:

- `MAX_PARTS` 8 → 10 (a unit test holds it at least 2 × `MAX_JUGGLERS`); `hash.ts` decodes up to `MAX_PARTS`, so a five-juggler link works once both move.
- `parsePassing`'s too-many-jugglers message reads `max`; the one-digit target after `p` is fine up to nine.
- `MAX_LANES` stays 4 (v6.6 ruling 16): a passing set is one passing siteswap; the Rhythm tab shows its first four hands.
- The ladder strip draws ten lanes: 9.2 px a lane at the phone's 92 px, which v6.6 ruling 17's `laneGeometry` already handles; its test gains 10 parts.
- `DRUMMER_KITS` has exactly five kits, so five jugglers have five distinct drum machines at every shift (a test asserts it) and there is no sixth: six jugglers would need a sixth kit or a repeat.
- Pan: the formula holds (2.4).
- The line at 390 px: 44 px/m, a figure 40 px wide, stride 84 px against a 60 px caption: it fits, narrowly. In the ring, 64 px/m at the 200 px floor.

The Compendium (`BIBLIOGRAPHY.md` 27, opened again 2026-11-06, text extracted with pdftotext), "5+ -person Patterns" chapter: Star (5) (Pentagon, Pentagram): "each juggler could pass to either the person to their immediate right or two to the right"; Star Fruit (5); Double Feed (5) (Apollo, Augmented Feed): "A in 2-count, B, C, D & E are in 4-count"; Irvine Pinwheel (5); Weave with Two Feeders (5); 5,4,5,10 Trapezoid (5). Elsewhere: the W-feed (feeders and feedees A to E), Veteran's Star ("a 5-person sweep feed on 3-count"), and the large feeds, which take more feedees ("everyone just lines up across from D"). Proposed cards: Star (5), passing two to the right on a 2-count, and the Typewriter feed with four feedees. The builder writes their notation and the engine gives the balls and cycle, as v6.6 ruling 20 did; nothing here is a verified siteswap yet.

Which wave: this one, after the ring. Five in a line is cramped and the star's shape only shows in a ring, so five without the ring is the weaker half; with the ring it is one small PR.

Effort: one PR (F): the caps, the presets and copy, the tests named above, SPEC §2 and §6.2 lines, MATH §10's worked cases, the bibliography entry, an e2e like `four-jugglers.spec.ts`.

## 5. Recommended order

1. **R1 · the world frame.** Check: nothing changes; every card looks and sounds as before (the agents' smoke; nothing for Nico). Reversal cost: none to the app; if the ring and 3D are both dropped it is a few dozen lines of z that are always 0.
2. **R2 · the ring.** Check: http://localhost:5173 (or the preview URL), the Triangle and Square cards on a phone: the jugglers on a circle seen from slightly above, passes crossing it, the back jugglers smaller and higher, each captioned; two-juggler cards as today. Reversal cost: one placement switch back to the line; R1 stays.
3. **F · five jugglers.** Check: the Star card, five jugglers in a pentagon with the passes drawing a star, five drum machines in the Sound panel. Reversal cost: the caps back to 4 and 8 and two cards removed; a five-juggler link then falls back to the default pattern, as any over-cap link does.
4. **T1 · 3D toggle** (next wave). Check: a 3D button on the stage, the same jugglers in 3D, drag to walk round them, pinch to zoom, the first page load no slower. Reversal cost: remove the toggle and the chunk; links carrying 3D in the hash ignore it.
5. **T2 · 3D on the phone.** Check: Nico's iPhone, five minutes of the Square card in 3D, smooth, no page scroll under a drag. Reversal cost: as T1.

R1, R2 and F are this wave (two streams after R1: R2 and F touch different files except `src/tunables.ts` and SPEC lines). T1 and T2 are the next, once the ring has been seen.

## 6. Questions for Nico

1. Ring in 2D first, 3D as a later second view, or straight to 3D? Recommended: the ring first. It is what you asked for with three and four, it costs two PRs, and its first PR is the world frame 3D needs anyway.
2. Two jugglers: keep today's side-by-side picture, or face to face in the ring? Recommended: keep it; in a ring both are seen side-on and every-others reads worse.
3. Pan in a ring: keep it by juggler number (no card's sound changes), or follow each juggler's place in the picture? Recommended: by number; following the picture would put the square's jugglers 2 and 3 almost on one pan.
4. 3D as a toggle over a 2D default, three.js loaded only on the first tap (about 150 KB gzipped, to verify), or 3D replacing 2D? Recommended: the toggle.
5. Five jugglers in this wave, after the ring, with Star (5) and a four-feedee Typewriter feed as the new cards? Recommended: yes.
