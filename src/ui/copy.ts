// Every reader-facing string. Logic modules return structured values; this turns them into words.
import type { ParseError } from '../core/parse';
import type { ThrowId, ValidationError } from '../core/types';

export const copy = {
  title: 'anomatom',
  placeholder: 'A siteswap pattern as polyrhythm. Type a pattern, press play, hear it on a TR-808 and watch it scroll.',
  patternLabel: 'Siteswap',
  handLabel: (hand: 0 | 1) => `Hand ${hand + 1}`,
  ratioLabel: 'Ratio',
  ratioChip: (a: number, b: number) => `${a}:${b}`,
  spaceHint: 'Space plays and stops.',
  play: 'Play',
  stop: 'Stop',
  valid: (balls: number) => `${balls} ball${balls === 1 ? '' : 's'}`,
  oneHandHint: 'At a ratio other than 1:1 a digit counts that hand’s own beats, so 2 is a two-ball fountain, not a hold.',
  parseError(error: ParseError): string {
    switch (error.kind) {
      case 'empty':
        return 'type a pattern';
      case 'bad-char':
        return `character ${error.index + 1} is not a digit or x`;
      case 'too-long':
        return `at most ${error.max} throws`;
    }
  },
  /** `vanilla`: at 1:1 a pulse is a shared beat, so it is named as such and counted from 1. */
  validationError(error: ValidationError, vanilla: boolean): string {
    switch (error.kind) {
      case 'fractional-balls':
        return `${error.balls} balls: the digits must average to a whole number`;
      case 'collision': {
        const where = vanilla ? `beat ${error.pulse + 1}` : `pulse ${error.pulse}`;
        return `${throwList(error.throws)} ${error.throws.length === 2 ? 'both' : 'all'} land on ${where}`;
      }
      case 'cross-off-grid':
        return `cross throw from hand ${error.fromHand + 1} beat ${error.beat + 1} lands between hand ${2 - error.fromHand}’s beats; nearest legal landing is pulse ${error.nearestLegal}`;
      case 'no-ball':
        return `hand ${error.hand + 1} has no ball to throw on beat ${error.beat + 1}`;
    }
  },
};

function throwList(throws: readonly ThrowId[]): string {
  const names = throws.map((t) => String(t.index + 1));
  const last = names.pop() as string;
  const hand = throws.every((t) => t.hand === throws[0]?.hand) ? `hand ${(throws[0]?.hand ?? 0) + 1} ` : '';
  return names.length === 0 ? `${hand}throw ${last}` : `${hand}throws ${names.join(', ')} and ${last}`;
}
