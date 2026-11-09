import { describe, expect, test } from 'vitest';
import { ELEMENT_PROPS, EXIT_METHODS, firstMethod, fullscreenElementOf, leavesFullscreen, onFullscreenChange, refused, REQUEST_METHODS } from './fullscreen-model';

describe('firstMethod', () => {
  test('prefers the standard method', () => {
    expect(firstMethod({ requestFullscreen() {}, webkitRequestFullscreen() {} }, REQUEST_METHODS)).toBe('requestFullscreen');
  });
  test('falls back to the webkit one (iPad Safari)', () => {
    expect(firstMethod({ webkitRequestFullscreen() {} }, REQUEST_METHODS)).toBe('webkitRequestFullscreen');
    expect(firstMethod({ webkitExitFullscreen() {} }, EXIT_METHODS)).toBe('webkitExitFullscreen');
  });
  test('is null where there is none (iPhone Safari), or the member is not a function', () => {
    expect(firstMethod({}, REQUEST_METHODS)).toBeNull();
    expect(firstMethod({ requestFullscreen: true }, REQUEST_METHODS)).toBeNull();
  });
});

describe('fullscreenElementOf', () => {
  test('reads the standard property, then the webkit one', () => {
    expect(fullscreenElementOf({ fullscreenElement: 'a', webkitFullscreenElement: 'b' }, ELEMENT_PROPS)).toBe('a');
    expect(fullscreenElementOf({ fullscreenElement: null, webkitFullscreenElement: 'b' }, ELEMENT_PROPS)).toBe('b');
  });
  test('is null with none', () => {
    expect(fullscreenElementOf({ fullscreenElement: null }, ELEMENT_PROPS)).toBeNull();
    expect(fullscreenElementOf({}, ELEMENT_PROPS)).toBeNull();
  });
});

describe('leavesFullscreen', () => {
  test('full view going off while fullscreen is on leaves it', () => {
    expect(leavesFullscreen(false, true, true)).toBe(true);
  });
  test('nothing to leave, or full view not going off, does nothing', () => {
    expect(leavesFullscreen(false, true, false)).toBe(false);
    expect(leavesFullscreen(true, false, true)).toBe(false);
    expect(leavesFullscreen(false, false, true)).toBe(false);
  });
});

describe('refused', () => {
  test('a pending request is over', () => {
    expect(refused('pending')).toBe('idle');
  });
  test('an engaged fullscreen is not undone by an older refusal', () => {
    expect(refused('engaged')).toBe('engaged');
    expect(refused('idle')).toBe('idle');
  });
});

describe('onFullscreenChange', () => {
  test('our request landing while full view is on engages', () => {
    expect(onFullscreenChange('pending', true, true)).toEqual({ ask: 'engaged', exit: false, leaveFullView: false });
  });
  test('our request landing after full view went off (⤢ then ⤡) exits at once', () => {
    expect(onFullscreenChange('pending', false, true)).toEqual({ ask: 'idle', exit: true, leaveFullView: false });
  });
  test('fullscreen that is not ours, or already engaged, is left alone', () => {
    expect(onFullscreenChange('idle', true, true)).toEqual({ ask: 'idle', exit: false, leaveFullView: false });
    expect(onFullscreenChange('idle', false, true)).toEqual({ ask: 'idle', exit: false, leaveFullView: false });
    expect(onFullscreenChange('engaged', true, true)).toEqual({ ask: 'engaged', exit: false, leaveFullView: false });
  });
  test('an exit arriving late while a newer request is pending changes nothing', () => {
    expect(onFullscreenChange('pending', true, false)).toEqual({ ask: 'pending', exit: false, leaveFullView: false });
    expect(onFullscreenChange('pending', false, false)).toEqual({ ask: 'pending', exit: false, leaveFullView: false });
  });
  test("the browser's own exit leaves full view when it is on", () => {
    expect(onFullscreenChange('engaged', true, false)).toEqual({ ask: 'idle', exit: false, leaveFullView: true });
    expect(onFullscreenChange('idle', true, false)).toEqual({ ask: 'idle', exit: false, leaveFullView: true });
  });
  test('an exit after full view went off leaves nothing to do', () => {
    expect(onFullscreenChange('idle', false, false)).toEqual({ ask: 'idle', exit: false, leaveFullView: false });
  });
});
