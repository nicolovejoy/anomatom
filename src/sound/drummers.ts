// The sound model (docs/plans/v5-sound-model.md, rulings 1 to 4): what the store keeps about sound,
// and the Mapping it makes. Pure: no DOM, no timers.
//
// A pattern carries no sound. Three global choices do: what a throw's sound follows (`listen`),
// three Also play switches, and `kitShift`, which turns every juggler's drum machine at once.
// `mappingOf` builds today's Mapping from them, so the scheduler and the drum machine read what
// they always read: one voice per hand, hand h belonging to juggler floor(h / 2), each juggler on
// a drum machine of its own and panned where the stage draws it (juggler 1 on the left).
import { DEFAULT_FILTER_HZ, DRUMMER_KITS, LISTEN_RULES, SOUND_FIXED, STAGE_PAN } from '../tunables';
import type { Mapping, PartVoice } from './mapping';

/** What a throw's sound follows: its height (a drum per height), its ball, or its height as a pitch. */
export type Listen = 'height' | 'ball' | 'pitch';
/** In the order the panel lists them and ↑ ↓ step through them. */
export const LISTENS: readonly Listen[] = ['height', 'ball', 'pitch'];

/** Also play: a sound on each catch, the clap on a cross caught on the downbeat, the pad chord. */
export interface Also {
  readonly catches: boolean;
  readonly downbeat: boolean;
  readonly pad: boolean;
}
export const ALSO_KEYS: readonly (keyof Also)[] = ['catches', 'downbeat', 'pad'];

export const isListen = (value: unknown): value is Listen => LISTENS.includes(value as Listen);

/** `n` as a kitShift: a whole number, wrapped into 0 to DRUMMER_KITS.length - 1; anything else 0. */
export function wrapKitShift(n: number): number {
  const length = DRUMMER_KITS.length;
  return Number.isInteger(n) ? ((n % length) + length) % length : 0;
}

/** Jugglers on stage for `parts` hands: a pair of hands each, an odd last hand a juggler of its own; at least one. */
export const jugglerCount = (parts: number): number => Math.max(1, Math.ceil(parts / 2));

/** Juggler j's drum machine (a DRUMMER_KITS id) under `kitShift`. */
export const kitOf = (juggler: number, kitShift: number): string => DRUMMER_KITS[wrapKitShift(juggler + kitShift)] as string;

/**
 * Hand h's pan for a pattern of `parts` hands (ruling 4): its juggler's place on the stage, left
 * hand left of centre. One juggler: -0.6, 0.6; two: -0.8, -0.4, 0.4, 0.8.
 */
export function handPan(hand: number, parts: number): number {
  const n = jugglerCount(parts);
  const j = Math.floor(hand / 2);
  const { edge, soloHand, handMax } = STAGE_PAN;
  const centre = n === 1 ? 0 : -edge + (2 * edge * j) / (n - 1);
  const d = n === 1 ? soloHand : Math.min(handMax, edge / (n - 1));
  return round(hand % 2 === 0 ? centre - d : centre + d);
}

/** Floating-point noise off a pan (0.6 - 0.2 is 0.39999…), so a pan reads as written. */
const round = (x: number): number => Math.round(x * 1e9) / 1e9;

/**
 * The Mapping the player reads for `parts` hands: the rule `listen` names, the Also play switches,
 * and one voice per hand on its juggler's drum machine, panned from the stage, at gain 1. Pad
 * instrument and chord, the catch and downbeat sounds and the pass accent are fixed (SOUND_FIXED);
 * the filter is off.
 */
export function mappingOf(listen: Listen, also: Also, kitShift: number, parts: number): Mapping {
  const rule = LISTEN_RULES[listen];
  const count = Math.max(1, Math.trunc(parts) || 1);
  const voices: PartVoice[] = Array.from({ length: count }, (_, h) => ({
    kit: kitOf(Math.floor(h / 2), kitShift),
    sample: null,
    pan: handPan(h, count),
    gain: SOUND_FIXED.gain,
  }));
  return {
    parts: voices,
    byHeight: true,
    perHeight: rule.perHeight,
    byBall: rule.byBall,
    catches: { on: also.catches, sample: SOUND_FIXED.catchSample },
    crossAccent: { velocity: SOUND_FIXED.crossVelocity, downbeat: also.downbeat ? SOUND_FIXED.downbeatSample : null },
    pass: { ...SOUND_FIXED.pass },
    filter: { on: false, ...DEFAULT_FILTER_HZ },
    pad: { on: also.pad, instrument: SOUND_FIXED.pad.instrument, chord: SOUND_FIXED.pad.chord },
  };
}
