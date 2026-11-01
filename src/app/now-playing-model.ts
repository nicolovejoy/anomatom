// The deck's Kit and Sound selects (v3 stream C2's strip, kept by docs/plans/v4-deck.md ruling 1),
// headless: what each shows for a state, and the edit each makes. Pure: no DOM. `mount-deck.ts`
// is the elements.
import { isPresetMapping, PRESET_NAMES, withPartCount } from '../sound/mapping';
import type { Mapping, PartVoice, PresetName } from '../sound/mapping';
import { KIT_IDS, PRESET_MAPPINGS } from '../tunables';
import { copy } from '../ui/copy';
import type { MappingEdit } from './sound-panel-model';
import type { AppState } from './state';

export interface NowPlaying {
  /** The kit every part shares, or 'mixed' when the parts' kits differ (the passing cards). */
  readonly kit: string;
  /** What the Kit select shows for 'mixed': the kits' short names in order of first appearance, "TR-808 / LM-2". Empty otherwise. */
  readonly kitLabel: string;
  /** The preset whose rule the mapping follows, parts' kit, pan and gain aside (`soundOf`), or 'custom'. */
  readonly preset: PresetName | 'custom';
}

export function nowPlaying(state: Pick<AppState, 'mapping'>): NowPlaying {
  const kits = [...new Set(state.mapping.parts.map((v) => v.kit))];
  const mixed = kits.length > 1;
  return {
    kit: mixed ? 'mixed' : (kits[0] ?? KIT_IDS[0] ?? ''),
    kitLabel: mixed ? kits.map((k) => copy.kitShortNames[k] ?? k).join(copy.deck.kitJoin) : '',
    preset: soundOf(state.mapping),
  };
}

/**
 * The preset whose rule a mapping follows, reading each part's sample but not its kit, pan or gain
 * (those are Kit's and Details'), or 'custom' (docs/plans/v4-1-polish.md, ruling 3). So a passing
 * card, height to drum with a kit and a pan for each juggler, reads "Height to drum". A display
 * match only: `presetOf`, which the short link's `~name` reads, still counts pan and gain.
 */
export function soundOf(mapping: Mapping): PresetName | 'custom' {
  return (
    PRESET_NAMES.find((name) => {
      const preset = withPartCount(PRESET_MAPPINGS[name], mapping.parts.length);
      const ruled = mapping.parts.map((v, i) => {
        const p = preset.parts[i] as PartVoice;
        return { ...v, kit: p.kit, pan: p.pan, gain: p.gain };
      });
      return isPresetMapping({ ...mapping, parts: ruled }, name);
    }) ?? 'custom'
  );
}

/** The Sound tab's edit for a Kit choice. */
export const kitEdit = (kit: string): MappingEdit => ({ kind: 'kit', kit });

/** The Sound tab's edit for a Sound choice; it keeps the parts' kits. */
export const presetEdit = (name: PresetName): MappingEdit => ({ kind: 'preset', name });

