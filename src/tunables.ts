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
export const DEFAULT_BPM = 104;
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

/**
 * One colour per part (hand), repeating past the end: the lanes UI's dot for a part, and, with
 * three or more parts, its ladder lane line and its hand bar in the juggler. Two parts draw as
 * they always have (grey lanes and hands; the bars carry the ball colours), so a two-part picture
 * never changes. Kept apart from BALL_COLOURS' strongest hues, so a lane never reads as a ball.
 */
export const PART_COLOURS: readonly string[] = ['#8c96ff', '#ff8fb1', '#62d2b4', '#f2b872', '#c5a3ff', '#9fd36a', '#7fc8f5', '#e8a0a0'];

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
  /** The page ground (--ground in style.css). */
  background: '#0e1013',
  lane: '#2a2e36',
  tick: '#4a505c',
  tickCoincident: '#c8ccd4',
  cycleLine: '#5a6070',
  playhead: '#ffffff',
  /** Pulses per screen width is fixed; bars shorter than this many pixels are still drawn. */
  minBarPx: 2,
  /** Three or more parts: each lane's line in its part colour, this wide (two parts keep the grey 1 px line). */
  partLanePx: 2,
} as const;

// ---------------------------------------------------------------------------------------------
// A: Juggler
// ---------------------------------------------------------------------------------------------

/**
 * SPEC §4.1 (v2): a flight longer than this from throw to catch, in seconds at the current
 * tempo, is "not a human throw": drawn dimmed on the juggler and the ladder, and labelled.
 * Presentation only; juggleability never depends on tempo.
 */
export const HUMAN_AIRTIME_SECONDS = 3;

/**
 * The juggler (SPEC §4.1), in metres and seconds: front view, hand 1 on the left. The canvas
 * scales the scene to fit its region, so only the proportions show.
 */
