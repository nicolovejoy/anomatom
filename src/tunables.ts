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

/** The patterns in the boxes when the page opens: a vanilla cascade, and a two-ball fountain for hand 2 at other ratios. */
export const DEFAULT_PATTERN = '3';
export const DEFAULT_PATTERN_HAND2 = '2';

/** MIDI-style velocity of an unaccented throw, and the ceiling. */
export const BASE_VELOCITY = 100;
export const MAX_VELOCITY = 127;
/** Heights above this share the top drum of the mapping. */
export const MAX_HEIGHT = 9;
/** smplr volume (0-127) of a hand at gain 1. 75 was too quiet next to a metronome (Nico, 2026-10-28). */
export const KIT_VOLUME = 100;

/** Ratio chips offered on the page (SPEC §4.1); steppers for the rest come with step 5. */
export const RATIO_CHIPS: readonly (readonly [number, number])[] = [
  [1, 1],
  [3, 2],
  [4, 3],
  [5, 4],
];

/** The ladder strip. */
export const LADDER = {
  /** Pulses visible across the strip, and where the playhead sits. */
  windowPulses: 24,
  playheadFraction: 0.3,
  heightPx: 220,
  lanePaddingPx: 18,
  barPx: 8,
  rowGapPx: 2,
  /** Cross flights are drawn as lines this fraction of the bar height. */
  crossLinePx: 5,
  /** Tick half-lengths and widths: coincident pulses, then ordinary beats. */
  tickPx: { coincident: 14, beat: 7 },
  tickWidthPx: { coincident: 2, beat: 1 },
  playheadWidthPx: 2,
  /** Stable colours by ball id; repeats past the end. */
  palette: ['#e6553a', '#3a7be6', '#f0c33c', '#4fb477', '#b05ce6', '#e67e3a', '#3ac0e6', '#e63a9a', '#8fb43a'],
  background: '#14161a',
  lane: '#2a2e36',
  tick: '#4a505c',
  tickCoincident: '#c8ccd4',
  cycleLine: '#5a6070',
  playhead: '#ffffff',
  /** Pulses per screen width is fixed; bars shorter than this many pixels are still drawn. */
  minBarPx: 2,
} as const;

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
