// The mapping's share-link form (design §8): a preset name when the mapping equals one, else an
// object of short keys. Pure. Decoding trusts nothing: junk is repaired field by field (unknown
// fields ignored, missing or mistyped ones taken from the defaults, numbers clamped, sample and kit
// names checked), so a link can never produce a mapping the player cannot play.
//
//   h  nine samples for heights 1-9 (string or null)
//   b  the ball-to-pitch list, or null
//   p  per part: [kit, sample, pan, gain]
//   y  byHeight (0|1)
//   c  [catches on (0|1), catch sample]
//   d  [cross accent velocity, downbeat sample]
//   f  [filter on (0|1), low Hz, high Hz]
//   a  [pad on (0|1), instrument, chord]
// Old `#v1.` links carry `v: [[pan, gain], [pan, gain]]` for the two hands instead of `p` and `y`;
// they decode to parts of the TR-808 with the default's sample per part, and read height as they did.
import {
  CROSS_BOOST_RANGE,
  DEFAULT_MAPPING,
  FILTER_HZ_RANGE,
  GAIN_RANGE,
  KIT_IDS,
  KIT_SAMPLES,
  MAX_HEIGHT,
  MAX_MAPPING_PARTS,
  PAN_RANGE,
} from '../tunables';
import {
  applyPreset,
  PAD_CHORD_IDS,
  PAD_INSTRUMENT_IDS,
  presetOf,
  PRESET_NAMES,
  voiceForNewPart,
  withPartCount,
  type Mapping,
  type PartVoice,
  type Sample,
} from './mapping';

export function encodeMapping(m: Mapping): unknown {
  const name = presetOf(m);
  if (name !== 'custom') return name;
  return {
    h: Array.from({ length: MAX_HEIGHT }, (_, i) => m.perHeight[i + 1] ?? null),
    b: m.byBall,
    p: m.parts.map((v) => [v.kit, v.sample, v.pan, v.gain]),
    y: m.byHeight ? 1 : 0,
    c: [m.catches.on ? 1 : 0, m.catches.sample],
    d: [m.crossAccent.velocity, m.crossAccent.downbeat],
    f: [m.filter.on ? 1 : 0, m.filter.low, m.filter.high],
    a: [m.pad.on ? 1 : 0, m.pad.instrument, m.pad.chord],
  };
}

/** `partCount`, when the caller knows it, gives a preset name the voices for that many parts. */
export function decodeMapping(value: unknown, partCount?: number): Mapping {
  if (typeof value === 'string') {
    const name = PRESET_NAMES.find((n) => n === value);
    const base = name ? applyPreset(name) : DEFAULT_MAPPING;
    return partCount === undefined ? base : withPartCount(base, partCount);
  }
  if (!isRecord(value)) return DEFAULT_MAPPING;
  const d = DEFAULT_MAPPING;
  const sample = (v: unknown, fallback: Sample): Sample =>
    v === null ? null : typeof v === 'string' && KIT_SAMPLES.includes(v) ? v : fallback;
  const bool = (v: unknown, fallback: boolean) => (v === 1 || v === 0 ? v === 1 : fallback);
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const pick = <T extends string>(v: unknown, ids: readonly T[], fallback: T): T =>
    ids.find((id) => id === v) ?? fallback;

  const h = arr(value.h);
  const perHeight = Object.fromEntries(
    Array.from({ length: MAX_HEIGHT }, (_, i) => [i + 1, sample(h[i], d.perHeight[i + 1] ?? null)]),
  );
  // byBall: an explicit null means none; a list of known sounds is used; anything else (missing,
  // wrong type, empty, one unknown sound) falls back to the default mapping's, silently.
  const b = value.b;
  const byBall =
    b === null
      ? null
      : Array.isArray(b) && b.length > 0 && b.every((s) => typeof s === 'string' && KIT_SAMPLES.includes(s))
        ? (b as string[])
        : d.byBall;

  const voice = (kit: unknown, smp: unknown, pan: unknown, gain: unknown, i: number): PartVoice => {
    const f = d.parts[i] ?? voiceForNewPart(d, i);
    return {
      kit: pick(kit, KIT_IDS, f.kit),
      sample: sample(smp, f.sample),
      pan: numberIn(pan, PAN_RANGE.min, PAN_RANGE.max, f.pan),
      gain: numberIn(gain, GAIN_RANGE.min, GAIN_RANGE.max, f.gain),
    };
  };
  const p = arr(value.p).slice(0, MAX_MAPPING_PARTS);
  const v = arr(value.v).slice(0, MAX_MAPPING_PARTS);
  const parts =
    p.length > 0
      ? p.map((entry, i) => {
          const [kit, smp, pan, gain] = arr(entry);
          return voice(kit, smp, pan, gain, i);
        })
      : v.length > 0
        ? v.map((entry, i) => {
            const [pan, gain] = arr(entry);
            return voice(undefined, undefined, pan, gain, i);
          })
        : d.parts;
  const [catchOn, catchSample] = arr(value.c);
  const [velocity, downbeat] = arr(value.d);
  const [filterOn, low, high] = arr(value.f);
  const [padOn, instrument, chord] = arr(value.a);
  return {
    parts,
    // A link from before parts read height, as every mapping then did.
    byHeight: bool(value.y, p.length === 0 && v.length > 0 ? true : d.byHeight),
    perHeight,
    byBall,
    catches: { on: bool(catchOn, d.catches.on), sample: sample(catchSample, d.catches.sample) },
    crossAccent: {
      velocity: numberIn(velocity, CROSS_BOOST_RANGE.min, CROSS_BOOST_RANGE.max, d.crossAccent.velocity),
      downbeat: sample(downbeat, d.crossAccent.downbeat),
    },
    filter: {
      on: bool(filterOn, d.filter.on),
      low: numberIn(low, FILTER_HZ_RANGE.min, FILTER_HZ_RANGE.max, d.filter.low),
      high: numberIn(high, FILTER_HZ_RANGE.min, FILTER_HZ_RANGE.max, d.filter.high),
    },
    pad: {
      on: bool(padOn, d.pad.on),
      instrument: pick(instrument, PAD_INSTRUMENT_IDS, d.pad.instrument),
      chord: pick(chord, PAD_CHORD_IDS, d.pad.chord),
    },
  };
}

/** `value` if it is a finite number, clamped to [min, max]; else the fallback. */
function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
