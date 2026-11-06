// Fixtures for the juggler's line-placement regression (v6.8 R1): a few pictures, each sampled at
// a few moments, whose frames were recorded from the code before the world frame (z) existed,
// in `src/view/juggler-line.golden.json`.
import { buildSchedule, flightsOf } from '../core';
import type { Parts, Schedule } from '../core';
import type { FlightLookup } from '../view/juggler';
import type { Segment } from '../view/types';
import { lineParts, scheduleOf, vanillaParts } from './schedules';

export interface LineFixture {
  readonly name: string;
  readonly segments: readonly Segment[];
  readonly times: readonly number[];
  readonly lookup?: FlightLookup;
}

const LEN = 0.25;
const single = (schedule: Schedule): Segment => ({ schedule, startTime: 0, pulseLen: LEN, endTime: null, carry: new Map() });
const manual = (phase: number, throws: [number, number][]) => ({
  spacing: 2,
  phase,
  unit: 1,
  flights: { kind: 'manual' as const, throws: throws.map(([height, to]) => ({ height, to })) },
});
/** Four hands, two cascades, every other left-hand throw passed to the other figure. */
const FOUR: Parts = [manual(0, [[3, 1], [3, 3]]), manual(1, [[3, 0], [3, 0]]), manual(0, [[3, 3], [3, 1]]), manual(1, [[3, 2], [3, 2]])];

const samples = (from: number, to: number, n: number) => Array.from({ length: n }, (_, k) => from + ((to - from) * k) / (n - 1));

export function lineFixtures(): LineFixture[] {
  const two = scheduleOf('3');
  const four = buildSchedule(FOUR);
  const B = two.cycle * 4;
  const faultParts = vanillaParts('432');
  const fault = buildSchedule(faultParts);
  const faultFlights = flightsOf(faultParts);
  return [
    { name: '531', segments: [single(scheduleOf('531'))], times: samples(0, 4.1, 7) },
    { name: 'four parts passing', segments: [single(four)], times: samples(0, 5.3, 7) },
    { name: 'three parts round a ring', segments: [single(buildSchedule(lineParts(['1x2', '1x3', '1x1'], { a: 1, b: 1 })))], times: samples(0, 3.9, 7) },
    {
      name: 'a switch from two parts to four',
      segments: [
        { schedule: two, startTime: 0, pulseLen: LEN, endTime: B * LEN, carry: new Map() },
        { schedule: four, startTime: B * LEN, pulseLen: LEN, endTime: null, carry: new Map() },
      ],
      times: samples(B * LEN - 1, B * LEN + 1.5, 9),
    },
    { name: '432, faulted', segments: [single(fault)], times: [0.5, 1.7], lookup: (s) => (s === fault ? faultFlights : undefined) },
  ];
}
