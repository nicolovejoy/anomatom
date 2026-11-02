// Old links' sound (docs/plans/v5-sound-model.md, ruling 6). `#v1.` and `#v2.` links carried a
// whole Mapping as `m`, and short links named a preset with `~name`; v5 keeps only what the sound
// follows, three switches and a drum machine shift. This reads an old `m` (or a preset name) into
// those, so every old link keeps opening. Pure. Junk never throws: whatever does not read is taken
// from what an old link meant by default (Voice per part, on the TR-808).
//
// What an old `m` was: a preset name; `{ n: name, k: kits }` (a preset on other kits, `k` one kit
// id or one per part); or an object of short keys:
//   h  nine samples for heights 1-9      b  the ball-to-pitch list, or null
//   p  per part: [kit, sample, pan, gain] y  byHeight (0|1)
//   c  [catches on (0|1), catch sample]  d  [cross accent velocity, downbeat sample]
//   a  [pad on (0|1), instrument, chord] (f and q, the filter and the pass, are dropped)
// `#v1.` links carry `v: [[pan, gain], …]` instead of `p` and `y`; they read height.
import { DEFAULT_KIT_SHIFT, DRUMMER_KITS, KIT_SAMPLES, LISTEN_RULES, MAX_HEIGHT } from '../tunables';
import type { Also, Listen } from './drummers';
import type { Sample } from './mapping';

/** The sound an old link asked for, and whether it asked for Voice per part (gone: read as height, with a notice). */
export interface LegacySound {
  readonly listen: Listen;
  readonly also: Also;
  readonly kitShift: number;
  readonly voicePerPart: boolean;
}

/** Old preset names, as `m` and as a short link's `~name`, and what each now follows. */
export const LEGACY_PRESETS: Readonly<Record<string, Listen>> = {
  'voice-per-part': 'height',
  'height-drum': 'height',
  'height-pitch': 'pitch',
  'ball-pitch': 'ball',
};

/** What every old preset switched on: the downbeat clap, nothing else. */
const PRESET_ALSO: Also = { catches: false, downbeat: true, pad: false };

const presetSound = (name: string, kitShift = DEFAULT_KIT_SHIFT): LegacySound => ({
  listen: Object.hasOwn(LEGACY_PRESETS, name) ? (LEGACY_PRESETS[name] as Listen) : 'height',
  also: PRESET_ALSO,
  kitShift,
  voicePerPart: !Object.hasOwn(LEGACY_PRESETS, name) || name === 'voice-per-part',
});

/** The index of a kit in DRUMMER_KITS, else the default shift. */
const shiftOf = (kit: unknown): number => {
  const i = DRUMMER_KITS.indexOf(kit as string);
  return i === -1 ? DEFAULT_KIT_SHIFT : i;
};

/** An old link's `m`, read by ruling 6. */
export function legacySound(value: unknown): LegacySound {
  if (typeof value === 'string') return presetSound(value);
  if (!isRecord(value)) return presetSound('voice-per-part');
  // Only a string names a preset: a nested `n` would recurse as deep as the link is long.
  if (typeof value.n === 'string') return presetSound(value.n, shiftOf(Array.isArray(value.k) ? value.k[0] : value.k));
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const bool = (v: unknown, fallback: boolean) => (v === 1 || v === 0 ? v === 1 : fallback);
  const known = (v: unknown): v is string => typeof v === 'string' && KIT_SAMPLES.includes(v);
  const p = arr(value.p);
  // A link from before parts read height, as every mapping then did; else the default, Voice per part, did not.
  const byHeight = bool(value.y, p.length === 0 && arr(value.v).length > 0);
  const b = value.b;
  const byBall = Array.isArray(b) && b.length > 0 && b.every(known);
  const h = arr(value.h);
  const pitch = LISTEN_RULES.pitch.perHeight;
  const height = LISTEN_RULES.height.perHeight;
  // Each height's sample as the old decoder repaired it: a known sample or null, else the default's.
  const sampleAt = (i: number): Sample => (h[i] === null ? null : known(h[i]) ? h[i] : (height[i + 1] ?? null));
  const isPitch = Array.from({ length: MAX_HEIGHT }, (_, i) => sampleAt(i) === pitch[i + 1]).every(Boolean);
  const [catches] = arr(value.c);
  const [, downbeat] = arr(value.d);
  const [pad] = arr(value.a);
  return {
    listen: !byHeight ? 'height' : byBall ? 'ball' : isPitch ? 'pitch' : 'height',
    also: {
      catches: bool(catches, false),
      // null: no clap; a sound: a clap (of some kind); missing or junk: the default's clap.
      downbeat: downbeat !== null,
      pad: bool(pad, false),
    },
    kitShift: shiftOf(arr(p[0])[0]),
    voicePerPart: !byHeight,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
