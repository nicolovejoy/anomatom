# v6.9: the jugglers take the screen (notes, not yet a plan)

Status: notes from Nico's review of v6.8 on 2026-11-07, to be argued into a plan next session.
Nothing here is built.

## What Nico saw

1. On the Mac he could not find how to turn the 3D view. Drag works (checked headless in Edge and
   WebKit at 1440×900 on https://anomatom.com), but nothing says so: no grab cursor, no hint.
2. On iPad the wide layout shows the laptop's key bar (space play, ↑↓ pattern, ←→ listen for).
   Arrows cannot be pressed on a touch screen. Pattern is covered by the list beside the jugglers;
   Listen for can only be changed by opening the Sound tab.
3. The pattern list takes about a third of the width, and the strip and key bar about a quarter
   of the height: the jugglers get roughly half the screen. He wants three or four jugglers to fill
   almost all of it.

## Decided (Nico, 2026-11-07)

1. **Full view** (option 1 of four discussed). A ⤢ button beside ↺ and 2D, and Esc on the laptop,
   toggles it. Picked over hide-while-playing, a collapsed rail, and a floating list.
2. **Interacting with the jugglers enters it.** When the reader starts interacting with the
   animation (a drag, a pinch, a tap on the stage), on iPad or anywhere else, everything else
   shrinks to the bare minimum: the jugglers get about 90% of the screen on iPad, or more.
3. **Phones too.** The phone's wheel card shrinks the same way.
4. **One wave, v6.9**, with the two fixes below.

## Also in the wave

1. **Touch Listen for.** Where the main pointer is a finger (`pointer: coarse`), the key bar goes;
   in its place, beside Play, three tap buttons: Height · Each ball · Pitch, the chosen one lit, in
   step with the Sound tab. Short labels in `copy.ts`; the Sound tab keeps the long names. The
   laptop keeps the key bar.
2. **Say the view turns.** A grab cursor over the 3D view (grabbing while dragging), and a hint near
   ↺, "Drag to turn, scroll to zoom" (touch: "Drag to turn, pinch to zoom"), gone after the first turn.

## Open for the next session

1. **The strip in full view: thin or gone.** Nico asked for mocks; they are below. Recommendation:
   thin, since the strip is half of what anomatom shows.
2. What brings the rest back: the ⤡ button, a tap on the minimum controls, Esc. Not a tap on the
   jugglers, which already turns the view and shrinks a grown card.
3. What "the bare minimum" holds. Proposed: Play, the pattern name with ‹ › to step patterns, the
   Listen for buttons, ⤡, ↺.
4. Does a drag that enters full view also turn the camera, or does the first drag only enter?
5. iPad true fullscreen (`requestFullscreen`, hides Safari's bar) on ⤢; iPhone Safari has none.

## Mocks: iPad landscape, full view

Strip thin (about a third of today's height):

```
┌──────────────────────────────────────────────────────────────┐
│ ▶  Square · 4 jugglers   ‹ ›   Height · Each ball · Pitch  ⤡ ↺│
│                                                              │
│          ●                         ●                         │
│        ▐██▌        ●   ●         ▐██▌                        │
│        ▐██▌ ─────────────────── ▐██▌                         │
│                                                              │
│     ●                                            ●           │
│   ▐██▌                                         ▐██▌          │
│   ▐██▌                                         ▐██▌          │
│                    jugglers ≈ 90% of screen                  │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ ╱╲╱╲╱╲│╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲   (thin strip, playhead)           │
└──────────────────────────────────────────────────────────────┘
```

Strip gone:

```
┌──────────────────────────────────────────────────────────────┐
│ ▶  Square · 4 jugglers   ‹ ›   Height · Each ball · Pitch  ⤡ ↺│
│                                                              │
│          ●                         ●                         │
│        ▐██▌        ●   ●         ▐██▌                        │
│        ▐██▌ ─────────────────── ▐██▌                         │
│                                                              │
│     ●                                            ●           │
│   ▐██▌                                         ▐██▌          │
│   ▐██▌                                         ▐██▌          │
│                                                              │
│                    jugglers ≈ 95% of screen                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Today, for comparison: the list holds the right third, and the strip and key bar the bottom quarter.
