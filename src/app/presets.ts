// The preset cards as data (docs/POLYRHYTHMS.md "Preset table", docs/plans/model-rethink.md §10):
// the five juggling cards, then the sourcebook's rows. Pure: no DOM, no timers. Reader-facing
// words (names, source lines, "listen for") are in `copy.presets`, keyed by `id`.
import { onsetsOf, partsFromLines, partsFromOnsets, partsFromVanilla, ratioSpacings, withPhase } from '../core';
import type { Part, Parts, PartsResult, Ratio } from '../core';
import { applyPreset } from '../sound/mapping';
import type { Mapping, Sample } from '../sound/mapping';

export interface Preset {
  readonly id: string;
  /** Juggling cards are tapped for the picture and play height to drum; sourcebook rows are tapped for the rhythm and play voice per part. */
  readonly kind: 'juggling' | 'sourcebook';
  /** The line of each hand as written in the sourcebook (digits, zeros for rests); a vanilla card has the one siteswap. */
  readonly texts: readonly string[];
  readonly parts: Parts;
  readonly ratio: Ratio;
  /** Tempo the card loads; null leaves the reader's tempo alone (the juggling cards). */
  readonly bpm: number | null;
  readonly mapping: Mapping;
  /** The page the source line links to, or null when the grid is the standard one and no page was opened for it. */
  readonly sourceUrl: string | null;
  /** Balls the pattern carries: the juggling card's own, or one per one-ball line. */
  readonly balls: number;
  /** Cycle in pulses. */
  readonly cycle: number;
  /** In the default card set; the rest sit behind "more". */
  readonly first: boolean;
}

const must = (r: PartsResult): Parts => {
  if (!r.ok) throw new Error(`preset does not read: ${JSON.stringify(r.error)}`);
  return r.parts;
};

const HEIGHT_DRUM = applyPreset('height-drum');
const SITESWAP_URL = 'https://solipsys.co.uk/new/SiteSwap.html';

/** A juggling card: a vanilla siteswap at 1:1, one line per hand otherwise. Plays height to drum (design §7). */
function juggling(id: string, texts: readonly string[], ratio: Ratio, balls: number, cycle: number): Preset {
  const parts = ratio.a === ratio.b ? must(partsFromVanilla(texts[0] as string)) : must(partsFromLines(texts, ratio));
  return { id, kind: 'juggling', texts, parts, ratio, bpm: null, mapping: HEIGHT_DRUM, sourceUrl: SITESWAP_URL, balls, cycle, first: true };
}

interface Row {
  readonly id: string;
  readonly texts: readonly [string, string];
  readonly ratio: Ratio;
  readonly bpm: number;
  /** One 808 sample per hand. */
  readonly voices: readonly [Sample, Sample];
  readonly sourceUrl: string | null;
  readonly cycle: number;
  readonly first: boolean;
  /** Hand `part` starts `pulses` pulses late (design §4). */
  readonly phase?: { readonly part: number; readonly pulses: number };
}

/** Voice per part (design §7) with the row's drums in place of kick and snare; pan and gain stay. */
function voiced(voices: readonly Sample[]): Mapping {
  const base = applyPreset('voice-per-part');
  return { ...base, parts: base.parts.map((p, i) => ({ ...p, sample: voices[i] as Sample })) };
}

/** A sourcebook row: each line of hits is a default part (one ball, the gap to the next hit), so the k knob works. */
function sourcebook(row: Row): Preset {
  const lines = row.texts.map((t) => t.split(' ').map((d) => d !== '0'));
  const made = partsFromOnsets(lines, ratioSpacings(row.ratio));
  const parts = row.phase ? withPhase(made, row.phase.part, row.phase.pulses, 1) : made;
  const { id, texts, ratio, bpm, sourceUrl, cycle, first } = row;
  return { id, kind: 'sourcebook', texts, parts, ratio, bpm, mapping: voiced(row.voices), sourceUrl, balls: parts.length, cycle, first };
}

const R = (a: number, b: number): Ratio => ({ a, b });
const PULSE16 = '4 0 0 0 4 0 0 0 4 0 0 0 4 0 0 0';
const SON = '3 0 0 3 0 0 4 0 0 0 2 0 4 0 0 0';
const URLS = {
  bell: 'https://ancient-future.com/bellclap.html',
  hein: 'https://ethanhein.substack.com/p/why-is-son-clave-so-awesome',
  clapping: 'https://en.wikipedia.org/wiki/Clapping_Music',
  allen: 'https://moderndrummer.com/2011/10/tony-allen-afrobeat-innovator',
  kotekan: 'https://en.wikipedia.org/wiki/Kotekan',
  mbira: 'https://afropop.org/articles/phantom-patterns-martin-scherzinger-on-shona-mbira-music',
  blade: 'https://notebook.zoeblade.com/Polymetre_and_polyrhythm.html',
  toussaint2005: 'https://cgm.cs.mcgill.ca/~godfried/publications/banff.pdf',
} as const;

