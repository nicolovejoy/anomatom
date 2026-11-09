// True fullscreen with full view (docs/plans/v6-9-full-view.md, ruling 7), headless: which browser
// method to call, and when leaving one leaves the other. Pure: no DOM, no timers.
// mount-juggler.ts holds the listeners and makes the calls.

/** The standard method name first, then Safari's prefixed one (iPad). */
export const REQUEST_METHODS = ['requestFullscreen', 'webkitRequestFullscreen'] as const;
export const EXIT_METHODS = ['exitFullscreen', 'webkitExitFullscreen'] as const;
export const ELEMENT_PROPS = ['fullscreenElement', 'webkitFullscreenElement'] as const;

/** The first of `names` that `host` has as a function, or null (iPhone Safari has none). */
export function firstMethod(host: object, names: readonly string[]): string | null {
  const h = host as Record<string, unknown>;
  return names.find((n) => typeof h[n] === 'function') ?? null;
}

/** The fullscreen element the browser reports, standard property first; null when there is none. */
export function fullscreenElementOf<T>(host: Record<string, unknown>, props: readonly string[]): T | null {
  for (const p of props) if (host[p]) return host[p] as T;
  return null;
}

/**
 * Whether we asked for fullscreen and where it stands: 'pending' from the ⤢ click until the browser
 * answers with a fullscreenchange, 'engaged' once fullscreen is on, 'idle' otherwise (also when the
 * fullscreen on is not ours: a drag that entered full view never asks).
 */
export type Ask = 'idle' | 'pending' | 'engaged';

/** Whether full view going from `previous` to `full` leaves fullscreen too: it went off while fullscreen is on. */
export const leavesFullscreen = (full: boolean, previous: boolean, fullscreenOn: boolean): boolean => previous && !full && fullscreenOn;

/** A refused request: nothing is pending any more, and no fullscreenchange will say so. */
export const refused = (ask: Ask): Ask => (ask === 'pending' ? 'idle' : ask);

/** What a fullscreenchange asks of the page. */
export interface Change {
  readonly ask: Ask;
  /** Leave fullscreen: it engaged after full view had already gone off (⤢ then ⤡ before it landed). */
  readonly exit: boolean;
  /** Leave full view: the browser's own exit (Esc, Safari's) while full view is on. */
  readonly leaveFullView: boolean;
}

/**
 * Fullscreen is `on` after a fullscreenchange, with full view `full`. While a request is pending a
 * change with nothing on is an earlier exit arriving late, not the reader leaving, so it is ignored.
 */
export function onFullscreenChange(ask: Ask, full: boolean, on: boolean): Change {
  if (on) {
    if (ask === 'pending' && !full) return { ask: 'idle', exit: true, leaveFullView: false };
    return { ask: ask === 'pending' ? 'engaged' : ask, exit: false, leaveFullView: false };
  }
  if (ask === 'pending') return { ask, exit: false, leaveFullView: false };
  return { ask: 'idle', exit: false, leaveFullView: full };
}
