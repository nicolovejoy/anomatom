// Every tunable lives here. Nothing else holds a magic number.
// One section per stream of docs/plans/v1-parallel.md; each stream edits only its own section.
import type { Mapping, PadChord, Sample } from './sound/mapping';

// ---------------------------------------------------------------------------------------------
// Wave 0: shell
// ---------------------------------------------------------------------------------------------

/** Largest value on either side of the hand ratio (SPEC §4.1, up to 9:8). */
export const MAX_RATIO = 9;
/** Longest siteswap period accepted per hand. */
export const MAX_PERIOD = 16;

/** Tempo of hand 1's beats. */
export const DEFAULT_BPM = 120;
export const BPM_RANGE = { min: 40, max: 240 } as const;

/** Master volume when the page opens, 0 to 1. */
export const DEFAULT_VOLUME = 1;

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

/** Stable colours by ball, shared by the ladder and the juggler; repeats past the end. */
export const BALL_COLOURS: readonly string[] = [
  '#e6553a',
  '#3a7be6',
  '#f0c33c',
  '#4fb477',
  '#b05ce6',
  '#e67e3a',
  '#3ac0e6',
  '#e63a9a',
  '#8fb43a',
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
  background: '#14161a',
  lane: '#2a2e36',
  tick: '#4a505c',
  tickCoincident: '#c8ccd4',
  cycleLine: '#5a6070',
  playhead: '#ffffff',
  /** Pulses per screen width is fixed; bars shorter than this many pixels are still drawn. */
  minBarPx: 2,
} as const;

// ---------------------------------------------------------------------------------------------
// A: Juggler
// ---------------------------------------------------------------------------------------------

/**
 * The juggler (SPEC §4.1), in metres and seconds: front view, hand 1 on the left. The canvas
 * scales the scene to fit its region, so only the proportions show.
 */
export const JUGGLER = {
  /** Each hand's outer point, where it catches, and inner point, where it throws. */
  catchX: [0, 0.9],
  throwX: [0.25, 0.65],
  /** Gravity: a ball's apex is g·air²/8 (MATH §7). */
  g: 9.81,
  /** Time in the catching hand, in that hand's beats, at most this share of the flight. */
  dwellBeats: 0.5,
  maxDwellShare: 0.5,
  radius: 0.035,
  /** Balls are never drawn smaller than this, however tall the pattern makes the scene. */
  minRadiusPx: 6,
  /** The scoop dips at most this far below the hands, and at most this share of the apex. */
  scoopDepth: 0.08,
  scoopApexShare: 0.5,
  /** A cross landing on a coincident pulse flashes from its catch until this many pulses after. */
  flashPulses: 1,
  /** Seconds over which the scale follows a pattern switch. */
  boundsEaseSeconds: 0.75,
  /** The region's height on the page. */
  heightPx: 260,
  background: '#14161a',
  /** The flash: a ring this many radii out, in this colour, as wide as `flashRingPx`. */
  flashRing: '#ffffff',
  flashRingRadii: 1.6,
  flashRingPx: 3,
} as const;

// ---------------------------------------------------------------------------------------------
// B: Player and fixes
// ---------------------------------------------------------------------------------------------

/**
 * Fix suggestions for an invalid pattern (SPEC §4.2). `count`: how many are offered. `budget`:
 * the most work per call, in pulses: a candidate with a whole ball count costs its cycle length
 * (validating it walks the cycle), a fractional one its digit count. Past it, fewer fixes are
 * offered. The real cost of a pulse is the flights in it (1/a + 1/b per pulse), so a pulse at
 * 3:2 or 2:1 costs more than one at 9:8; 300,000 keeps the worst typeable inputs (long hands
 * with crosses and no near fix) to about 25-30 ms in Node across ratios. Still too long for
 * every keystroke: the caller should debounce it or run it off the keystroke.
 */
export const FIXES = { count: 3, budget: 300_000 } as const;

// ---------------------------------------------------------------------------------------------
// C: Mapping and sound
// ---------------------------------------------------------------------------------------------