export const JUGGLER = {
  /** Each hand's outer point, where it catches, and inner point, where it throws: one figure, hands 1 and 2. */
  catchX: [0, 0.9],
  throwX: [0.25, 0.65],
  /**
   * Parts pair into figures (lanes ruling 4): parts 1 and 2 are the first figure, 3 and 4 the
   * second, side by side this far apart, left edge to left edge; an odd last part is a one-handed
   * figure. A flight between figures is a pass across.
   */
  figureStride: 1.9,
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
  /** The region's least height on a wide screen; on a phone it fills what the sheet leaves. */
  heightPx: 260,
  /** The page ground (--ground in style.css): the juggler stands on the page, not in a box. */
  background: '#0e1013',
  /** The hands: a bar under each hand's catch-to-throw span (board 2a), this tall, this far under a held ball. */
  hand: '#3a404b',
  handBarPx: 9,
  /** A hand bar is never wider than this, centred on its hand's span. */
  handMaxPx: 64,
  handGapPx: 4,
  /**
   * Three or more parts: each figure is named under its hand bars ("Juggler 1"), in its first
   * part's colour, this tall (px), this far under the bars. On a short region the gap shrinks
   * (never the font) so the caption stays whole: the scene keeps at least `captionSceneShare`
   * of the canvas height.
   */
  captionFontPx: 12,
  /** The UI's stack (--font-ui in style.css). */
  captionFont: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  captionGapPx: 6,
  captionSceneShare: 0.6,
  /** The flash: a ring this many radii out, in this colour, as wide as `flashRingPx`. */
  flashRing: '#ffffff',
  flashRingRadii: 1.6,
  flashRingPx: 3,
  /**
   * The juggler's axes (SPEC §4.1 v2, `sceneScale`): up to an apex this tall, in metres, one
   * scale serves both axes, fitted to a scene this tall, so the hands keep one height; a taller
   * apex squeezes only the height so it stays on the canvas. 531 at 120 bpm peaks under it.
   */
  uniformTopMetres: 1.5,
  /** A flight over HUMAN_AIRTIME_SECONDS: its ball drawn at this opacity. */
  inhumanAlpha: 0.4,
  /** A faulted group's flights (design §6): arcs in the warning colour (--warn), this wide, meeting at a ring on the landing. */
  fault: '#ff9f43',
  faultLinePx: 2.5,
  faultRingPx: 7,
  /** A faulted flight that is also over HUMAN_AIRTIME_SECONDS: dashed, these lengths. */
  inhumanDashPx: [6, 6],
  humanAirtimeSeconds: HUMAN_AIRTIME_SECONDS,
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
// Model A: core model (docs/plans/model-waves.md)
// ---------------------------------------------------------------------------------------------

/**
 * The finest lattice refinement `withPhase` will make for a phase between pulses (design §4):
 * a phase of p/q pulses refines the lattice q times, for q up to this. A finer phase is refused
 * and the parts come back unchanged.
 */
export const MAX_PHASE_REFINEMENT = 64;

// ---------------------------------------------------------------------------------------------
// Model B: app model, actions and hash (docs/plans/model-waves.md)
// ---------------------------------------------------------------------------------------------

/**
 * Most parts one input writes with `/` (form 2, `a / b` at 1:1). With more lanes than this the
 * editor has one input per lane instead (docs/plans/lanes.md ruling 3), up to MAX_LANES.
 */
export const MAX_EDITOR_PARTS = 2;
/** Most parts a share link may carry; a link with more falls back to the default pattern. */
export const MAX_PARTS = 8;
/** Longest cycle, in pulses, a share link may ask for; a longer one falls back to the default pattern. */
export const MAX_LINK_CYCLE = 4096;
/** Most jugglers a passing siteswap (`<3p 3|3p 3>`, form 4) may write; juggler j is parts 2j and 2j + 1. */
export const MAX_JUGGLERS = 3;

// ---------------------------------------------------------------------------------------------
// Lanes: the Rhythm tab as a mixer (docs/plans/lanes.md)
// ---------------------------------------------------------------------------------------------

/**
 * Most lanes (parts) on screen and in the editor; "Add a hand" stops here. A link may still
 * carry up to MAX_PARTS, of which the first MAX_LANES are shown.
 */
export const MAX_LANES = 4;
/** The rate stepper's top: a lane plays at most this many beats while a lane of rate 1 plays one. As high as a ratio's side. */
export const MAX_RATE = MAX_RATIO;
/** The Rhythm tab's lanes on screen (docs/plans/lanes.md, stream B). */
export const LANES_UI = {
  /** Step cells per row on a phone: a longer period wraps to a second row. A wide column holds the whole period in one row. */
  phoneColumns: 8,
  /** The fewest step cells to a row: a shorter period's cells stretch to fill this many columns' width. */
  minColumns: 4,
  /** A lane's colour dot shows from this many lanes, as the ladder and the juggler tint parts only at three or more. */
  dotsFromLanes: 3,
} as const;

// ---------------------------------------------------------------------------------------------
// C: Mapping and sound
// ---------------------------------------------------------------------------------------------

/**
 * Every sample of smplr's TR-808 (its dm.json groups), for the sound panel's dropdowns and for validating a
 * shared link. These are roles: another kit plays each on its own sample (KIT_ROLES).
 */
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

/**
 * The kits a part may name, by smplr's DrumMachine instrument id; the hash accepts only these, and the
 * Kit select lists them in this order. Licences: docs/plans/v2-share-kits-passing.md, ruling 7.
 */
export const KIT_IDS: readonly string[] = ['TR-808', 'Casio-RZ1', 'LM-2', 'MFB-512', 'Roland CR-8000'];

/**
 * Samples are roles (docs/plans/v2-share-kits-passing.md, ruling 1). The Mapping names sounds in the
 * TR-808's vocabulary (KIT_SAMPLES); each kit plays a role on its own sample, named as in its dm.json
 * (smplr accepts a full sample name as a note). A role the kit lacks borrows the nearest sound, marked
 * "borrowed". Every kit has every role (unit tested).
 */
export const KIT_ROLES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // The vocabulary itself: every role is a TR-808 group (smplr plays a group's first variation).
  'TR-808': Object.fromEntries(KIT_SAMPLES.map((s) => [s, s])),
  // Twelve sounds. Toms 1-3 run high to low (measured: about 140, 118 and 92 Hz).
  'Casio-RZ1': {
    clap: 'clap',
    clave: 'clave',
    'conga-hi': 'tom-1', // borrowed: no congas
    'conga-low': 'tom-3', // borrowed
    'conga-mid': 'tom-2', // borrowed
    cowbell: 'cowbell',
    cymbal: 'crash',
    'hihat-close': 'hihat-closed',
    'hihat-open': 'hihat-open',
    kick: 'kick',
    maraca: 'hihat-closed', // borrowed: the nearest short noise
    'mid-tom': 'tom-2',
    rimshot: 'clave', // borrowed: the nearest short click
    snare: 'snare',
    'tom-hi': 'tom-1',
    'tom-low': 'tom-3',
  },
  // Twenty-nine sounds; the middle of each family where it has several.
  'LM-2': {
    clap: 'clap',
    clave: 'stick-h', // borrowed: no clave; the high side stick
    'conga-hi': 'conga-h',
    'conga-low': 'conga-l',
    'conga-mid': 'conga-m',
    cowbell: 'cowbell',
    cymbal: 'crash',
    'hihat-close': 'hhclosed',
    'hihat-open': 'hhopen',
    kick: 'kick',
    maraca: 'cabasa', // borrowed: the shaker it has
    'mid-tom': 'tom-m',
    rimshot: 'stick-m', // borrowed: a side stick
    snare: 'snare-m',
    'tom-hi': 'tom-h',
    'tom-low': 'tom-l',
  },
  // Nine sounds: no congas, clave, rimshot, maraca or cowbell. Roles that share a sample choke each
  // other (smplr cuts a sample's last hit when it plays again), so clave, maraca and the closed hat
  // each get their own where the kit allows.
  'MFB-512': {
    clap: 'clap',
    clave: 'tom-hi', // borrowed: the nearest short pitched hit; shares the high tom's sample
    'conga-hi': 'tom-hi', // borrowed
    'conga-low': 'tom-low', // borrowed
    'conga-mid': 'tom-mid', // borrowed
    cowbell: 'hihat-closed', // borrowed: short metal, as a cowbell is; shares the closed hat's sample
    cymbal: 'cymbal',
    'hihat-close': 'hihat-closed',
    'hihat-open': 'hihat-open',
    kick: 'kick',
    maraca: 'clap', // borrowed: a short noise burst; shares the clap's sample
    'mid-tom': 'tom-mid',
    rimshot: 'snare', // borrowed: a rimshot is a snare stroke
    snare: 'snare',
    'tom-hi': 'tom-hi',
    'tom-low': 'tom-low',
  },
  // Thirteen sounds: two congas and two toms, no mid of either, no maraca.
  'Roland CR-8000': {
    clap: 'clap',
    clave: 'clave',
    'conga-hi': 'conga-high',
    'conga-low': 'conga-low',
    'conga-mid': 'conga-high', // borrowed: no mid conga
    cowbell: 'cowbell',
    cymbal: 'cymball', // sic: the file's name
    'hihat-close': 'hihat-closed',
    'hihat-open': 'hihat-open',
    kick: 'kick',
    maraca: 'hihat-closed', // borrowed: the nearest short noise
    'mid-tom': 'tom-low', // borrowed: no mid tom
    rimshot: 'rimshot',
    snare: 'snare',
    'tom-hi': 'tom-high',
    'tom-low': 'tom-low',
  },
};
/** Most voices a mapping holds or a link may carry. */
export const MAX_MAPPING_PARTS = 8;

