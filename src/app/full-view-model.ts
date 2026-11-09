// Full view (docs/plans/v6-9-full-view.md, rulings 1 and 2), headless: what enters it, what leaves
// it, and what its row holds. Pure: no DOM, no timers. mount-juggler.ts (the ⤢ button and the
// canvas gestures), mount-deck.ts (the row, Escape) and mount-layout.ts (the classes) are the elements.
import { FULL } from '../tunables';

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
  /** The pattern name's "· n balls": dropped when the row splits. */
  readonly showBalls: boolean;
  /** The ← → caps and the keys at the right: a keyboard's. */
  readonly keyCaps: boolean;
}

export function rowLayout(width: number, coarse: boolean): RowLayout {
  const rows = width < FULL.twoRowsBelowPx ? 2 : 1;
  return { rows, showBalls: rows === 1, keyCaps: !coarse };
}

/** Whether a key leaves full view: Escape, once no wheel or sheet is open to take it first. */
export const leaveKey = (key: string, wheelOpen: boolean, sheetOpen: boolean): boolean => key === 'Escape' && !wheelOpen && !sheetOpen;

/** What tapping the pattern name in full view does once full view is off (ruling 2.3, reversed 2026-11-08). */
export type NameTap = 'focus-list' | 'grow-card' | 'open-wheel';

/**
 * The name is the pattern button's twin, so it does what that button does where it shows: docked
 * (the wide layout) it shows the Patterns list and takes focus to it; upright (the phone) the card
 * is always there, so it grows; on a phone on its side the wheel opens.
 */
export const nameTap = (docked: boolean, upright: boolean): NameTap => (docked ? 'focus-list' : upright ? 'grow-card' : 'open-wheel');
