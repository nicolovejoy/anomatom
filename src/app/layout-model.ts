// The wide layout (docs/plans/v5-sound-model.md, ruling 8), headless: which panel shows beside
// the stage, how it stays in step with the sheet's tab, and what the deck's keys do. Pure: no
// DOM, no timers. mount-layout.ts and mount-deck.ts are the elements.
//
// The top bar's choice is `AppState.panel`: Patterns (the wheel, then the Pattern and Rhythm
// tabs), Sound (the Sound panel alone), or Stage (no panel). The sheet's tab and the panel move
// together: a tab opened from anywhere (Make your own, a phone's Details) picks its panel, and a
// panel picked in the top bar opens its tab.
import { LISTENS, type Listen } from '../sound/drummers';
import { stepKey, type KeyTarget, type Modifiers } from './deck-model';
import type { AppState, Deriver, Panel, SheetTab } from './state';

/** The top bar's choices, in order. */
export const PANELS: readonly Panel[] = ['patterns', 'sound', 'stage'];

/** The panel a sheet tab lives in: Sound in Sound, Pattern and Rhythm under Patterns. */
export const panelOfTab = (tab: SheetTab): Panel => (tab === 'sound' ? 'sound' : 'patterns');

/** Whether the right-hand column shows at all: every panel but Stage. */
export const columnShown = (panel: Panel): boolean => panel !== 'stage';

/**
 * Keeps `panel` and `sheetTab` in step, as a store deriver. A new panel opens its tab (Patterns
 * goes back to Pattern or Rhythm, whichever was open last; Stage leaves the tab be); else a newly
 * opened tab picks its panel. A closed phone sheet (a null tab) moves nothing.
 */
export function createPanelSync(): Deriver {
  let lastPatternTab: 'pattern' | 'rhythm' = 'pattern';
  return (next, previous) => {
    if (next.sheetTab === 'pattern' || next.sheetTab === 'rhythm') lastPatternTab = next.sheetTab;
    if (next.panel !== previous.panel) {
      if (next.panel === 'sound') return { sheetTab: 'sound' };
      if (next.panel === 'patterns' && (next.sheetTab === 'sound' || next.sheetTab === null)) return { sheetTab: lastPatternTab };
      return {};
    }
    if (next.sheetTab !== previous.sheetTab && next.sheetTab !== null) return { panel: panelOfTab(next.sheetTab) };
    return {};
  };
}

/** The Listen for choice one step on (↓) or back (↑) from `listen`, wrapping. */
export function nextListen(listen: Listen, delta: -1 | 1): Listen {
  const i = LISTENS.indexOf(listen);
  return LISTENS[(i + delta + LISTENS.length) % LISTENS.length] as Listen;
}

/** What a key does on the play view: step the pattern, or step Listen for. */
export type DeckKey = { readonly kind: 'step'; readonly delta: -1 | 1 } | { readonly kind: 'listen'; readonly delta: -1 | 1 };

/**
 * The deck's arrow keys: ← → step the pattern everywhere; ↑ ↓ step Listen for, only on the wide
 * layout where their key caps show. Never with a modifier (Shift picks throws on the digit pad)
 * and never in a control that keeps its arrows: a text field, a select, a slider, a tab.
 */
export function deckKey(key: string, target: KeyTarget, mods: Modifiers & { readonly shift: boolean }, web: boolean): DeckKey | null {
  const step = stepKey(key, target, mods);
  if (step !== null) return { kind: 'step', delta: step };
  if (!web || mods.ctrl || mods.meta || mods.alt || mods.shift || target !== 'other') return null;
  if (key === 'ArrowUp') return { kind: 'listen', delta: -1 };
  if (key === 'ArrowDown') return { kind: 'listen', delta: 1 };
  return null;
}

/**
 * What the store takes when the layout changes. The wide layout has no mute button (the Sound
 * panel's Volume is its one sound control), so a mute set at phone width is cleared when the wide
 * layout takes over: never silent with nothing on screen to say why.
 */
export const layoutPatch = (web: boolean): Partial<AppState> => (web ? { muted: false } : {});

/** The media query for the wide layout: at least `minWidth` wide and `minHeight` tall. */
export const webMedia = (minWidth: number, minHeight: number): string => `(min-width: ${minWidth}px) and (min-height: ${minHeight}px)`;
