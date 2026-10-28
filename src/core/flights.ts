import { cycleLength, isVanilla, makeGrids } from './grid';
import type { Flight, Hand, HandPattern, PatternInput } from './types';

const other = (h: Hand): Hand => (h === 0 ? 1 : 0);

/**
 * Every throw of one cycle, placed on the pulse grid. This is the one place notation becomes
 * pulses. Height-0 throws are included as zero-length flights landing on their own beat, which
 * keeps the landing set a permutation of the beat set (MATH.md §2).
 */
export function flightsOf(input: PatternInput): Flight[] {
  const cycle = cycleLength(input);
  if (isVanilla(input.ratio)) return vanillaFlights(input.hands[0] as HandPattern, cycle);
  const grids = makeGrids(input.ratio);
  const flights: Flight[] = [];
  input.hands.forEach((hand, h) => {
    const from = h as Hand;
    const { pulsesPerBeat } = grids[from];
    for (let beat = 0; beat * pulsesPerBeat < cycle; beat++) {
      const index = beat % hand.length;
      const { height, cross } = hand[index] as HandPattern[number];
      const launch = beat * pulsesPerBeat;
      flights.push({
        id: { hand: from, index },
        from,
        to: cross ? other(from) : from,
        beat,
        height,
        cross,
        launch,
        land: launch + height * pulsesPerBeat,
      });
    }
  });
  return flights.sort((p, q) => p.launch - q.launch || p.from - q.from);
}

function vanillaFlights(pattern: HandPattern, cycle: number): Flight[] {
  const flights: Flight[] = [];
  for (let beat = 0; beat < cycle; beat++) {
    const index = beat % pattern.length;
    const { height } = pattern[index] as HandPattern[number];
    const from = (beat % 2) as Hand;
    const cross = height % 2 === 1;
    flights.push({
      // One input sequence at 1:1, so every throw id names hand 0.
      id: { hand: 0, index },
      from,
      to: cross ? other(from) : from,
      beat,
      height,
      cross,
      launch: beat,
      land: beat + height,
    });
  }
  return flights;
}
