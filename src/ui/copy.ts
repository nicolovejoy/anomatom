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

/** A throw as the reader counts it: in hand `hand` (0 = hand 1), the `index`-th digit (0 = the first). */
export interface ThrowRef {
  readonly hand: number;
  readonly index: number;
}

export const copy = {
  // -------------------------------------------------------------------------------------------
  // Wave 0: shell
  // -------------------------------------------------------------------------------------------

  title: 'anomatom',
  placeholder: 'I am anomatom, a juggling robot. Type a pattern and press Play: I juggle it and play every throw on a drum machine.',
  patternLabel: 'Pattern',
  handLabel: (hand: number) => `Hand ${hand + 1} pattern`,
  ratioLabel: 'Ratio',
  ratioChip: (a: number, b: number) => `${a}:${b}`,
  play: 'Play',
  stop: 'Stop',
  valid: (balls: number) => `I have ${balls} ball${balls === 1 ? '' : 's'}.`,
  oneHandHint: 'When the ratio isn’t 1:1, a digit counts that hand’s own beats, so 2 is my two-ball fountain, not a hold.',
  parseError(error: ParseError): string {
    switch (error.kind) {
      case 'empty':
        return 'I need a pattern.';
      case 'bad-char':
        return error.form === 'sync'
          ? `In sync I read pairs like (4,2x): even digits, x, parentheses, commas and a * at the end; character ${error.index + 1} doesn’t fit.`
          : `I only read digits, x and p; character ${error.index + 1} isn’t one.`;
      case 'too-long':
        return `I read at most ${error.max} throws per hand.`;
      case 'too-many-parts':
        return `I have ${error.max} hands; write at most ${error.max} patterns, with a / between them.`;
      case 'too-many-jugglers':
        return `I pass between at most ${error.max} jugglers; write at most ${error.max} patterns, with a | between them.`;
      case 'bad-target':
        return `I can’t send the x or p at character ${error.index + 1} anywhere: it follows a 0, or there is no other hand or juggler for it.`;
      case 'bad-sync':
        return error.open
          ? 'In sync, every pair closes: (left,right), like (4,2x).'
          : `In sync, every throw is even; the one at character ${error.index + 1} isn’t.`;
    }
  },
  /** A fractional mean (MATH.md §9.4), the cheaper of two presentations of one fault. */
  fractional: (balls: number) => `That makes ${Number(balls.toFixed(2))} balls. I can only juggle a whole number.`,
  /** A cross that lands between the catching hand's beats; `nearest` is that hand's next onset at or after the landing (null: it has none). */
  crossBetween: (fromHand: number, beat: number, toHand: number, nearest: number | null) =>
    `I can’t catch that: the cross from hand ${fromHand + 1} on beat ${beat} lands between hand ${toHand + 1}’s beats.` +
    (nearest === null ? '' : ` The nearest pulse it could land on is ${nearest}.`),
  /**
   * A flight that lands on a beat where the catching hand has no throw (a 0). `beat` counts from
   * 1: the shared beat at 1:1, the catching hand's own beat otherwise.
   */
  noThrowThere: (throwRef: ThrowRef, toHand: number, beat: number, vanilla: boolean) => {
    const where = vanilla ? `in hand ${toHand + 1} on beat ${beat}` : `on hand ${toHand + 1}’s beat ${beat}`;
    return `I can’t catch that: ${throwList([throwRef], vanilla)} lands ${where}, where I have nothing to throw.`;
  },
  /** Design §5: a manual group re-derived because its onsets changed. */
  resetNotice: (hands: readonly number[]) =>
    hands.length === 1
      ? `I reset hand ${(hands[0] as number) + 1} to 1 ball.`
      : `I reset hands ${andList(hands.map((h) => String(h + 1)))} to 1 ball each.`,
  /** A rate, steps or ratio change refused: its cycle would be longer than a share link carries (MAX_LINK_CYCLE). */
  cycleTooLong: 'That would make the cycle too long for me.',
  /** The About placeholder, until stream D writes the page. */
  aboutTitle: 'About',
  aboutBack: 'Back to the pattern',

  // -------------------------------------------------------------------------------------------
  // A: Juggler
  // -------------------------------------------------------------------------------------------

  /** The juggler canvas, for a screen reader. */
  jugglerLabel: 'My two hands juggling the pattern: hand 1 on the left, hand 2 on the right.',
  /** The juggler's label for three or more hands, paired into jugglers (lanes ruling 4); two or fewer read `jugglerLabel`. */
  jugglersLabel: (hands: number) => {
    const pairs = Array.from({ length: Math.ceil(hands / 2) }, (_, f) => (2 * f + 2 <= hands ? `hands ${2 * f + 1} and ${2 * f + 2}` : `hand ${2 * f + 1}`));
    return `My ${hands} hands juggling the pattern as ${pairs.length} jugglers side by side, left to right: ${pairs.join(', ')}.`;
  },
  /** The caption under juggler `j` (0-based) of three or more parts. */
  jugglerCaption: (j: number) => `Juggler ${j + 1}`,
  /** SPEC §4.1 (v2): shown while a flight longer than `seconds` is in the air. */
  notHumanThrow: (seconds: number) => `Not a human throw: I keep this one up for more than ${seconds} seconds.`,

  // -------------------------------------------------------------------------------------------
  // B: Player and fixes
  // -------------------------------------------------------------------------------------------

  // -------------------------------------------------------------------------------------------
  // C: Mapping and sound
  // -------------------------------------------------------------------------------------------

  /** The drum machines, by DRUMMER_KITS id. */
  kitNames: {
    'TR-808': 'Roland TR-808',
    'Casio-RZ1': 'Casio RZ-1',
    'LM-2': 'LinnDrum LM-2',
    'MFB-512': 'MFB-512',
    'Roland CR-8000': 'Roland CR-8000',
  } as Record<string, string>,
  /** An old link asked for a sound per hand (Voice per part, gone in v5): what I play instead. */
  voicePerPartGone: 'That link gave each hand its own sound. I no longer do that, so I play it by the height of each throw.',
  // -------------------------------------------------------------------------------------------
  // D: About
  // -------------------------------------------------------------------------------------------

  /**
   * The About page in three layers (docs/plans/v4-1-polish.md, ruling 4): what anomatom is and how
   * to use it; a short glossary; then, under "Sources and details", the bibliography, a pointer to
   * the math notes, the credits and the repo. No other prose.
   */
  aboutIntro: [
    'anomatom plays a juggling pattern as a rhythm.',
    'A pattern has one or more jugglers. Each juggler has two hands, and each hand throws on its beats. Every throw has a height and carries a ball; the height is how many beats the ball stays up.',
    'The app shows the jugglers throwing and plays one sound for every throw, in time. The sound follows the throw: its height or its ball. Each juggler plays through a drum machine of their own.',
    'So a pattern you can see becomes a rhythm you can hear.',
  ],
  aboutHowHeading: 'How to use it',
  aboutHow: [
    'Pick a pattern from the wheel, or type your own.',
    'Tap Play. Space plays and pauses too.',
    'With a keyboard, ↑ and ↓ change the pattern, and ← and → change what you listen for.',
    'Share copies a link that opens the same pattern, at the same tempo, with the same sounds.',
  ],
  aboutGlossaryHeading: 'Words',
  aboutGlossary: [
    { term: 'Siteswap', text: 'The jugglers’ notation. Each digit is one throw, and the number is how many beats it stays in the air: 441 and 531 are three-ball classics.' },
    { term: 'Cascade', text: 'The plainest pattern, 3: every throw the same height, each one crossing to the other hand.' },
    { term: 'Pass', text: 'A throw to another juggler, marked with a p, as in <3p 3|3p 3>.' },
    { term: 'Sync', text: 'Both hands throw at once, written as a pair in parentheses, as in (4,4).' },
    { term: 'Ratio', text: 'How fast two hands beat against each other: at 3:2, hand 1 takes three beats while hand 2 takes two.' },
    { term: 'Cycle', text: 'How long a pattern runs before every ball is back where it started.' },
  ] as readonly { term: string; text: string }[],
  aboutSourcesHeading: 'Sources and details',
  aboutReadingHeading: 'What we read',
  /** Who read it: under the heading, before the numbered list. */
  aboutReadingBy: 'Read by Claude and Nico, building anomatom.',
  /** Before the link to the math notes, which cite the bibliography by these numbers. */
  aboutMathLead: 'The numbers are the ones our ',
  aboutMathLink: 'math notes',
  aboutMathUrl: 'https://github.com/nicolovejoy/anomatom/blob/main/docs/MATH.md',
  aboutMathTail: ' cite: the theory behind the patterns, and the cases we test.',
  aboutCreditsHeading: 'Credits',
  aboutCredits: [
    { name: 'sani.js', url: 'https://github.com/monkape/sani.js', note: 'whose motion model my juggler ports. MIT.' },
    { name: 'smplr', url: 'https://github.com/danigb/smplr', note: 'which plays the sampled drums. MIT.' },
    { name: 'L6', url: 'https://github.com/nicolovejoy/l6-music', note: 'whose audio code I reuse.' },
  ] as const,
  aboutRepo: 'My source is on GitHub',
  aboutRepoUrl: 'https://github.com/nicolovejoy/anomatom',
  aboutLicence: 'It is open source under the MIT licence.',
  /** The About page's last line: when this copy of the site was built, Pacific time, and its commit. */
  aboutBuilt: 'Built',
  aboutBuiltZone: 'PT',
  aboutCommitUrl: 'https://github.com/nicolovejoy/anomatom/commit/',

  // -------------------------------------------------------------------------------------------
  // E: Knobs
  // -------------------------------------------------------------------------------------------

  pause: 'Pause',
  /** The digit pad beside the pattern inputs. */
  digitPadLabel: 'Type a throw',
  crossKey: 'x',
  crossKeyLabel: 'Mark the throw before the cursor as crossing',
  /** Passing siteswap's mark: the throw before it goes to the other juggler. Shown while the pattern has a |. */
  passKey: 'p',
  passKeyLabel: 'Mark the throw before the cursor as a pass to the other juggler',
  /** Sync siteswap's keys (form 5): `(` shows always, `,` and `)` while the pattern has a ( or is a sync pattern. */
  openPairKey: '(',
  openPairKeyLabel: 'Open a pair: two throws made together, the left hand’s first',
  commaKey: ',',
  commaKeyLabel: 'Between the left hand’s throw and the right hand’s',
  closePairKey: ')',
  closePairKeyLabel: 'Close the pair',
  backspaceKey: '⌫',
  backspaceKeyLabel: 'Backspace',
  /** On a phone or tablet the pad is the keyboard (v6.3 ruling 4): this key brings the device's own, for / < > | spaces and letters. */
  keyboardKey: '⌨',
  keyboardKeyLabel: 'Type with the on-screen keyboard',
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
  swapOneHand: 'I can’t swap those: in a sync pattern both throws must be the same hand’s.',
  swapZeroCross: 'I can’t swap those: a throw would have to reach the other hand the moment it is thrown.',
  scrubLabel: 'Time in the cycle',
  volumeLabel: 'Volume',
  nextCycle: 'Next cycle',
  /** Design §6: the fixes are an offer, never a gate. */
  fixesHeading: 'Make it juggleable',
  fixesOptional: 'Optional. I play it as it is either way.',
  fixesLabel: 'Nearest patterns I can juggle:',
  /** Rhythm tab, one column per hand (design §14 option b). Controls stay labels. */
  rhythmHand: (hand: number) => `Hand ${hand + 1}`,
  phaseLabel: 'Phase',
  ballsLabel: 'Balls',
  hitsLabel: 'Hits',
  /** The phase readout: the phase over the cycle, both in pulses ("3", then "/ 12" under it). */
  phaseCycle: (cycle: number) => `/ ${cycle}`,
  phaseReadoutLabel: (hand: number, phase: number, cycle: number) =>
    `Hand ${hand + 1} phase: ${phase} of a ${cycle}-pulse cycle`,
  phaseStepLabel: (hand: number, later: boolean) => `Hand ${hand + 1} ${later ? 'one pulse later' : 'one pulse earlier'}`,
  ballsStepLabel: (hand: number, up: boolean) => `${up ? 'More' : 'Fewer'} balls in hand ${hand + 1}`,
  hitsStepLabel: (hand: number, up: boolean) => `${up ? 'More' : 'Fewer'} hits for hand ${hand + 1}`,
  /** A manual group has no ball knob: its count, which may span both hands, and Reset. */
  groupBalls: (balls: number | null, hands: number) =>
    balls === null
      ? 'can’t juggle'
      : hands > 1
        ? `${balls} ball${balls === 1 ? '' : 's'} between ${hands === 2 ? 'both' : hands} hands`
        : String(balls),
  resetGroup: 'Reset',
  resetGroupLabel: (hands: readonly number[]) =>
    hands.length === 1
      ? `Reset hand ${(hands[0] as number) + 1} to 1 ball`
      : hands.length === 2
        ? 'Reset both hands to 1 ball each'
        : `Reset hands ${andList(hands.map((h) => String(h + 1)))} to 1 ball each`,
  fixesNone: 'I found no pattern nearby that I can juggle.',
  fixLabel: (texts: readonly string[]) => texts.join(' / '),
  /** The samples, beside Play. Loading is quiet; failed says what it means for the reader and offers the retry. */
  soundLoading: 'I am fetching my drum sounds.',
  soundReady: 'My drum sounds are ready.',
  soundFailed: 'I could not fetch my drum sounds, so I am silent.',
  soundRetry: 'Try again',
  /** A parse error at other ratios than 1:1 names the input it is in. */
  handParseError: (hand: number, message: string) => `Hand ${hand + 1} pattern: ${message}`,
  /**
   * SPEC §4.2: a collision names every throw in the group, "both" for two and "all" for more.
   * `beat` counts from 1: the shared beat at 1:1, the catching hand's own beat otherwise.
   */
  collision: (throws: readonly ThrowRef[], hand: number, beat: number, vanilla: boolean) => {
    const quantifier = throws.length === 2 ? 'both' : 'all';
    const own = throws.every((t) => t.hand === hand);
    const where = vanilla ? `in hand ${hand + 1} on beat ${beat}` : own ? `on its beat ${beat}` : `on hand ${hand + 1}’s beat ${beat}`;
    return `I can’t catch that: ${throwList(throws, vanilla)} ${quantifier} land ${where}.`;
  },
  /** Every beat on which one hand has nothing to throw, in one sentence. Beats count from 1. */
  noBall: (hand: number, beats: readonly number[]) => {
    const list = beats.length === 1 ? `beat ${beats[0]}` : `beats ${andList(beats.map(String))}`;
    return `I have no ball in hand ${hand + 1} to throw on ${list}.`;
  },

  // -------------------------------------------------------------------------------------------
  // Phone sheet (docs/plans/phone-sheet.md, stream A)
  // -------------------------------------------------------------------------------------------

  aboutButtonLabel: 'About',
  aboutButtonGlyph: '?',
  /** The sheet's tabs, in order. */
  tabNames: { pattern: 'Pattern', rhythm: 'Rhythm', sound: 'Sound' },
  sheetLabel: 'Knobs',
  sheetGrabOpen: 'Open the knobs',
  sheetGrabClose: 'Close the knobs',
  /** The closed sheet's summary: the pattern, then what it is. Opens the Pattern tab. */
  summaryOpen: 'Edit the pattern',
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

  // -------------------------------------------------------------------------------------------
  // Lanes (docs/plans/lanes.md, stream B): the Rhythm tab as one lane per hand
  // -------------------------------------------------------------------------------------------

  rateLabel: 'Rate',
  stepsLabel: 'Steps',
  rateStepLabel: (hand: number, up: boolean) => `${up ? 'More' : 'Fewer'} beats for hand ${hand + 1} per rate-1 beat`,
  stepsStepLabel: (hand: number, up: boolean) => `${up ? 'More' : 'Fewer'} steps for hand ${hand + 1}`,
  /** A step cell: pressed when the hand throws on that beat. Beats count from 1. */
  cellLabel: (hand: number, beat: number) => `Hand ${hand + 1}, step ${beat + 1}`,
  /** The lane's sound, from the Mapping; tapping it opens the Sound tab. */
  voiceLabel: (hand: number, voice: string) => `Hand ${hand + 1} sound: ${voice}. Open the Sound tab`,
  /** A lane's sound: what every throw follows, in Listen for's words (`listenNames`), capitalised. */
  voiceNames: { height: 'The height of each throw', ball: 'Each ball', pitch: 'The height, as a pitch' },
  removeLane: '×',
  removeLaneLabel: (hand: number) => `Remove hand ${hand + 1}`,
  addLane: 'Add a hand',
  /** A lane's disclosure on a phone: hits, balls and phase fold away under it. */
  laneMore: 'More',
  laneMoreLabel: (hand: number) => `More: hand ${hand + 1} hits, balls and phase`,
  /** In the later lanes of a manual group, where the ball knob would be: the count is in the group's first lane. */
  groupWith: (first: number) => `Balls shared with hand ${first + 1}`,
  lanesLabel: 'Hands, one lane each',
  /** The Pattern tab with more hands than one input writes: one input per hand, in its own beats. */
  lanesHint:
    'With more than two hands, each hand has its own pattern, counted in its own beats: 2 is that hand’s two-ball fountain, not a hold. A digit, x and a hand number throws across: 3x2 lands in hand 2.',

  // -------------------------------------------------------------------------------------------
  // F: Sound panel and share
  // -------------------------------------------------------------------------------------------

  /**
   * The Sound panel (docs/plans/v5-sound-model.md, ruling 7), top to bottom: Volume, Listen for,
   * Tempo, Drum machines, Also play. Words from the agreed vocabulary: pattern, juggler, hand,
   * throw, catch, height, ball, sound, drum machine.
   */
  listenHeading: 'Listen for',
  /** The choices, read after "Listen for", by Listen. */
  listenNames: { height: 'the height of each throw', ball: 'each ball', pitch: 'the height, as a pitch' },
  /** The ⓘ beside Listen for, and its lines: one plain line per choice. */
  listenInfoGlyph: 'ⓘ',
  listenInfoLabel: 'What each choice means',
  listenInfo: {
    height: 'The height of each throw: each height has its own drum, so a 3, a 5 and a 7 each sound different.',
    ball: 'Each ball: every ball keeps one sound wherever it goes, whatever its height.',
    pitch: 'The height, as a pitch: each height has its own note, and the higher the throw, the lower the sound.',
  },
  drummersHeading: 'Drum machines',
  /** One row per juggler on stage; `juggler` counts from 0. */
  drummerJuggler: (juggler: number) => `Juggler ${juggler + 1}`,
  changeDrummers: 'Change drum machines',
  alsoHeading: 'Also play',
  /** The three switches, and what each plays. */
  alsoNames: { catches: 'Catches', downbeat: 'Downbeat', pad: 'Pad' },
  alsoHints: {
    catches: 'A sound on each catch',
    downbeat: 'A clap when a throw to the other hand is caught on a beat every hand shares',
    pad: 'A chord at the start of each cycle',
  },
  shareLabel: 'Share this pattern',
  linkCopied: 'Link copied',
  linkNotCopied: 'Link not copied',
  /** The wordmark is a button: it asks before starting over. */
  /** Read after the site name inside the wordmark button, for screen readers. */
  wordmarkHint: 'start over',
  resetQuestion: 'Start over?',
  resetConfirm: 'Reset',
  resetCancel: 'Cancel',

  // -------------------------------------------------------------------------------------------
  // v4 D1: the deck (docs/plans/v4-deck.md): the transport bar, the sound row and the wheel
  // -------------------------------------------------------------------------------------------

  deck: {
    label: 'Player',
    /** Between the name and the ball count under the notation. */
    dot: ' · ',
    previous: 'Previous pattern',
    next: 'Next pattern',
    /** The pattern button: on a phone it opens the wheel. */
    choose: (pattern: string, name: string) => `${pattern}, ${name}. Choose a pattern`,
    mute: 'Mute',
    unmute: 'Unmute',
    /** The deck's one sound control: what the sound follows (its options are `listenNames`). */
    listen: 'Listen for',
    details: 'Details',
    /** Starts with the visible word, so a voice command "click Details" finds it (WCAG 2.5.3). */
    detailsLabel: 'Details, all sound settings',
    wheelLabel: 'Patterns',
    makeYourOwn: 'Make your own',
    /** The transport bar's name line for a pattern that is no preset. */
    yourOwn: 'Your pattern',
    jugglers: (n: number) => `${n} juggler${n === 1 ? '' : 's'}`,
    /** The tag at the right of a wheel row. */
    groupTags: { '3': '3', '4': '4', '5': '5', passing: 'Pass' } as Record<'3' | '4' | '5' | 'passing', string>,
    /**
     * The filter chips above the wheel (docs/plans/v6-1-wheel-feel.md, ruling 4): two labelled
     * groups, the count on each chip and its whole phrase as the chip's name. One at a time across
     * both; the lit one tapped again shows every card.
     */
    filtersLabel: 'Show only',
    filterGroups: { balls: 'Balls', jugglers: 'Jugglers' } as Record<'balls' | 'jugglers', string>,
    filterName: (by: 'balls' | 'jugglers', n: number) => (by === 'balls' ? `${n} ball${n === 1 ? '' : 's'}` : `${n} juggler${n === 1 ? '' : 's'}`),
    /**
     * The wide layout's bar (docs/plans/v5-sound-model.md, ruling 8): Play, then a key cap for
     * each key and what it does.
     */
    keysLabel: 'Keys',
    keys: [
      { caps: ['space'], does: 'play' },
      { caps: ['↑', '↓'], does: 'pattern' },
      { caps: ['←', '→'], does: 'listen for' },
    ],
  },

  /** The wide layout's top bar: one panel beside the stage at a time (ruling 8). */
  panelLabel: 'Beside the stage',
  panelNames: { patterns: 'Patterns', sound: 'Sound', stage: 'Stage' },
  /** The key caps beside Listen for in the Sound panel, on the wide layout. */
  listenKeys: ['←', '→'],

  // -------------------------------------------------------------------------------------------
  // Presets: the juggling classics, keyed by Preset.id. `name` is a name a source uses, or a plain
  // description where none was found (v3 stream C1; the sources are listed in its PR).
  // -------------------------------------------------------------------------------------------

  presets: {
    cascade: { name: 'Cascade' },
    shower: { name: 'Shower' },
    pause: { name: 'Half box' },
    classic: { name: 'High, middle, low' },
    boston: { name: 'Boston shuffle' },
    box: { name: 'Box' },
    fountain: { name: 'Fountain' },
    'half-shower': { name: 'Half-shower' },
    'tower-4': { name: 'Four balls, stepping down' },
    polyrhythm: { name: 'Two hands, 3 against 2' },
    'five-cascade': { name: 'Cascade' },
    'five-744': { name: 'Five balls, one high throw' },
    ramp: { name: 'Five balls, a ramp' },
    passing: { name: 'Two-count' },
    ultimates: { name: 'Ultimates' },
    'three-count': { name: 'Three-count' },
    'seven-fours': { name: 'Seven, two fours' },
    'rising-passes': { name: 'Rising' },
    'three-feed': { name: 'Feed' },
    'three-triangle': { name: 'Triangle' },
    'three-ultimates': { name: 'Ultimates for 3' },
  } as Record<string, { name: string }>,
};

/**
 * "throws 1 and 2". At 1:1 the one input names every throw; at other ratios each hand counts
 * its own throws, so the hand is named too.
 */
function throwList(throws: readonly ThrowRef[], vanilla: boolean): string {
  const oneHand = throws.every((t) => t.hand === throws[0]?.hand);
  const list = andList(throws.map((t) => (vanilla || oneHand ? '' : `hand ${t.hand + 1}’s throw `) + String(t.index + 1)));
  if (!vanilla && !oneHand) return list;
  const noun = throws.length === 1 ? 'throw' : 'throws';
  return vanilla ? `${noun} ${list}` : `hand ${(throws[0]?.hand ?? 0) + 1}’s ${noun} ${list}`;
}

/** "1", "1 and 2", "1, 2 and 3". */
function andList(names: readonly string[]): string {
  const init = names.slice(0, -1);
  const last = names[names.length - 1] as string;
  return init.length === 0 ? last : `${init.join(', ')} and ${last}`;
}
