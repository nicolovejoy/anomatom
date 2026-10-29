/**
 * The Euclidean rhythm E(hits, pulses) by Bjorklund's algorithm (Toussaint 2005): `hits` onsets
 * spread as evenly as `pulses` allow. The necklace starts on a hit; rotate it for other phases.
 * E(3,8) is the tresillo `x..x..x.`, E(7,12) the bell `x.xx.x.xx.x.`.
 */
export function euclid(hits: number, pulses: number): boolean[] {
  const h = Math.max(0, Math.min(hits, pulses));
  let a: boolean[][] = Array.from({ length: h }, () => [true]);
  let b: boolean[][] = Array.from({ length: pulses - h }, () => [false]);
  while (b.length > 1 && a.length > 0) {
    const n = Math.min(a.length, b.length);
    const paired = a.slice(0, n).map((x, i) => [...x, ...(b[i] as boolean[])]);
    const rest = a.length > n ? a.slice(n) : b.slice(n);
    a = paired;
    b = rest;
  }
  return [...a, ...b].flat();
}

/** `xs` rotated left by `by` (any integer): element `by` comes first. */
export function rotate<T>(xs: readonly T[], by: number): T[] {
  const n = xs.length;
  return xs.map((_, i) => xs[(((i + by) % n) + n) % n] as T);
}
