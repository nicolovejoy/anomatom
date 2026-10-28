// Every reader-facing string. Logic modules return structured values; this turns them into words.
import type { ParseError } from '../core/parse';
import type { ThrowId, ValidationError } from '../core/types';

export const copy = {
  title: 'jugglebeat',
  placeholder: 'A siteswap pattern as polyrhythm. Nothing to see yet: the core math is in, the sound comes next.',
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
  validationError(error: ValidationError): string {
    switch (error.kind) {
      case 'fractional-balls':
        return `${error.balls} balls: the digits must average to a whole number`;
      case 'collision':
        return `${throwList(error.throws)} ${error.throws.length === 2 ? 'both' : 'all'} land on pulse ${error.pulse}`;
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
