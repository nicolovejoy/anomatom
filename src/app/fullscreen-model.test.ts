import { describe, expect, test } from 'vitest';
import { asksFullscreen, ELEMENT_PROPS, EXIT_METHODS, firstMethod, fullscreenElementOf, leavesFullscreen, leavesFullView, REQUEST_METHODS } from './fullscreen-model';

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

describe('asksFullscreen', () => {
  test('only a click that enters asks', () => {
    expect(asksFullscreen(true, true)).toBe(true);
    expect(asksFullscreen(true, false)).toBe(false);
    expect(asksFullscreen(false, true)).toBe(false);
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

describe('leavesFullView', () => {
  test('the browser exiting fullscreen while full view is on leaves full view', () => {
    expect(leavesFullView(true, false)).toBe(true);
  });
  test('entering fullscreen, or full view already off, does nothing', () => {
    expect(leavesFullView(true, true)).toBe(false);
    expect(leavesFullView(false, false)).toBe(false);
  });
});
