// Mappings for tests of the player, the drum machine and `hitFor`, which read a Mapping however it
// was made. They are the v4 presets as `mappingOf` builds them (docs/plans/v5-sound-model.md,
// ruling 2), on today's kick and snare voices, so those tests read as they always have.
// `VOICE_PER_PART` is the rule v5 dropped from every list: hitFor still plays a part's own sound
// when a mapping does not read height, so its tests keep one.
import { mappingOf, type Listen } from '../sound/drummers';
import type { Mapping, PartVoice } from '../sound/mapping';

/** What every v4 preset switched on: the downbeat clap, nothing else. */
export const PRESET_ALSO = { catches: false, downbeat: true, pad: false } as const;

const VOICES: readonly PartVoice[] = [
  { kit: 'TR-808', sample: 'kick', pan: -0.6, gain: 1 },
  { kit: 'TR-808', sample: 'snare', pan: 0.6, gain: 1 },
];

const preset = (listen: Listen): Mapping => ({ ...mappingOf(listen, PRESET_ALSO, 0, 2), parts: VOICES });

export const HEIGHT_DRUM = preset('height');
export const HEIGHT_PITCH = preset('pitch');
export const BALL_PITCH = preset('ball');
export const VOICE_PER_PART: Mapping = { ...HEIGHT_DRUM, byHeight: false };
