// The phone sheet's logic (docs/plans/phone-sheet.md, stream A), pure: no DOM, no timers.
// mount-sheet.ts and mount-knobs.ts turn these values into elements.
//
// `AppState.sheetTab` is which tab is open, or null when the sheet is closed. On a wide screen
// the sheet is a column that is always open, so a null there shows the last tab instead.
import type { Ratio } from '../core/types';
import { copy } from '../ui/copy';
import { oneInput } from './actions';
import type { Analysis } from './knobs-model';
import { hand2Bpm } from './knobs-model';
import type { SheetTab } from './state';

export const TABS: readonly SheetTab[] = ['pattern', 'rhythm', 'sound'];

/** The tab on screen: the open one; on a wide screen, the last one when none is open. */
export function shownTab(open: SheetTab | null, last: SheetTab, wide: boolean): SheetTab | null {
  return open ?? (wide ? last : null);
}

/** A tab pressed. On a phone the open tab's own press closes the sheet; a wide column never closes. */
export function pressTab(open: SheetTab | null, tab: SheetTab, wide: boolean): SheetTab | null {
  return !wide && open === tab ? null : tab;
}

/**
 * The handle let go after moving `dy` pixels (down is positive). Past `threshold` a drag down
 * closes and a drag up opens on the last tab; anything shorter is a tap, which toggles.
 */
export function dragEnd(open: SheetTab | null, last: SheetTab, dy: number, threshold: number): SheetTab | null {
  if (dy > threshold) return null;
  if (dy < -threshold) return open ?? last;
  return open === null ? last : null;
}

/** Whether Space belongs to a focused control: a select, a text or number input, a textarea. */
export function keepsSpace(tagName: string, inputType: string | null): boolean {
  const tag = tagName.toLowerCase();
  if (tag === 'select' || tag === 'textarea') return true;
  return tag === 'input' && (inputType === 'text' || inputType === 'number');
}

/** Home and End in the tab list: the first or last tab. */
export function edgeTab(edge: 'first' | 'last'): SheetTab {
  return TABS[edge === 'first' ? 0 : TABS.length - 1] as SheetTab;
}

/** Arrow keys in the tab list: the next or previous tab, wrapping. */
export function stepTab(tab: SheetTab, step: 1 | -1): SheetTab {
  const i = TABS.indexOf(tab);
  return TABS[(i + step + TABS.length) % TABS.length] as SheetTab;
}

export interface Summary {
  /** The pattern as typed; at other ratios than 1:1, both hands with a slash between. */
  readonly text: string;
  /** "3 balls · 120 bpm"; "4 balls" when the pattern is long; "can't juggle" when invalid. */
  readonly meta: string;
  readonly valid: boolean;
  /** Long patterns are drawn smaller. */
  readonly long: boolean;
}

/** What the closed sheet's summary button says. */
export function summary(a: Analysis, bpm: number, longChars: number): Summary {
  const trimmed = a.inputs.map((t) => t.trim());
  const text = trimmed.every((t) => t === '') ? copy.summaryEmpty : trimmed.join(' / ');
  const long = text.length >= longChars;
  if (a.balls === null) return { text, meta: copy.summaryCantJuggle, valid: false, long };
  return { text, meta: long ? copy.summaryBalls(a.balls) : copy.summaryMeta(a.balls, bpm), valid: true, long };
}

/** The two lines under the tempo slider: each hand's bpm, or at 1:1 a hand's and the shared beat's. */
export function tempoLines(bpm: number, ratio: Ratio): [string, string] {
  if (oneInput(ratio)) return [copy.tempoEach(bpm), copy.tempoShared(bpm * 2)];
  return [copy.tempoHand(0, bpm), copy.tempoHand(1, hand2Bpm(bpm, ratio))];
}

/** Whether a ratio has its own chip; the steppers show for every other one. */
export function hasChip(ratio: Ratio, chips: readonly (readonly [number, number])[]): boolean {
  return chips.some(([a, b]) => a === ratio.a && b === ratio.b);
}

/** How far along a slider's track `value` sits, 0 to 100, for the filled part of the track. */
export function fillPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}
