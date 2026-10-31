// The now-playing strip on the card screen (v3 stream C2), headless: what each control shows for a
// state, and the edit each makes. Pure: no DOM. `mount-first-minute.ts` is the elements.
import { presetOf } from '../sound/mapping';
import type { PresetName } from '../sound/mapping';
import { BPM_RANGE, KIT_IDS, TEMPO_STEP } from '../tunables';
import type { Action } from './actions';
import type { MappingEdit } from './sound-panel-model';
import type { AppState } from './state';

export interface NowPlaying {
  /** The kit every part shares, or 'mixed' when the parts' kits differ (the passing cards). */
  readonly kit: string;
  /** The preset the mapping is, or 'custom'. */
  readonly preset: PresetName | 'custom';
  readonly bpm: number;
  readonly canSlower: boolean;
  readonly canFaster: boolean;
}

export function nowPlaying(state: Pick<AppState, 'mapping' | 'bpm'>): NowPlaying {
  const kits = new Set(state.mapping.parts.map((v) => v.kit));
  const only = kits.size === 1 ? [...kits][0] : undefined;
  return {
    kit: kits.size > 1 ? 'mixed' : (only ?? KIT_IDS[0] ?? ''),
    preset: presetOf(state.mapping),
    bpm: state.bpm,
    canSlower: state.bpm > BPM_RANGE.min,
    canFaster: state.bpm < BPM_RANGE.max,
  };
}

/** The Sound tab's edit for a Kit choice. */
export const kitEdit = (kit: string): MappingEdit => ({ kind: 'kit', kit });

/** The Sound tab's edit for a Sound choice; it keeps the parts' kits. */
export const presetEdit = (name: PresetName): MappingEdit => ({ kind: 'preset', name });

/** The tempo action for a press of - (-1) or + (1): one step; the reducer clamps to BPM_RANGE. */
export const tempoAction = (bpm: number, direction: -1 | 1): Action => ({ type: 'setBpm', bpm: bpm + direction * TEMPO_STEP });
