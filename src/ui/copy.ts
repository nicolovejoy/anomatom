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
  placeholder: 'I am anomatom, a juggling robot. Type a pattern and press Play: I juggle it and play every throw on a drum machine, a Roland TR-808 unless you pick another kit.',
  patternLabel: 'Pattern',
  handLabel: (hand: number) => `Hand ${hand + 1} pattern`,
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
        return `I only read digits, x and p; character ${error.index + 1} isn’t one.`;
      case 'too-long':
        return `I read at most ${error.max} throws per hand.`;
      case 'too-many-parts':
        return `I have ${error.max} hands; write at most ${error.max} patterns, with a / between them.`;
      case 'too-many-jugglers':
        return `I pass between at most ${error.max} jugglers; write at most ${error.max} patterns, with a | between them.`;
      case 'bad-target':
        return `I can’t send the x or p at character ${error.index + 1} anywhere: it follows a 0, or there is no other hand or juggler for it.`;
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

  /** Labels for the sound panel's choices (SPEC §4.3); controls stay labels, not sentences. */
  presetNames: {
    'voice-per-part': 'Voice per part',
    'height-drum': 'Height to drum',
    'height-pitch': 'Height to pitch',
    'ball-pitch': 'Ball to pitch',
    custom: 'Custom',
  },
  /** By KIT_IDS id. */
  kitNames: {
    'TR-808': 'Roland TR-808',
    'Casio-RZ1': 'Casio RZ-1',
    'LM-2': 'LinnDrum LM-2',
    'MFB-512': 'MFB-512',
    'Roland CR-8000': 'Roland CR-8000',
  } as Record<string, string>,
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
  /**
   * One section per layer of the model (docs/plans/model-rethink.md §3). Numbers in brackets are
   * the bibliography's. Only entries opened and checked are cited: 1, 5, 13, 16, 18, 19, 20, 22.
   */
  aboutLayers: [
    {
      heading: 'Time and the lattice',
      paragraphs: [
        'I count time in whole pulses. A pulse is the largest step that every hand’s beats fall on, so I never use a fraction of one.',
        'I turn pulses into seconds only when I schedule a sound or draw a frame. If you ask a hand to start between two pulses, I make the pulses finer until it fits.',
      ],
    },
    {
      heading: 'Grids: ratio and displacement',
      paragraphs: [
        'A hand throws on a grid: beats a fixed number of pulses apart, starting at a phase. If two of my hands have different spacings, I am playing a polyrhythm, such as 3 against 2.',
        'Two grids with the same spacing and a different phase are a displacement, as in Clapping Music. Krebs separates the two as grouping dissonance, layers that do not fit, and displacement dissonance, layers that fit and are not aligned [19]. 1:1 can mean two things: hands that strike together, or hands that take turns. For me they are one parameter, the phase.',
        'My grids are even. Beats that are unevenly spaced are not something I play.',
      ],
    },
    {
      heading: 'Lines, necklaces and Euclidean rhythms',
      paragraphs: [
        'A line is the pattern of hits on a grid, repeated. A line that repeats has no first beat, so turning it gives the same necklace [16]. Toussaint’s book has chapters on necklaces and Euclidean rhythms [18].',
        'Some well-known lines are Euclidean: E(k, n) spreads k hits over n pulses as evenly as it can. Toussaint shows E(3, 8) as the tresillo, E(4, 9) as Brubeck’s Rondo a la Turk, E(7, 12) as a common West African bell pattern and E(5, 16) as the bossa-nova necklace [16].',
        'Son clave is not one of them. Its gaps are 3, 3, 4, 2 and 4, three different lengths, so it is nearly even and not maximally even. It stays a preset.',
      ],
    },
    {
      heading: 'Flights, objects and k balls',
      paragraphs: [
        'A hit can be a throw. It flies to a later hit, in the same hand or the other, and carries one ball. The balls are the paths those flights make, and I count them.',
        'For a pattern I can juggle, the average of the digits is the number of balls. Buhler and his co-authors give this for juggling sequences [1], and Polster’s survey states it as a theorem [5].',
        'So any line of hits is a pattern I can juggle with one ball: each throw is as long as the gap to the next hit. Give a hand k balls and each throw flies k hits ahead. That changes my picture and not my sound.',
      ],
    },
    {
      heading: 'Parts, streams and inherent patterns',
      paragraphs: [
        'A part is a hand: a grid, a line and a phase. Listeners do not hear parts. They hear streams, notes the ear gathers into one line. Bregman’s book introduces the auditory stream [20].',
        'Kubik described how, in East and Central African instrumental music, the ear groups the notes into conflicting gestalten [22]. I borrow that idea for the mbira card: two hands interlock, and I listen for a third line that neither plays.',
      ],
    },
    {
      heading: 'Notation',
      paragraphs: [
        'I write a pattern three ways. Vanilla siteswap, as in 531, for two hands. Two or three jugglers write passing siteswap, as in <3p 3|3p 3>: a sequence for each juggler between bars, and a p after a throw sends it to the other juggler. Digits for each hand, as in 2 2x 2 / 2x 2: a digit is a flight length in that hand’s own beats, a 0 is a beat with no throw and an x sends the throw to the other hand.',
        'The third is Multihand Notation, which Juggling Lab keeps inside: a matrix of hands and event times, named for Ed Carstens [13]. It has no standard text form. I do not read it yet.',
      ],
    },
  ] as readonly { heading: string; paragraphs: readonly string[] }[],
  aboutPresetsHeading: 'Where the cards come from',
  aboutPresets: [
    'Every card is a pattern jugglers already know, and I play it on the tempo you set. The names are the ones Juggling Lab, the Library of Juggling and Wikipedia’s list of siteswaps use. Where I found no name for a pattern, the card says what it is instead.',
    'I play every card on a Roland TR-808 unless you pick another kit. The passing cards give each juggler a kit of their own.',
  ],
  aboutColotomyHeading: 'A note on the gong cycle',
  aboutColotomy: [
    'I hear the gong cycle of Javanese and Balinese music as nested grids: the big gong once per cycle, kempul and kenong at halves and quarters, kethuk at finer points. That is called colotomic structure.',
    'It is not a polyrhythm, because every level is a power of two. But my cycle line and my downbeat accent are a two-level version of it.',
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
  /** Passing siteswap's mark: the throw before it goes to the other juggler. Shown while the pattern has a |. */
  passKey: 'p',
  passKeyLabel: 'Mark the throw before the cursor as a pass to the other juggler',
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
  rhythmHint:
    'Rate is how many beats a hand plays while a rate-1 hand plays one. Steps is how many beats before its line repeats; tap a step to throw on it or rest. Phase moves a hand later, a pulse at a time. Balls is how many I keep in the air over the same hits. Hits spreads that many throws evenly over the steps.',
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
  voiceByHeight: 'By height',
  voiceByBall: 'By ball',
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

  kitLabel: 'Kit',
  /** With three or more parts the Kit row is one select per juggler; `juggler` counts from 0. */
  jugglerKitLabel: (juggler: number) => `Juggler ${juggler + 1} kit`,
  passesHeading: 'Passes',
  passAccentLabel: 'Accent',
  passSampleLabel: 'Pass sound',
  /** The pass sound select's no-sample option: the pass keeps the sound it would have had. */
  passSampleOwn: 'Its own sound',
  presetLabel: 'Preset',
  perHeightHeading: 'Sound for each throw height',
  heightLabel: (height: number) => `Height ${height}`,
  partsHeading: 'Parts',
  /** `part` counts from 0; the reader sees it from 1. */
  partSoundLabel: (part: number) => `Part ${part + 1} sound`,
  panLabel: (part: number) => `Part ${part + 1} pan`,
  gainLabel: (part: number) => `Part ${part + 1} gain`,
  /** Design §7: the sound does not follow the ball count unless the preset reads flight length. */
  soundBallCountNote: 'Ball count changes the picture, not the sound, unless a preset reads throw height.',
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
  /** The sheet's way back to the card screen: an icon button with this as its accessible name, at every width. */
  patternsLabel: 'Patterns',
  shareLabel: 'Share this pattern',
  linkCopied: 'Link copied',
  linkNotCopied: 'Link not copied',

  // -------------------------------------------------------------------------------------------
  // Phone sheet, stream B: first minute
  // -------------------------------------------------------------------------------------------

  firstMinute: {
    line: 'I juggle a pattern and play every throw as a drum. Pick one.',
    playingSuffix: ' · playing',
    makeYourOwn: 'Make your own',
    pause: 'Pause',
    /** Group headings on the card screen, in screen order. */
    groups: { '3': '3 balls', '4': '4 balls', '5': '5 balls', passing: 'Passing' } as Record<string, string>,
    /** The now-playing strip above the bar. */
    strip: {
      label: 'Now playing controls',
      kit: 'Kit',
      sound: 'Sound',
      tempo: 'Tempo',
      mixed: 'Mixed',
      custom: 'Custom',
      slower: 'Slower',
      faster: 'Faster',
      allSound: 'All sound settings',
    },
    cardLabel: (pattern: string, name: string, playing: boolean) => `${pattern}, ${name}${playing ? ', playing' : ''}`,
  },

  // -------------------------------------------------------------------------------------------
  // Presets: the juggling classics, keyed by Preset.id. `name` is a name a source uses, or a plain
  // description where none was found (v3 stream C1; the sources are listed in its PR).
  // -------------------------------------------------------------------------------------------

  presets: {
    cascade: { name: 'Cascade' },
    shower: { name: 'Shower' },
    pause: { name: 'Half box' },
    classic: { name: 'High, middle, low' },
    'two-in-ones': { name: 'Two-in-ones, alternating' },
    boston: { name: 'Boston shuffle' },
    flash: { name: 'Flash' },
    fountain: { name: 'Fountain' },
    'half-shower': { name: 'Half-shower' },
    'high-low-fountain': { name: 'High, low, fountain' },
    'tower-4': { name: 'Four balls, stepping down' },
    polyrhythm: { name: 'Two hands, 3 against 2' },
    'five-cascade': { name: 'Cascade' },
    'five-744': { name: 'Five balls, one high throw' },
    'five-645': { name: 'Five balls, three heights' },
    ramp: { name: 'Five balls, a ramp' },
    passing: { name: 'Two-count' },
    ultimates: { name: 'Ultimates' },
    'three-count': { name: 'Three-count' },
    'four-count': { name: 'Four-count' },
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
