import type { Event, Schedule } from './types';

/** What carryOver reads of a schedule. */
export type CarrySchedule = Pick<Schedule, 'period'> & {
  readonly events: readonly Pick<Event, 'kind' | 'pulse' | 'part' | 'ball' | 'flight'>[];
};

/**
 * Ball identity across a switch (docs/plans/v1-parallel.md, "Carry-over rule"). `boundary` is
 * the switch pulse B in the old segment's own count; the new segment's pulse 0 is there.
 *
 * The crossing flights are the old flights with launch < B ≤ land, including one landing exactly
 * at B; only launches at or after the old segment's pulse 0 happened. A crossing flight landing
 * at (B + p, part) continues the new ball whose first throw is at (p, part). Each new ball has
 * one first throw and each (pulse, part) at most one throw, so the map, new ball id → old ball
 * id, is one-to-one. An old ball not yet thrown at B (first throw at q ≥ B, in part h)
 * continues the new ball first thrown at (q − B, h), if no crossing flight claimed it. Old and
 * new balls with no partner are simply absent, and so are events with no ball id (a group with
 * faults): only fault-free groups carry.
 */
export function carryOver(old: CarrySchedule, next: CarrySchedule, boundary: number): Map<number, number> {
  // Events are sorted by pulse, so a ball's first throw is the first one met.
  const firstThrow = new Map<string, number>();
  const met = new Set<number>();
  for (const e of next.events) {
    if (e.kind !== 'throw' || e.ball === null || met.has(e.ball)) continue;
    met.add(e.ball);
    firstThrow.set(key(e.pulse, e.part), e.ball);
  }

  // Where each old throw lands: its catch event, the same ball at pulse + flight.
  const catchPart = new Map<string, number>();
  for (const e of old.events) if (e.kind === 'catch' && e.ball !== null) catchPart.set(key(e.pulse, e.ball), e.part);

  const carry = new Map<number, number>();
  for (const e of old.events) {
    if (e.kind !== 'throw' || e.ball === null) continue;
    const to = catchPart.get(key(e.pulse + e.flight, e.ball)) as number;
    // Repetitions launched in [B − flight, B), and never before pulse 0.
    const k = Math.max(0, Math.ceil((boundary - e.flight - e.pulse) / old.period));
    for (let launch = e.pulse + k * old.period; launch < boundary; launch += old.period) {
      const ball = firstThrow.get(key(launch + e.flight - boundary, to));
      if (ball !== undefined) carry.set(ball, e.ball);
    }
  }

  // Balls not yet thrown at B (governor ruling 2026-10-29): an old ball whose first throw is at
  // old pulse q ≥ B waits in part h, and continues the new ball whose first throw is at
  // (q − B, h), unless a crossing flight already claimed that new ball.
  const waiting = new Set<number>();
  for (const e of old.events) {
    if (e.kind !== 'throw' || e.ball === null || waiting.has(e.ball)) continue;
    waiting.add(e.ball);
    if (e.pulse < boundary) continue;
    const ball = firstThrow.get(key(e.pulse - boundary, e.part));
    if (ball !== undefined && !carry.has(ball)) carry.set(ball, e.ball);
  }
  return carry;
}

const key = (a: number, b: number) => `${a}:${b}`;
