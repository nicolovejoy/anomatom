// Full view (docs/plans/v6-9-full-view.md, rulings 1 and 2), headless: what enters it, what leaves
// it, and what its row holds. Pure: no DOM, no timers. mount-juggler.ts (the ⤢ button and the
// canvas gestures), mount-deck.ts (the row, Escape) and mount-layout.ts (the classes) are the elements.
import { DECK, FULL } from '../tunables';

/** What can ask for full view. */
export type EntryKind = 'button' | 'drag' | 'pinch' | 'wheel' | 'tap';

/**
 * Whether `kind` enters full view from `view`. The button always does. A drag, a pinch and the
 * wheel enter from the 3D view only, since 2D has no turn to learn; a tap never does, so an
 * editor never loses the list by clicking the stage.
 */
export function fullViewEntry(kind: EntryKind, view: '2d' | '3d'): boolean {
  if (kind === 'button') return true;
  if (kind === 'tap') return false;
  return view === '3d';
}

/** Whether a pointer that went down and is now (dx, dy) away has dragged, not tapped. */
export const isDrag = (dx: number, dy: number, thresholdPx: number): boolean => Math.hypot(dx, dy) >= thresholdPx;

/** What a pointer gesture on the canvas has become. */
export type Gesture = 'drag' | 'pinch';

/**
 * Follows the pointers on the 3D canvas and says, once per gesture, when it turns out to be a drag
 * (a move past `thresholdPx` from the pointerdown) or a pinch (a second pointer down). A pointerdown
 * alone says nothing. Returns null for every other event.
 */
export function createGesture(thresholdPx: number) {
  const starts = new Map<number, { x: number; y: number }>();
  let said = false;
  const say = (g: Gesture): Gesture | null => {
    if (said) return null;
    said = true;
    return g;
  };
  return {
    down(id: number, x: number, y: number): Gesture | null {
      if (starts.size === 0) said = false;
      starts.set(id, { x, y });
      return starts.size > 1 ? say('pinch') : null;
    },
    move(id: number, x: number, y: number): Gesture | null {
      const start = starts.get(id);
      return start !== undefined && isDrag(x - start.x, y - start.y, thresholdPx) ? say('drag') : null;
    },
    up(id: number): void {
      starts.delete(id);
    },
    /** Forget every pointer: a context menu can swallow the pointerup. */
    clear(): void {
      starts.clear();
    },
  };
}

/** What the row of controls holds at a width, for a pointer kind (ruling 2, "the row"). */
export interface RowLayout {
  readonly rows: 1 | 2;
  /** The ← → caps and the keys at the right: a keyboard's. */
  readonly keyCaps: boolean;
}

export function rowLayout(width: number, coarse: boolean): RowLayout {
  const rows = width < FULL.twoRowsBelowPx ? 2 : 1;
  return { rows, keyCaps: !coarse };
}

/**
 * Whether the pattern box keeps "· n balls" (docs/plans/v6-10-pick-in-full-view.md, 1.7): only while
 * the notation still fits whole beside it, `needed` px of text in `room` px; the count goes before
 * the notation is cut, and the notation's ellipsis is the last resort.
 */
export const keepsBalls = (needed: number, room: number): boolean => needed <= room + 0.5;

/** Whether a key leaves full view: Escape, once no wheel (opened in full view, v6.10) or sheet is open to take it first. */
export const leaveKey = (key: string, wheelOpen: boolean, sheetOpen: boolean): boolean => key === 'Escape' && !wheelOpen && !sheetOpen;

/** Where the wheel opens in full view (docs/plans/v6-10-pick-in-full-view.md, section 1.4). */
export type PickMode = 'left' | 'top' | 'pop';

/**
 * A landscape screen puts the wheel at the left of the stage and the jugglers in the square at its
 * right; a tall one wide enough for the row (the iPad in portrait) puts the jugglers in a square at
 * the top and the wheel under them; a tall narrow one (the phone upright) leaves the stage as it
 * is and pops the wheel up from the bar.
 */
export const pickMode = (width: number, height: number): PickMode => (height > width ? (width < FULL.twoRowsBelowPx ? 'pop' : 'top') : 'left');

/** Where the wheel and the jugglers go, in px. */
export interface PickPlace {
  readonly mode: PickMode;
  /** The jugglers' square (0 when they keep the stage: the pop-up). */
  readonly square: number;
  /** The wheel's width beside the square ('left'), its height under it ('top'), 0 for the pop-up. */
  readonly side: number;
  /** The wheel's rows, odd, and each one's height. */
  readonly rows: number;
  readonly rowPx: number;
}

/** The most rows, odd, from 3 to `max`, that `room` holds at the base row height: 3 when not even that many do. */
const oddRows = (room: number, max: number): number => {
  for (let n = max; n > 3; n -= 2) if (n * DECK.rowPx <= room) return n;
  return 3;
};

/** A row as tall as `room` allows `rows` of them, between the base height and FULL.pickRowMaxPx. */
const rowHeight = (room: number, rows: number): number => Math.min(FULL.pickRowMaxPx, Math.max(DECK.rowPx, Math.floor(room / rows)));

/**
 * The layout of the open wheel (docs/plans/v6-10-pick-in-full-view.md): for the screen's `width`
 * and `stageHeight` (the screen less the strip and the bar) and the filters' measured height.
 * Beside the jugglers ('left') the square is the largest the stage holds that leaves the wheel
 * FULL.pickWheelMinPx; under them ('top') it is what the filters and FULL.pickTopRows rows leave,
 * at most the width; the wheel takes the rest and shows as many odd rows as it holds. The pop-up
 * shows up to FULL.pickPopRows, keeping DECK.minFigurePx of the stage clear above it.
 */
export function pickPlace(mode: PickMode, width: number, stageHeight: number, filtersPx: number): PickPlace {
  if (mode === 'pop') {
    const rows = oddRows(stageHeight - DECK.minFigurePx - filtersPx, FULL.pickPopRows);
    return { mode, square: 0, side: 0, rows, rowPx: DECK.rowPx };
  }
  if (mode === 'left') {
    const square = Math.max(0, Math.min(stageHeight, width - FULL.pickWheelMinPx));
    const room = stageHeight - filtersPx;
    const rows = oddRows(room, FULL.pickMaxRows);
    return { mode, square, side: width - square, rows, rowPx: rowHeight(room, rows) };
  }
  const square = Math.max(0, Math.min(width, stageHeight - filtersPx - FULL.pickTopRows * DECK.rowPx));
  const side = stageHeight - square;
  const room = side - filtersPx;
  const rows = oddRows(room, FULL.pickMaxRows);
  return { mode, square, side, rows, rowPx: rowHeight(room, rows) };
}