// The sourcebook's table, row by row. The 808 voices are the table's, or the stand-in the sound
// palette names where the table asks for a Soundfont voice (mbira: cowbell / low tom). A "pluck"
// or "pitched voice" has no 808 stand-in in the palette; clave, cowbell and a conga are the
// nearest short pitched drums and carry those rows until the kits wave. The table's "Three
// against two" row is the polyrhythm card above. "Eno drift" is left out: it wants a sustained
// pad on both hands, and the palette names no 808 stand-in for one.
const ROWS: readonly Row[] = [
  { id: 'bell', texts: ['2 0 2 0 1 2 0 2 0 2 0 1', '1'], ratio: R(4, 1), bpm: 120, voices: ['cowbell', 'tom-low'], sourceUrl: URLS.bell, cycle: 12, first: true },
  { id: 'son-clave', texts: [SON, PULSE16], ratio: R(1, 1), bpm: 95, voices: ['rimshot', 'kick'], sourceUrl: URLS.hein, cycle: 16, first: true },
  {
    id: 'clapping',
    texts: ['1 1 2 0 1 2 0 2 0 1 2 0', '1 1 2 0 1 2 0 2 0 1 2 0'],
    ratio: R(1, 1),
    bpm: 160,
    voices: ['clap', 'clap'],
    sourceUrl: URLS.clapping,
    cycle: 12,
    first: true,
    phase: { part: 1, pulses: 3 },
  },
  { id: 'afrobeat', texts: ['3 0 0 3 0 0 2 0 3 0 0 3 0 0 2 0', '4 0 0 0 2 0 2 0 4 0 0 0 4 0 0 0'], ratio: R(1, 1), bpm: 105, voices: ['hihat-close', 'kick'], sourceUrl: URLS.allen, cycle: 16, first: true },
  { id: 'rumba', texts: ['3 0 0 4 0 0 0 3 0 0 2 0 4 0 0 0', PULSE16], ratio: R(1, 1), bpm: 95, voices: ['rimshot', 'kick'], sourceUrl: null, cycle: 16, first: false },
  { id: 'cascara', texts: ['2 0 1 2 0 2 0 1 2 0 2 0 1 2 0 1', SON], ratio: R(1, 1), bpm: 95, voices: ['hihat-close', 'rimshot'], sourceUrl: null, cycle: 16, first: false },
  { id: 'kotekan', texts: ['1 2 0 1 2 0 1 2 0 1 2 0', '0 1 2 0 1 2 0 1 2 0 1 2'], ratio: R(1, 1), bpm: 180, voices: ['cowbell', 'clave'], sourceUrl: URLS.kotekan, cycle: 12, first: false },
  { id: 'hocket', texts: ['2 0', '0 2'], ratio: R(1, 1), bpm: 200, voices: ['conga-hi', 'conga-low'], sourceUrl: URLS.kotekan, cycle: 2, first: false },
  { id: 'nadai', texts: ['1', '1'], ratio: R(5, 4), bpm: 60, voices: ['clave', 'kick'], sourceUrl: null, cycle: 20, first: false },
  { id: 'tihai', texts: ['2 0 1 2 0 2 0 1 2 0 2 0 1 3 0 0', PULSE16], ratio: R(1, 1), bpm: 100, voices: ['snare', 'kick'], sourceUrl: null, cycle: 16, first: false },
  {
    id: 'mbira',
    texts: ['3 0 0 3 0 0 3 0 0 3 0 0', '3 0 0 3 0 0 3 0 0 3 0 0'],
    ratio: R(1, 1),
    bpm: 130,
    voices: ['cowbell', 'tom-low'],
    sourceUrl: URLS.mbira,
    cycle: 12,
    first: false,
    phase: { part: 1, pulses: 1 },
  },
  { id: 'trance', texts: ['1', '1'], ratio: R(3, 4), bpm: 138, voices: ['clave', 'kick'], sourceUrl: URLS.blade, cycle: 12, first: false },
  { id: 'acid', texts: ['1', '1'], ratio: R(16, 3), bpm: 128, voices: ['clave', 'hihat-close'], sourceUrl: URLS.blade, cycle: 48, first: false },
  { id: 'blue-rondo', texts: ['2 0 2 0 2 0 3 0 0', '3 0 0 3 0 0 3 0 0'], ratio: R(1, 1), bpm: 180, voices: ['hihat-close', 'snare'], sourceUrl: URLS.toussaint2005, cycle: 9, first: false },
  { id: 'pyramid', texts: ['3 0 0 3 0 0 4 0 0 0 3 0 0 3 0 0', PULSE16], ratio: R(1, 1), bpm: 80, voices: ['conga-mid', 'kick'], sourceUrl: null, cycle: 16, first: false },
  { id: 'elvin', texts: ['1', '1'], ratio: R(3, 2), bpm: 200, voices: ['hihat-open', 'kick'], sourceUrl: null, cycle: 6, first: false },
  { id: 'discipline', texts: ['1', '1'], ratio: R(5, 7), bpm: 120, voices: ['clave', 'cowbell'], sourceUrl: null, cycle: 35, first: false },
];

/** The cards in order: the five juggling cards, the sourcebook's first four (its fifth row is the polyrhythm card), then the rest. */
export const PRESETS: readonly Preset[] = [
  juggling('cascade', ['3'], R(1, 1), 3, 2),
  juggling('pause', ['441'], R(1, 1), 3, 6),
  juggling('classic', ['531'], R(1, 1), 3, 6),
  juggling('ramp', ['97531'], R(1, 1), 5, 10),
  juggling('polyrhythm', ['2 2x 2', '2x 2'], R(3, 2), 4, 6),
  ...ROWS.map(sourcebook),
];

/** A part's onsets over one period as a hit grid: `x` a hit, `.` a rest. */
export function hitGrid(part: Part): string {
  return onsetsOf(part)
    .map((on) => (on ? 'x' : '.'))
    .join('');
}

const sameStructure = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => sameStructure((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/** True when `parts` are exactly the preset's parts, field for field. */
export const isPresetParts = (preset: Preset, parts: Parts): boolean => sameStructure(preset.parts, parts);
