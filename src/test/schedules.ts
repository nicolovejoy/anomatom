// Test fakes: parts and schedules from pattern text, the way the knobs make them. Only tests
// import this; it is not part of the app.
import { buildSchedule, partsFromLines, partsFromVanilla } from '../core';
import type { Parts, Ratio, Schedule } from '../core';
import { reduce } from '../app/actions';
import { defaultState, type AppState } from '../app/state';

/** One vanilla siteswap as two parts (at 1:1); throws on text that does not read. */
export function vanillaParts(text: string): Parts {
  const r = partsFromVanilla(text);
  if (!r.ok) throw new Error(`not vanilla: ${text}`);
  return r.parts;
}

/** One text per hand in one-hand counting at `ratio`; throws on text that does not read. */
export function lineParts(texts: readonly string[], ratio: Ratio): Parts {
  const r = partsFromLines(texts, ratio);
  if (!r.ok) throw new Error(`not lines: ${texts.join(' / ')}`);
  return r.parts;
}

/** The pattern as the knobs read it: at 1:1 hand 1's text is vanilla, otherwise one text per hand. */
export function partsOf(texts: readonly string[], ratio: Ratio = { a: 1, b: 1 }): Parts {
  return ratio.a === ratio.b ? vanillaParts(texts[0] as string) : lineParts(texts, ratio);
}

/** `buildSchedule` of `partsOf`. */
export function scheduleOf(texts: readonly string[] | string, ratio: Ratio = { a: 1, b: 1 }): Schedule {
  return buildSchedule(partsOf(typeof texts === 'string' ? [texts] : texts, ratio));
}

/** The default state with the ratio set and each input typed, through `reduce` as the knobs do. At 1:1 only the first text is typed. */
export function typed(texts: readonly string[], ratio: Ratio = { a: 1, b: 1 }, from: AppState = defaultState()): AppState {
  let s = reduce(from, { type: 'setRatio', ratio });
  const inputs = ratio.a === ratio.b ? texts.slice(0, 1) : texts;
  inputs.forEach((text, part) => (s = reduce(s, { type: 'editDraft', part, text })));
  return s;
}
