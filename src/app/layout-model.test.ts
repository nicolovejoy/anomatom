import { describe, expect, test } from 'vitest';
import { DEFAULT_PANEL } from '../tunables';
import { columnShown, createPanelSync, deckKey, layoutPatch, nextListen, PANELS, panelOfTab, webMedia } from './layout-model';
import { createStore } from './state';

const none = { ctrl: false, meta: false, alt: false, shift: false };

describe('panels', () => {
  test('three choices, in the top bar’s order; a first visit opens on the patterns', () => {
    expect(PANELS).toEqual(['patterns', 'sound', 'stage']);
    expect(DEFAULT_PANEL).toBe('patterns');
    expect(createStore().get().panel).toBe('patterns');
  });
  test('a tab’s panel; the column shows for every panel but Stage', () => {
    expect(panelOfTab('pattern')).toBe('patterns');
    expect(panelOfTab('rhythm')).toBe('patterns');
    expect(panelOfTab('sound')).toBe('sound');
    expect(PANELS.map(columnShown)).toEqual([true, true, false]);
  });
  test('the wide layout clears a mute, since it has no mute button; the phone keeps it', () => {
    expect(layoutPatch(true)).toEqual({ muted: false });
    expect(layoutPatch(false)).toEqual({});
  });
  test('the wide-layout query', () => {
    expect(webMedia(760, 560)).toBe('(min-width: 760px) and (min-height: 560px)');
  });
});

describe('createPanelSync', () => {
  const store = () => {
    const s = createStore();
    s.derive(createPanelSync());
    return s;
  };

  test('Sound opens the Sound tab; Patterns goes back to the tab open last under it', () => {
    const s = store();
    s.set({ sheetTab: 'rhythm' });
    expect(s.get().panel).toBe('patterns');
    s.set({ panel: 'sound' });
    expect(s.get().sheetTab).toBe('sound');
    s.set({ panel: 'patterns' });
    expect(s.get().sheetTab).toBe('rhythm');
  });
  test('Patterns from a closed sheet opens Pattern; from an open Pattern tab, stays', () => {
    const s = store();
    s.set({ panel: 'stage' });
    expect(s.get().sheetTab).toBeNull();
    s.set({ panel: 'patterns' });
    expect(s.get().sheetTab).toBe('pattern');
    s.set({ panel: 'stage' });
    expect(s.get().sheetTab).toBe('pattern');
    s.set({ panel: 'patterns' });
    expect(s.get().sheetTab).toBe('pattern');
  });
  test('a tab opened from elsewhere picks its panel, from Stage too; a closed sheet moves nothing', () => {
    const s = store();
    s.set({ panel: 'stage' });
    s.set({ sheetTab: 'sound' });
    expect(s.get().panel).toBe('sound');
    s.set({ sheetTab: 'pattern' });
    expect(s.get().panel).toBe('patterns');
    s.set({ sheetTab: null });
    expect(s.get().panel).toBe('patterns');
    // Nothing about the tab or the panel: nothing moves.
    s.set({ bpm: 100 });
    expect(s.get()).toMatchObject({ panel: 'patterns', sheetTab: null });
  });
});

describe('nextListen', () => {
  test('↓ goes down the list, ↑ up, both wrapping', () => {
    expect(nextListen('height', 1)).toBe('ball');
    expect(nextListen('ball', 1)).toBe('pitch');
    expect(nextListen('pitch', 1)).toBe('height');
    expect(nextListen('height', -1)).toBe('pitch');
    expect(nextListen('ball', -1)).toBe('height');
  });
});

describe('deckKey', () => {
  test('← → step the pattern, wide or not', () => {
    for (const web of [true, false]) {
      expect(deckKey('ArrowLeft', 'other', none, web)).toEqual({ kind: 'step', delta: -1 });
      expect(deckKey('ArrowRight', 'other', none, web)).toEqual({ kind: 'step', delta: 1 });
    }
  });
  test('↑ ↓ step Listen for on the wide layout only, and never with Shift', () => {
    expect(deckKey('ArrowUp', 'other', none, true)).toEqual({ kind: 'listen', delta: -1 });
    expect(deckKey('ArrowDown', 'other', none, true)).toEqual({ kind: 'listen', delta: 1 });
    expect(deckKey('ArrowUp', 'other', none, false)).toBeNull();
    expect(deckKey('ArrowDown', 'other', { ...none, shift: true }, true)).toBeNull();
  });
  test('nothing in a control that keeps its arrows, or with a modifier, or for another key', () => {
    for (const target of ['text', 'select', 'range', 'tab'] as const) {
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) expect(deckKey(key, target, none, true)).toBeNull();
    }
    for (const mod of ['ctrl', 'meta', 'alt'] as const) expect(deckKey('ArrowRight', 'other', { ...none, [mod]: true }, true)).toBeNull();
    expect(deckKey('Enter', 'other', none, true)).toBeNull();
  });
});