/** The panel's ranges (SPEC §4.3). */
export const PAN_RANGE = { min: -1, max: 1 } as const;
export const GAIN_RANGE = { min: 0, max: 1 } as const;
export const CROSS_BOOST_RANGE = { min: 0, max: 40 } as const;
/** The pass accent's range: the same as the cross accent's. */
export const PASS_BOOST_RANGE = CROSS_BOOST_RANGE;

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
  byHeight: true,
  perHeight: heights(['hihat-close', 'hihat-close', 'snare', 'tom-low', 'kick', 'kick', 'kick', 'kick', 'kick']),
  byBall: null,
  parts: [
    { kit: 'TR-808', sample: 'kick', pan: -0.6, gain: 1 },
    { kit: 'TR-808', sample: 'snare', pan: 0.6, gain: 1 },
  ],
  catches: { on: false, sample: 'rimshot' },
  crossAccent: { velocity: 20, downbeat: 'clap' },
  pass: { velocity: 20, sample: null },
  filter: { on: false, ...DEFAULT_FILTER_HZ },
  pad: { on: false, instrument: 'mellotron', chord: 'Dm9' },
};

/** Voice per part (design §7): each part keeps its own drum, low then high, and flight length picks nothing. */
const VOICE_PER_PART: Mapping = { ...HEIGHT_DRUM, byHeight: false };

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

