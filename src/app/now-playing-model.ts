// The deck's Kit and Sound selects (v3 stream C2's strip, kept by docs/plans/v4-deck.md ruling 1),
// headless: what each shows for a state, and the edit each makes. Pure: no DOM. `mount-deck.ts`
// is the elements.
import { presetOf } from '../sound/mapping';
import type { PresetName } from '../sound/mapping';
import { KIT_IDS } from '../tunables';
import type { MappingEdit } from './sound-panel-model';
import type { AppState } from './state';

export interface NowPlaying {
  /** The kit every part shares, or 'mixed' when the parts' kits differ (the passing cards). */
  readonly kit: string;
  /** The preset the mapping is, or 'custom'. */
  readonly preset: PresetName | 'custom';
}

export function nowPlaying(state: Pick<AppState, 'mapping'>): NowPlaying {
  const kits = new Set(state.mapping.parts.map((v) => v.kit));
  const only = kits.size === 1 ? [...kits][0] : undefined;
  return {
    kit: kits.size > 1 ? 'mixed' : (only ?? KIT_IDS[0] ?? ''),
    preset: presetOf(state.mapping),
  };
}

/** The Sound tab's edit for a Kit choice. */
export const kitEdit = (kit: string): MappingEdit => ({ kind: 'kit', kit });

/** The Sound tab's edit for a Sound choice; it keeps the parts' kits. */
export const presetEdit = (name: PresetName): MappingEdit => ({ kind: 'preset', name });

