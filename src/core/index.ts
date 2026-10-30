// The part model (docs/plans/model-rethink.md, API frozen in docs/plans/model-waves.md).
// The two-hand model (src/core/legacy) was retired by stream B: every caller reads parts.
export * from './types';
export { gcd, lcm, mod } from './math';
export { digitValue, parseThrows } from './parse';
export type { ParseError, PartContext, ThrowsResult } from './parse';
export {
  cycleOf,
  isVanillaPair,
  linesParts,
  normalise,
  onsetsOf,
  partsFromLines,
  partsFromOnsets,
  partsFromVanilla,
  periodOf,
  ratesOf,
  ratioOf,
  ratioSpacings,
  textOf,
  throwsOf,
  vanillaDigits,
  vanillaIndex,
  vanillaPair,
  withPhase,
} from './parts';
export type { PartsResult } from './parts';
export { euclid, rotate } from './euclid';
export { beatsOf, flightsOf } from './flights';
export { ballCount, crossGroups, judge, onsetPulses } from './judge';
export { buildSchedule } from './schedule';
export { carryOver } from './carry';
export type { CarrySchedule } from './carry';
export { fixesFor, searchFixes } from './fixes';
export type { FixDigits, FixLimits } from './fixes';
export { countCrossings } from './crossings';
export type { Arc } from './crossings';
export { swapSites } from './swap';