/**
 * Lanes (docs/plans/lanes.md ruling 5): the voice a new part gets, by its index, repeating after the last.
 * Kick and snare are the two parts every pattern starts with (they match HEIGHT_DRUM's); the hat and clap
 * follow. Pan spreads the voices across the field; each lap of the rotation mirrors it, so a fifth part
 * does not sit on top of the first.
 */
export const SOUND_LANES = {
  kit: 'TR-808',
  gain: 1,
  voices: [
    { sample: 'kick', pan: -0.6 },
    { sample: 'snare', pan: 0.6 },
    { sample: 'hihat-close', pan: -0.2 },
    { sample: 'clap', pan: 0.2 },
  ] as readonly { readonly sample: string; readonly pan: number }[],
};

export const PRESET_MAPPINGS = {
  'voice-per-part': VOICE_PER_PART,
  'height-drum': HEIGHT_DRUM,
  'height-pitch': HEIGHT_PITCH,
  'ball-pitch': BALL_TO_PITCH,
} as const;

// A fresh state takes voice per part (design §7); each first-minute card carries its own preset
// (src/app/presets.ts `mapping`), and an old link carries its mapping, so nothing that played changes its sound.
export const DEFAULT_MAPPING: Mapping = VOICE_PER_PART;

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
  /** The warning colour on the canvases (--warn in style.css): colliding flights on the ladder. */
  warning: '#ff9f43',
  /** The chosen swap sites. */
  selected: '#3a7be6',
  /** Volume slider step, 0 to 1. */
  volumeStep: 0.01,
  /** Positions on the scrub slider across one cycle. */
  scrubSteps: 1000,
  /** The Rhythm tab's ball stepper runs from 1 to this, per hand. */
  maxBalls: 9,
} as const;

/** The broken pattern's strip (SPEC §4.2), and the accent mark at coincident cross landings (SPEC §7.3). */
export const LADDER_E = {
  /** A faulted group's flights on the strip (no ball, design §6). */
  greyBar: '#596070',
  /** The accent: a triangle on the catching hand's lane, pointing into the strip. */
  accent: '#ffffff',
  accentPx: 7,
  /** A flight over HUMAN_AIRTIME_SECONDS: its bar at this opacity, as the juggler dims its ball. */
  inhumanAlpha: 0.4,
} as const;

/**
 * The passing card (docs/plans/v2-share-kits-passing.md, wave 2 ruling 5): height to drum grown to four
 * voices, juggler 1 (parts 0 and 1) on one kit and juggler 2 (parts 2 and 3) on another, panned apart
 * so a pass is call and response. Kit ids are KIT_IDS'.
 */
