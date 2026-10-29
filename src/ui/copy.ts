// Every reader-facing string. Logic modules return structured values; this turns them into words.
// One section per stream of docs/plans/v1-parallel.md; each stream edits only its own section.
//
// Voice (Nico, 2026-10-29): anomatom is a polyphonic juggling robot and every string is it speaking as itself.
// 1. First person, present tense: "I have 3 balls." It explains what it can and cannot throw; it never reports an "error".
// 2. Short sentences. No exclamation marks, no joke that wears thin: the twentieth message must still read fine.
// 3. Numbers and hand names stay precise. Hand 1 is the left hand on screen, hand 2 the right.
// 4. Labels on controls stay labels: a button says "Play", not "I play".
// 5. Beats count from 1 at 1:1 and within a hand; pulses count from 0.
import type { ParseError } from '../core/parse';
import type { ThrowId, ValidationError } from '../core/types';

export const copy = {
  // -------------------------------------------------------------------------------------------
  // Wave 0: shell
  // -------------------------------------------------------------------------------------------

  title: 'anomatom',
  placeholder: 'I am anomatom, a juggling robot. Type a pattern and press Play: I juggle it and play every throw on a TR-808.',
  patternLabel: 'Pattern',
  handLabel: (hand: 0 | 1) => `Hand ${hand + 1} pattern`,
  ratioLabel: 'Ratio',
  ratioChip: (a: number, b: number) => `${a}:${b}`,
  play: 'Play',
  stop: 'Stop',
  valid: (balls: number) => `I have ${balls} ball${balls === 1 ? '' : 's'}.`,
  oneHandHint: 'When the ratio isn’t 1:1, a digit counts that hand’s own beats, so 2 is my two-ball fountain, not a hold.',
  /** Two plain definitions under the knobs, for a reader who has never met siteswap. */
  glossary: [
    {
      term: 'Pattern',
      text: 'I read siteswap, the jugglers’ notation. Each digit is one throw, and the number says how many beats it stays in the air. 3 is the three-ball cascade; 441 and 531 are classics.',
    },
    {
      term: 'Ratio',
      text: 'How fast my two hands beat against each other. At 1:1 they alternate. At 3:2, hand 1 takes three beats while hand 2 takes two, and each hand reads its own pattern.',
    },
  ],
  parseError(error: ParseError): string {
    switch (error.kind) {
      case 'empty':
        return 'I need a pattern.';
      case 'bad-char':
        return `I only read digits and x; character ${error.index + 1} isn’t one.`;
      case 'too-long':
        return `I read at most ${error.max} throws per hand.`;
    }
  },
  /** `vanilla`: at 1:1 a pulse is a shared beat, so it is named as such and counted from 1. */
  validationError(error: ValidationError, vanilla: boolean): string {
    switch (error.kind) {
      case 'fractional-balls':
        return `That makes ${Number(error.balls.toFixed(2))} balls. I can only juggle a whole number.`;
      case 'collision': {
        const where = vanilla ? `beat ${error.pulse + 1}` : `pulse ${error.pulse}`;
        return `I can’t catch that: ${throwList(error.throws, vanilla)} land in hand ${error.hand + 1} on ${where}.`;
      }
      case 'cross-off-grid':
        return `I can’t catch that: the cross from hand ${error.fromHand + 1} on beat ${error.beat + 1} lands between hand ${2 - error.fromHand}’s beats. The nearest pulse it could land on is ${error.nearestLegal}.`;
      case 'no-ball':
        return `I have no ball in hand ${error.hand + 1} to throw on beat ${error.beat + 1}.`;
    }
  },
  /** The About placeholder, until stream D writes the page. */
  aboutTitle: 'About',
  aboutBack: 'Back to the pattern',

  // -------------------------------------------------------------------------------------------
  // A: Juggler
  // -------------------------------------------------------------------------------------------

  /** The juggler canvas, for a screen reader. */
  jugglerLabel: 'My two hands juggling the pattern: hand 1 on the left, hand 2 on the right.',

  // -------------------------------------------------------------------------------------------
  // B: Player and fixes
  // -------------------------------------------------------------------------------------------

  // -------------------------------------------------------------------------------------------
  // C: Mapping and sound
  // -------------------------------------------------------------------------------------------

  /** Labels for the sound panel's choices (SPEC §4.3); controls stay labels, not sentences. */
  presetNames: {
    'height-drum': 'Height to drum',
    'height-pitch': 'Height to pitch',
    'ball-pitch': 'Ball to pitch',
    custom: 'Custom',
  },
  kitNames: { 'TR-808': 'TR-808' },
  padInstrumentNames: { mellotron: 'Mellotron', soundfont: 'Soundfont pad' },
  padChordNames: { Dm9: 'Dm9', Am7: 'Am7', Cmaj7: 'Cmaj7', F69: 'F6/9', open5: 'Open fifth' } as Record<string, string>,
  /** The kit's sounds, by smplr's group name. */
  sampleNames: {
    clap: 'Clap',
    clave: 'Clave',
    'conga-hi': 'Conga, high',
    'conga-low': 'Conga, low',
    'conga-mid': 'Conga, mid',
    cowbell: 'Cowbell',
    cymbal: 'Cymbal',
    'hihat-close': 'Hi-hat, closed',
    'hihat-open': 'Hi-hat, open',
    kick: 'Kick',
    maraca: 'Maraca',
    'mid-tom': 'Tom, mid',
    rimshot: 'Rimshot',
    snare: 'Snare',
    'tom-hi': 'Tom, high',
    'tom-low': 'Tom, low',
  } as Record<string, string>,
  noSample: 'None',
  // -------------------------------------------------------------------------------------------
  // D: About
  // -------------------------------------------------------------------------------------------

  aboutIdeaHeading: 'The idea',
  aboutIdea: [
    'A siteswap ladder diagram is a piano roll. Each throw is a note. It starts when a ball leaves a hand and ends when the ball lands, so the height of the throw is the length of the note.',
    'My hands are two voices. Give each hand its own beat and I play a polyrhythm: three beats in one hand against two in the other is two grids laid over each other.',
    'The rule that keeps two balls from landing in one hand at once is the rule that keeps two notes from ending on one beat in one voice. If I can juggle it, I can play it.',
  ],
  aboutSoundHeading: 'How I make sound',
  aboutSound: [
    'I keep one clock, the audio clock. Nothing else keeps time. The picture reads it on every frame.',
    'From your pattern I build a list of Events: a throw or a catch, in a hand, at a whole-number pulse. I turn pulses into seconds only when I schedule a sound or draw a frame.',
    'The Mapping decides what each Event sounds like: which drum, how long, how loud, and which side. The sound panel edits the Mapping and nothing else does.',
  ],
  aboutReadingHeading: 'What I read',
  aboutReadingIntro: 'The numbers are the ones the math notes cite.',
  aboutCreditsHeading: 'Credits',
  aboutCredits: [
    { name: 'sani.js', url: 'https://github.com/monkape/sani.js', note: 'whose motion model my juggler ports. MIT.' },
    { name: 'smplr', url: 'https://github.com/danigb/smplr', note: 'which plays the sampled drums. MIT.' },
    { name: 'L6', url: 'https://github.com/nicolovejoy/l6-music', note: 'whose audio code I reuse.' },
  ] as const,
  aboutRepo: 'My source is on GitHub',
  aboutRepoUrl: 'https://github.com/nicolovejoy/anomatom',
  aboutLicence: 'It is open source under the MIT licence.',

  // -------------------------------------------------------------------------------------------
  // E: Knobs
  // -------------------------------------------------------------------------------------------

  pause: 'Pause',
  spacePlayPause: 'Space plays and pauses me, except while you type a pattern.',
  /** The digit pad beside the pattern inputs. */
  digitPadLabel: 'Type a throw',
  crossKey: 'x',
  crossKeyLabel: 'Mark the throw before the cursor as crossing',
  backspaceKey: '⌫',
  backspaceKeyLabel: 'Backspace',
  /** The validity indicator beside each input: a mark, and what it says to a screen reader. */
  indicator: {
    ok: { mark: '✓', label: 'I can juggle this.' },
    bad: { mark: 'can’t juggle', label: 'I can’t juggle this yet.' },
    neutral: { mark: '·', label: 'This part looks fine.' },
  },
  ratioStepLabel: (hand: 0 | 1, up: boolean) => `${up ? 'More' : 'Fewer'} hand ${hand + 1} beats`,
  stepDown: '−',
  stepUp: '+',
  tempoLabel: 'Tempo',
  bpmUnit: 'bpm',
  /** Both hands' tempos (SPEC §4.1). At 1:1 the hands alternate, so the shared beat runs twice as fast. */
  tempoBoth: (bpm1: number, bpm2: number, vanilla: boolean) =>
    vanilla
      ? `Each hand beats at ${bpm1} bpm, so my shared beat runs at ${bpm1 * 2}.`
      : `Hand 1 beats at ${bpm1} bpm, hand 2 at ${bpm2}.`,
  swap: 'Swap',
  swapHint: 'Tap two throws in one pattern, or select each with Shift and an arrow key, then Swap.',
  swapChosen: (count: number) => (count === 1 ? 'One throw chosen; tap one more.' : 'Two throws chosen.'),
  swapImpossible: 'I can’t swap those: the earlier throw would have to land before it is thrown.',
  scrubLabel: 'Time in the cycle',
  volumeLabel: 'Volume',
  nextCycle: 'Next cycle',
  fixesLabel: 'Nearest patterns I can juggle:',
  fixesNone: 'I found no pattern nearby that I can juggle.',
  fixLabel: (texts: readonly string[]) => texts.join(' / '),
  /** The samples, beside Play. Loading is quiet; failed says what it means for the reader and offers the retry. */
  soundLoading: 'I am fetching my drum sounds.',
  soundReady: 'My drum sounds are ready.',
  soundFailed: 'I could not fetch my drum sounds, so I am silent.',
  soundRetry: 'Try again',
  /** A parse error at other ratios than 1:1 names the input it is in. */
  handParseError: (hand: 0 | 1, message: string) => `Hand ${hand + 1} pattern: ${message}`,
  /**
   * SPEC §4.2: a collision names every throw in the group, "both" for two and "all" for more.
   * `beat` counts from 1: the shared beat at 1:1, the catching hand's own beat otherwise.
   */
  collision: (throws: readonly ThrowId[], hand: 0 | 1, beat: number, vanilla: boolean) => {
    const quantifier = throws.length === 2 ? 'both' : 'all';
    const own = throws.every((t) => t.hand === hand);
    const where = vanilla ? `in hand ${hand + 1} on beat ${beat}` : own ? `on its beat ${beat}` : `on hand ${hand + 1}’s beat ${beat}`;
    return `I can’t catch that: ${throwList(throws, vanilla)} ${quantifier} land ${where}.`;
  },
  /** Every beat on which one hand has nothing to throw, in one sentence. Beats count from 1. */
  noBall: (hand: 0 | 1, beats: readonly number[]) => {
    const names = beats.map(String);
    const last = names.pop() as string;
    const list = names.length === 0 ? `beat ${last}` : `beats ${names.join(', ')} and ${last}`;
    return `I have no ball in hand ${hand + 1} to throw on ${list}.`;
  },

  // -------------------------------------------------------------------------------------------
  // Phone sheet (docs/plans/phone-sheet.md, stream A)
  // -------------------------------------------------------------------------------------------

  aboutButtonLabel: 'About',
  /** The sheet's tabs, in order. */
  tabNames: { pattern: 'Pattern', rhythm: 'Rhythm', sound: 'Sound' },
  sheetLabel: 'Knobs',
  sheetGrabOpen: 'Open the knobs',
  sheetGrabClose: 'Close the knobs',
  /** The closed sheet's summary: the pattern, then what it is. Opens the Pattern tab. */
  summaryOpen: 'Edit the pattern',
  summaryMeta: (balls: number, bpm: number) => `${balls} ball${balls === 1 ? '' : 's'} · ${bpm} bpm`,
  summaryBalls: (balls: number) => `${balls} ball${balls === 1 ? '' : 's'}`,
  summaryCantJuggle: 'can’t juggle',
  summaryEmpty: '–',
  /** Rhythm tab. */
  handsHeadingRhythm: 'Hands',
  ratioMore: 'More',
  ratioMoreLabel: 'Other ratios',
  tempoHand: (hand: 0 | 1, bpm: number) => `Hand ${hand + 1} · ${bpm} bpm`,
  tempoEach: (bpm: number) => `Each hand · ${bpm} bpm`,
  tempoShared: (bpm: number) => `Shared beat · ${bpm} bpm`,
  /** Over the ghost of a broken pattern while the last good one plays. */
  ghostLabel: (pattern: string) => `${pattern} · not playing`,

  // -------------------------------------------------------------------------------------------
  // F: Sound panel and share
  // -------------------------------------------------------------------------------------------

  kitLabel: 'Kit',
  presetLabel: 'Preset',
  perHeightHeading: 'Sound for each throw height',
  heightLabel: (height: number) => `Height ${height}`,
  handsHeading: 'Hands',
  panLabel: (hand: 0 | 1) => `Hand ${hand + 1} pan`,
  gainLabel: (hand: 0 | 1) => `Hand ${hand + 1} gain`,
  catchesHeading: 'Catches',
  catchesOn: 'Play a sound on each catch',
  catchSoundLabel: 'Catch sound',
  accentHeading: 'Cross throws',
  accentLabel: 'Accent',
  downbeatLabel: 'Cross landing on a shared beat',
  filterHeading: 'Crossings to filter',
  filterOn: 'Open the filter as crossings grow',
  filterLowLabel: 'Lowest cutoff (Hz)',
  filterHighLabel: 'Highest cutoff (Hz)',
  padHeading: 'Pad on the downbeat',
  padOn: 'Play a chord at the start of each cycle',
  padInstrumentLabel: 'Pad instrument',
  padChordLabel: 'Chord',
  resetToPreset: 'Reset to preset',
  copyLink: 'Copy share link',
  linkCopied: 'I copied the link. It holds my pattern, ratio, tempo and sound, and it never starts me playing.',
  linkNotCopied: 'I could not copy the link. Copy the address from the bar instead.',

  // -------------------------------------------------------------------------------------------
  // Phone sheet, stream B: first minute
  // -------------------------------------------------------------------------------------------

  firstMinute: {
    line: 'I juggle a pattern and play every throw as a drum. Pick one.',
    names: {
      cascade: 'Cascade',
      pause: 'Three balls, a pause',
      classic: 'High, middle, low',
      ramp: 'Five balls, a ramp',
      polyrhythm: 'Two hands, 3 against 2',
    } as Record<string, string>,
    playingSuffix: ' · playing',
    makeYourOwn: 'Make your own',
    pause: 'Pause',
    cardLabel: (pattern: string, name: string, playing: boolean) => `${pattern}, ${name}${playing ? ', playing' : ''}`,
  },
};

/**
 * "throws 1 and 2". At 1:1 the one input names every throw; at other ratios each hand counts
 * its own throws, so the hand is named too.
 */
function throwList(throws: readonly ThrowId[], vanilla: boolean): string {
  const oneHand = throws.every((t) => t.hand === throws[0]?.hand);
  const names = throws.map((t) => (vanilla || oneHand ? '' : `hand ${t.hand + 1}’s throw `) + String(t.index + 1));
  const last = names.pop() as string;
  const list = names.length === 0 ? last : `${names.join(', ')} and ${last}`;
  if (!vanilla && !oneHand) return list;
  const noun = names.length === 0 ? 'throw' : 'throws';
  return vanilla ? `${noun} ${list}` : `hand ${(throws[0]?.hand ?? 0) + 1}’s ${noun} ${list}`;
}