/** Every sample of smplr's TR-808 (its dm.json groups), for the sound panel's dropdowns and for validating a shared link. */
export const KIT_SAMPLES: readonly string[] = [
  'clap',
  'clave',
  'conga-hi',
  'conga-low',
  'conga-mid',
  'cowbell',
  'cymbal',
  'hihat-close',
  'hihat-open',
  'kick',
  'maraca',
  'mid-tom',
  'rimshot',
  'snare',
  'tom-hi',
  'tom-low',
];

/** The panel's ranges (SPEC §4.3). */
export const PAN_RANGE = { min: -1, max: 1 } as const;
export const GAIN_RANGE = { min: 0, max: 1 } as const;
export const CROSS_BOOST_RANGE = { min: 0, max: 40 } as const;

/**
 * Crossings to filter (MATH §5, SPEC §6). The low-pass cutoff runs from `low` at no crossings to
 * `high` at FILTER_FULL_CROSSINGS or more, on a log scale (pitch is heard in octaves, so a
 * linear Hz ramp would seem to do nothing until the top). Monotone: more crossings, brighter.
 */
export const FILTER_FULL_CROSSINGS = 12;
/** Cutoff when the filter is off: above hearing, so the filter is transparent. */
export const FILTER_OPEN_HZ = 20000;
/** The range the panel offers, and the default range when the filter is switched on. */
export const FILTER_HZ_RANGE = { min: 100, max: 20000 } as const;
export const DEFAULT_FILTER_HZ = { low: 400, high: 12000 } as const;
/** Time constant, seconds, of the ramp to a new master volume or cutoff, so a knob never clicks. */
export const PARAM_SMOOTH_SECONDS = 0.02;

/** Downbeat pad: MIDI-style velocity, and how long a hit lasts when the caller gives no cycle length. */
export const PAD_VELOCITY = 70;
export const PAD_HOLD_PULSES = 8;
/** smplr volume (0-127) of the pad: under the drums. */
export const PAD_VOLUME = 70;
/** smplr instrument names behind each pad choice. */
export const PAD_INSTRUMENTS = { mellotron: 'MKII VIOLINS', soundfont: 'pad_2_warm' } as const;
/** Chord notes, low to high. */
export const PAD_CHORDS: Readonly<Record<PadChord, readonly string[]>> = {
  Dm9: ['D3', 'F3', 'A3', 'C4', 'E4'],
  Am7: ['A2', 'C3', 'E3', 'G3'],
  Cmaj7: ['C3', 'E3', 'G3', 'B3'],
  F69: ['F3', 'A3', 'C4', 'D4', 'G4'],
  open5: ['D3', 'A3', 'D4'],
};

/** Sounds by ball for the ball-to-pitch preset, low to high; ball n plays entry n mod length. */
const BALL_PITCH: readonly string[] = [
  'kick',
  'tom-low',
  'conga-low',
  'mid-tom',
  'conga-mid',
  'tom-hi',
  'conga-hi',
  'rimshot',
  'clave',
];

function heights(names: readonly Sample[]): Record<number, Sample> {
  return Object.fromEntries(names.map((n, i) => [i + 1, n]));
}

/** SPEC §6: the v1 mapping. Sample names are smplr's TR-808 groups. */
const HEIGHT_DRUM: Mapping = {
  kit: 'TR-808',
  perHeight: heights(['hihat-close', 'hihat-close', 'snare', 'tom-low', 'kick', 'kick', 'kick', 'kick', 'kick']),
  byBall: null,
  hands: [
    { pan: -0.6, gain: 1 },
    { pan: 0.6, gain: 1 },
  ],
  catches: { on: false, sample: 'rimshot' },
  crossAccent: { velocity: 20, downbeat: 'clap' },
  filter: { on: false, ...DEFAULT_FILTER_HZ },
  pad: { on: false, instrument: 'mellotron', chord: 'Dm9' },
};

/** Height to pitch: the higher the throw, the lower the sound, nine distinct steps. */
const HEIGHT_PITCH: Mapping = {
  ...HEIGHT_DRUM,
  perHeight: heights(['rimshot', 'clave', 'conga-hi', 'tom-hi', 'conga-mid', 'mid-tom', 'conga-low', 'tom-low', 'kick']),
};

