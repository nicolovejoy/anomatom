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

/** Whether a click on ⤢ asks for fullscreen: entering, from a click only (a drag has no user activation). */
export const asksFullscreen = (fromClick: boolean, entering: boolean): boolean => fromClick && entering;

/** Whether full view going from `previous` to `full` leaves fullscreen too: it went off while fullscreen is on. */
export const leavesFullscreen = (full: boolean, previous: boolean, fullscreenOn: boolean): boolean => previous && !full && fullscreenOn;

/** Whether a fullscreenchange leaves full view: the browser's own exit (Esc, Safari's) while full view is on. */
export const leavesFullView = (full: boolean, fullscreenOn: boolean): boolean => full && !fullscreenOn;
