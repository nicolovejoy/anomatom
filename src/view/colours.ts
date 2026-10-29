// One colour rule for the whole picture: the ladder and the juggler both read it. Pure.
import type { Segment } from './types';

/**
 * Each segment's colour for each of its balls (ball id → colour index), derived from the whole
 * segment list from the first segment; segments are never dropped in v1.
 *
 * A ball the switch carries keeps the colour of the ball it continues (and so, transitively, of
 * the ball it first was). A ball it does not carry takes the lowest colour that no carried ball
 * in its segment uses and that no ball of the previous segment uses: an old ball that was not
 * carried may still be landing after the boundary, and two balls on screen must never share a
 * colour. Such an index always exists below
 * `previous.size + balls` (carried colours are among the previous segment's), so colours
 * grow slowly across switches but never collide.
 */
export function ballColours(segments: readonly Segment[]): ReadonlyMap<number, number>[] {
  const out: Map<number, number>[] = [];
  segments.forEach((s, i) => {
    const previous = out[i - 1];
    const map = new Map<number, number>();
    if (previous) {
      for (let ball = 0; ball < s.schedule.balls; ball++) {
        const old = s.carry.get(ball);
        const colour = old === undefined ? undefined : previous.get(old);
        if (colour !== undefined) map.set(ball, colour);
      }
    }
    const before = new Set(previous?.values());
    const taken = new Set<number>();
    for (let ball = 0; ball < s.schedule.balls; ball++) {
      if (map.has(ball)) continue;
      // Always found below previous.size + balls: the colours ruled out number at most
      // previous.size (carried ones are among them) plus the new balls already placed.
      let next = 0;
      while (before.has(next) || taken.has(next)) next++;
      taken.add(next);
      map.set(ball, next);
    }
    out.push(map);
  });
  return out;
}
