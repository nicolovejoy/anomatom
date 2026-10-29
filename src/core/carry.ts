import type { Hand, Schedule } from './types';

/**
 * Ball identity across a switch (docs/plans/v1-parallel.md, "Carry-over rule"). `boundary` is
 * the switch pulse B in the old segment's own count; the new segment's pulse 0 is there.
 *
 * The crossing flights are the old flights with launch < B ≤ land, including one landing exactly
 * at B; only launches at or after the old segment's pulse 0 happened. A crossing flight landing
 * at (B + p, hand) continues the new ball whose first throw is at (p, hand). Each new ball has
 * one first throw and each (pulse, hand) at most one throw, so the map, new ball id → old ball
 * id, is one-to-one. Old and new balls with no partner are simply absent.
 */
export function carryOver(old: Schedule, next: Schedule, boundary: number): Map<number, number> {
  // Events are sorted by pulse, so a ball's first throw is the first one met.
  const firstThrow = new Map<string, number>();
  const met = new Set<number>();
  for (const e of next.events) {
    if (e.kind !== 'throw' || met.has(e.ball)) continue;
    met.add(e.ball);
    firstThrow.set(key(e.pulse, e.hand), e.ball);
  }

  const carry = new Map<number, number>();
  for (const e of old.events) {
    if (e.kind !== 'throw') continue;
    const to: Hand = e.cross ? (e.hand === 0 ? 1 : 0) : e.hand;
    // Repetitions launched in [B − flight, B), and never before pulse 0.
    const k = Math.max(0, Math.ceil((boundary - e.flight - e.pulse) / old.period));
    for (let launch = e.pulse + k * old.period; launch < boundary; launch += old.period) {
      const ball = firstThrow.get(key(launch + e.flight - boundary, to));
      if (ball !== undefined) carry.set(ball, e.ball);
    }
  }
  return carry;
}

const key = (pulse: number, hand: Hand) => `${pulse}:${hand}`;
