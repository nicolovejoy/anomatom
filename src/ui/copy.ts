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
  spaceHint: 'Space starts and stops me.',
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

  // -------------------------------------------------------------------------------------------
  // E: Knobs
  // -------------------------------------------------------------------------------------------

  // -------------------------------------------------------------------------------------------
  // F: Sound panel and share
  // -------------------------------------------------------------------------------------------
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
