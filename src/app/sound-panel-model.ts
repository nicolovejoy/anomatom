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
} from '../sound/mapping';
import { CROSS_BOOST_RANGE, FILTER_HZ_RANGE, GAIN_RANGE, KIT_SAMPLES, MAX_HEIGHT, PAN_RANGE } from '../tunables';

export type MappingEdit =
  | { readonly kind: 'preset'; readonly name: PresetName }
  | { readonly kind: 'height'; readonly height: number; readonly sample: Sample }
  | { readonly kind: 'pan'; readonly hand: 0 | 1; readonly value: number }
  | { readonly kind: 'gain'; readonly hand: 0 | 1; readonly value: number }
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
      return PRESET_NAMES.includes(edit.name) ? applyPreset(edit.name) : undefined;
    case 'height': {
      const sample = knownSample(edit.sample);
      if (sample === undefined || !Number.isInteger(edit.height) || edit.height < 1 || edit.height > MAX_HEIGHT) {
        return undefined;
      }
      // A ball-to-pitch list would override the height's sound, so choosing a height's sound ends it.
      return { ...m, byBall: null, perHeight: { ...m.perHeight, [edit.height]: sample } };
    }
    case 'pan':
    case 'gain': {
      if (!Number.isFinite(edit.value)) return undefined;
      const value = within(edit.value, edit.kind === 'pan' ? PAN_RANGE : GAIN_RANGE);
      const hands = m.hands.map((v, h) => (h === edit.hand ? { ...v, [edit.kind]: value } : v));
      return { ...m, hands: hands as unknown as Mapping['hands'] };
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
  const base: Sample[] = ['clap', 'cowbell', null];
  return base.includes(current) ? base : [...base, current];
}

/** The preset "Reset to preset" returns to: the one the mapping equals, else the last one seen (the default at first). */
export function resetTarget(mapping: Mapping, lastPreset: PresetName): PresetName {
  const now = presetOf(mapping);
  return now === 'custom' ? lastPreset : now;
}
