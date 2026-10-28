// Every tunable lives here. Nothing else holds a magic number.
import type { Mapping } from './sound/mapping';

/** Largest value on either side of the hand ratio (SPEC §4.1, up to 9:8). */
export const MAX_RATIO = 9;
/** Longest siteswap period accepted per hand. */
export const MAX_PERIOD = 16;

/** Tempo of hand 1's beats. */
export const DEFAULT_BPM = 120;
export const BPM_RANGE = { min: 40, max: 240 } as const;

/** How far ahead of the audio clock events are handed to the sampler, and how often. */
export const LOOKAHEAD_SECONDS = 0.1;
export const SCHEDULER_INTERVAL_MS = 25;
/** Delay between pressing play and the first pulse, so the first window has room. */
export const START_DELAY_SECONDS = 0.05;

/** MIDI-style velocity of an unaccented throw. */
export const BASE_VELOCITY = 100;

/** SPEC §6: the v1 mapping. Sample names are smplr's TR-808 groups. */
export const DEFAULT_MAPPING: Mapping = {
  kit: 'TR-808',
  perHeight: {
    1: 'hihat-close',
    2: 'hihat-close',
    3: 'snare',
    4: 'tom-low',
    5: 'kick',
    6: 'kick',
    7: 'kick',
    8: 'kick',
    9: 'kick',
  },
  hands: [
    { pan: -0.6, gain: 1 },
    { pan: 0.6, gain: 1 },
  ],
  catches: { on: false, sample: 'rimshot' },
  crossAccent: { velocity: 20, downbeat: 'clap' },
};