export const PASSING_CARD = {
  voices: [
    { kit: 'TR-808', pan: -0.8 },
    { kit: 'TR-808', pan: -0.4 },
    { kit: 'LM-2', pan: 0.4 },
    { kit: 'LM-2', pan: 0.8 },
  ] as readonly { readonly kit: string; readonly pan: number }[],
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
  /** Sounds the cross-landing dropdown offers (SPEC §4.3). */
  downbeatChoices: ['clap', 'cowbell', null] as readonly (string | null)[],
} as const;

/** The share link (SPEC §4.3). The hash follows the store this long after the last change, so a drag is one history-free write. */
export const SHARE = { hashDebounceMs: 250, /** How long the "Link copied" status stays. */ statusMs: 3000 } as const;

// ---------------------------------------------------------------------------------------------
// Phone sheet (docs/plans/phone-sheet.md, stream A)
// ---------------------------------------------------------------------------------------------

/** The bottom sheet on a phone and the right-hand column on a wide screen. */
export const SHEET = {
  /** At this width or wider the sheet is a column on the right, always open on a tab. */
  wideMinWidthPx: 760,
  /** The column's width on a wide screen. */
  columnPx: 400,
  /** The open sheet's height on a phone, as a share of the screen. */
  openHeightDvh: 62,
  /** The ladder strip's height on a phone, sheet closed and open; a wide screen uses LADDER.heightPx. */
  ladderPx: { closed: 112, open: 92 },
  /**
   * A phone on its side (narrower than wideMinWidthPx, at most maxHeightPx tall): the stage and
   * the sheet sit side by side, the sheet a column of columnPx, the ladder ladderPx tall.
   */
  landscape: { maxHeightPx: 480, columnPx: 360, ladderPx: 96 },
  /** A drag on the handle longer than this opens or closes the sheet; shorter is a tap. */
  dragPx: 24,
  /** A pattern this long or longer is drawn smaller in the deck's transport bar on a phone. */
  longSummaryChars: 7,
} as const;

// ---------------------------------------------------------------------------------------------
// v4 D2: top bar reset
// ---------------------------------------------------------------------------------------------

/** The wordmark's "Start over?" question withdraws itself after this long. */
export const RESET = { confirmMs: 6000 } as const;

/** The deck (docs/plans/v4-deck.md): the transport bar, the sound row and the pattern wheel. */
export const DECK = {
  /** Rows the wheel shows; the middle one sits in the band. Odd. */
  wheelRows: 7,
  /** One wheel row's height. */
  rowPx: 32,
  /** The wheel picks its row this long after the last scroll event, not on each row it passes. */
  settleMs: 160,
  /** A mouse wheel over the pattern name steps once per this much scroll (a notch is about 100). */
  notchPx: 50,
  /**
   * The wheel stays open in the column only on a wide screen at least this tall; shorter (a phone
   * on its side at 844×390) it opens over the stage as on a phone, so the sheet keeps its room.
   */
  dockedMinHeightPx: 560,
  /**
   * The open phone wheel keeps the juggler in view: under the figure when the stage has at least
   * this much height left above it, else beside it, at most sidePx wide.
   */
  minFigurePx: 200,
  sidePx: 300,
  /** The looping wheel turns its list mid-spin when the band comes this many rows from an end. */
  loopMarginRows: 2,
  /** A key's turn re-arms its settle at most this many times while its smooth scroll catches up. */
  keySettleTries: 12,
  /**
   * The transport bar's notation (docs/plans/v4-1-polish.md, ruling 2): this size, shrunk to fit
   * its space down to notationMinPx before it ellipsizes.
   */
  notationPx: 16,
  notationMinPx: 11,
  /** The volume slider's width on a phone (narrower than SHEET.wideMinWidthPx); wider screens use sliderPx. */
  phoneSliderPx: 80,
  sliderPx: 76,
} as const;
