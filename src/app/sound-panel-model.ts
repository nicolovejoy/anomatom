// The sound panel's logic (SPEC §4.3), pure: no DOM, no timers. Every control is one
// `MappingEdit`; `applyEdit` turns the current Mapping and an edit into the next Mapping. The
// panel is the only thing that edits the Mapping (docs/plans/v1-parallel.md, rulings).
//
// An edit that changes nothing (the same value, a number that is not one) returns the very
// same Mapping object, so the store hears nothing and nothing reloads.
import {
  applyPreset,
  presetOf,
  PRESET_NAMES,
  type Mapping,
  type PadChord,
  type PadInstrument,
  type PresetName,
  type Sample,
  withKitsOf,
  withPartCount,
} from '../sound/mapping';
import {
  CROSS_BOOST_RANGE,
  FILTER_HZ_RANGE,
  GAIN_RANGE,
  KIT_IDS,
  KIT_SAMPLES,
  MAX_HEIGHT,
  PAN_RANGE,
  SOUND_PANEL,
} from '../tunables';

export type MappingEdit =
  | { readonly kind: 'preset'; readonly name: PresetName }
  | { readonly kind: 'kit'; readonly kit: string }
  | { readonly kind: 'height'; readonly height: number; readonly sample: Sample }
  | { readonly kind: 'partSample'; readonly part: number; readonly sample: Sample }
  | { readonly kind: 'pan'; readonly part: number; readonly value: number }
  | { readonly kind: 'gain'; readonly part: number; readonly value: number }
  | { readonly kind: 'catchesOn'; readonly on: boolean }
  | { readonly kind: 'catchSample'; readonly sample: Sample }
  | { readonly kind: 'accent'; readonly velocity: number }
  | { readonly kind: 'downbeat'; readonly sample: Sample }
  | { readonly kind: 'filterOn'; readonly on: boolean }
  | { readonly kind: 'filterLow'; readonly hz: number }
  | { readonly kind: 'filterHigh'; readonly hz: number }
  | { readonly kind: 'padOn'; readonly on: boolean }
  | { readonly kind: 'padInstrument'; readonly instrument: PadInstrument }
  | { readonly kind: 'padChord'; readonly chord: PadChord };

const within = (value: number, range: { readonly min: number; readonly max: number }) =>
  Math.min(range.max, Math.max(range.min, value));

/** A sound the kit has, or null for none; anything else is refused (undefined). */
function knownSample(sample: Sample): Sample | undefined {
  return sample === null || KIT_SAMPLES.includes(sample) ? sample : undefined;
}

export function applyEdit(m: Mapping, edit: MappingEdit): Mapping {
  const next = edited(m, edit);
  return next !== undefined && JSON.stringify(next) !== JSON.stringify(m) ? next : m;
}

function edited(m: Mapping, edit: MappingEdit): Mapping | undefined {
  switch (edit.kind) {
    case 'preset':
      // The kit is not part of a preset (v2 wave 1, ruling 2): choosing one keeps the parts' kits.
      return PRESET_NAMES.includes(edit.name) ? withKitsOf(applyPreset(edit.name), m) : undefined;
    case 'kit':
      // The one Kit select sets every part (ruling 2); a per-part kit stays in the model for passing.
      return KIT_IDS.includes(edit.kit) ? { ...m, parts: m.parts.map((v) => ({ ...v, kit: edit.kit })) } : undefined;
    case 'height': {
      const sample = knownSample(edit.sample);
      if (sample === undefined || !Number.isInteger(edit.height) || edit.height < 1 || edit.height > MAX_HEIGHT) {
        return undefined;
      }
      // A ball-to-pitch list would override the height's sound, so choosing a height's sound ends it,
      // and a height's sound is only heard by a mapping that reads height.
      return { ...m, byHeight: true, byBall: null, perHeight: { ...m.perHeight, [edit.height]: sample } };
    }
    case 'partSample': {
      const sample = knownSample(edit.sample);
      if (sample === undefined || !m.parts[edit.part]) return undefined;
      // A part's own sound is only heard by a mapping that does not read height or ball.
      const parts = m.parts.map((v, i) => (i === edit.part ? { ...v, sample } : v));
      return { ...m, byHeight: false, byBall: null, parts };
    }
    case 'pan':
    case 'gain': {
      if (!Number.isFinite(edit.value) || !m.parts[edit.part]) return undefined;
      const value = within(edit.value, edit.kind === 'pan' ? PAN_RANGE : GAIN_RANGE);
      return { ...m, parts: m.parts.map((v, i) => (i === edit.part ? { ...v, [edit.kind]: value } : v)) };
    }
    case 'catchesOn':
      return { ...m, catches: { ...m.catches, on: edit.on } };
    case 'catchSample': {
      const sample = knownSample(edit.sample);
      return sample === undefined ? undefined : { ...m, catches: { ...m.catches, sample } };
    }
    case 'accent':
      return Number.isFinite(edit.velocity)
        ? { ...m, crossAccent: { ...m.crossAccent, velocity: Math.round(within(edit.velocity, CROSS_BOOST_RANGE)) } }
        : undefined;
    case 'downbeat': {
      const sample = knownSample(edit.sample);
      return sample === undefined ? undefined : { ...m, crossAccent: { ...m.crossAccent, downbeat: sample } };
    }
    case 'filterOn':
      return { ...m, filter: { ...m.filter, on: edit.on } };
    case 'filterLow':
    case 'filterHigh': {
      if (!Number.isFinite(edit.hz)) return undefined;
      const hz = Math.round(within(edit.hz, FILTER_HZ_RANGE));
      return { ...m, filter: { ...m.filter, [edit.kind === 'filterLow' ? 'low' : 'high']: hz } };
    }
    case 'padOn':
      return { ...m, pad: { ...m.pad, on: edit.on } };
    case 'padInstrument':
      return { ...m, pad: { ...m.pad, instrument: edit.instrument } };
    case 'padChord':
      return { ...m, pad: { ...m.pad, chord: edit.chord } };
  }
}

/** A `<select>` value for a sound: its name, or '' for none. */
export const sampleValue = (sample: Sample): string => sample ?? '';
export const sampleFromValue = (value: string): Sample => (value === '' ? null : value);

/** Sounds the downbeat dropdown offers (SPEC §4.3: clap, cowbell, none), plus the one a link may have set. */
export function downbeatChoices(current: Sample): readonly Sample[] {
  const base = SOUND_PANEL.downbeatChoices;
  return base.includes(current) ? base : [...base, current];
}

/** The preset "Reset to preset" returns to: the one the mapping equals, else the last one seen (the default at first). */
export function resetTarget(mapping: Mapping, lastPreset: PresetName): PresetName {
  const now = presetOf(mapping);
  return now === 'custom' ? lastPreset : now;
}

/** The mapping with a voice for each of `partCount` parts: grown from the rotation, never shrunk (a link's extra voices stay). */
export function ensureVoices(mapping: Mapping, partCount: number): Mapping {
  return partCount > mapping.parts.length ? withPartCount(mapping, partCount) : mapping;
}