/** Ball to pitch: each ball keeps one sound whatever its height, so height picks nothing. */
const BALL_TO_PITCH: Mapping = {
  ...HEIGHT_DRUM,
  perHeight: heights(Array<Sample>(9).fill('conga-mid')),
  byBall: BALL_PITCH,
};

export const PRESET_MAPPINGS = {
  'height-drum': HEIGHT_DRUM,
  'height-pitch': HEIGHT_PITCH,
  'ball-pitch': BALL_TO_PITCH,
} as const;

export const DEFAULT_MAPPING: Mapping = HEIGHT_DRUM;

// ---------------------------------------------------------------------------------------------
// D: About
// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------
// E: Knobs
// ---------------------------------------------------------------------------------------------

/** The knob panel and the fix state (SPEC §4.1, §4.2). */
export const KNOBS = {
  /**
   * Fix suggestions can take tens of ms on a long pattern, so they are worked out this long
   * after the last keystroke, never on each one; a result for text since changed is dropped.
   */
  fixDebounceMs: 150,
  /** At this width or narrower the panel folds under a button; the juggler and ladder stay. */
  phoneMaxWidthPx: 600,
  /** The warning colour: colliding digits, their flights on the ladder, the invalid indicator. */
  warning: '#ff6b4a',
  /** The valid indicator and the chosen swap sites. */
  ok: '#4fb477',
  selected: '#3a7be6',
  /** Volume slider step, 0 to 1. */
  volumeStep: 0.01,
  /** Positions on the scrub slider across one cycle. */
  scrubSteps: 1000,
} as const;

/** The broken pattern's strip (SPEC §4.2), and the accent mark at coincident cross landings (SPEC §7.3). */
export const LADDER_E = {
  /** Bars of the broken pattern drawn above the playing one, greyed; colliding ones keep the warning colour. */
  greyBar: '#596070',
  /** The accent: a triangle on the catching hand's lane, pointing into the strip. */
  accent: '#ffffff',
  accentPx: 7,
} as const;

// ---------------------------------------------------------------------------------------------
// F: Sound panel and share
// ---------------------------------------------------------------------------------------------

/** The sound panel's controls (SPEC §4.3): slider steps, and how long "I copied the link" stays up. */
export const SOUND_PANEL = {
  panStep: 0.05,
  gainStep: 0.01,
  accentStep: 1,
  hzStep: 50,
  confirmMs: 3000,
  /** Sounds the cross-landing dropdown offers (SPEC §4.3). */
  downbeatChoices: ['clap', 'cowbell', null] as readonly (string | null)[],
} as const;

/** The share link (SPEC §4.3). The hash follows the store this long after the last change, so a drag is one history-free write. */
export const SHARE = { hashDebounceMs: 250 } as const;

// ---------------------------------------------------------------------------------------------
// Phone sheet, stream B: first minute (docs/plans/phone-sheet.md)
// ---------------------------------------------------------------------------------------------

/**
 * The cards on the first screen, in order. `name` indexes `copy.firstMinute.names`. Hand 2's
 * text matters only at other ratios than 1:1, so single-hand cards carry the default for it.
 * The wide card (the last) spans both columns and shows its ratio badge.
 */
export const FIRST_MINUTE_PRESETS: readonly {
  readonly id: string;
  readonly patterns: readonly [string, string];
  readonly ratio: { readonly a: number; readonly b: number };
  readonly wide: boolean;
}[] = [
  { id: 'cascade', patterns: ['3', DEFAULT_PATTERN_HAND2], ratio: { a: 1, b: 1 }, wide: false },
  { id: 'pause', patterns: ['441', DEFAULT_PATTERN_HAND2], ratio: { a: 1, b: 1 }, wide: false },
  { id: 'classic', patterns: ['531', DEFAULT_PATTERN_HAND2], ratio: { a: 1, b: 1 }, wide: false },
  { id: 'ramp', patterns: ['97531', DEFAULT_PATTERN_HAND2], ratio: { a: 1, b: 1 }, wide: false },
  { id: 'polyrhythm', patterns: ['2 2x 2', '2x 2'], ratio: { a: 3, b: 2 }, wide: true },
];
