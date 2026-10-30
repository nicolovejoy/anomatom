import { expect, test } from 'vitest';
import { route } from './route';

test('#about is the About view', () => {
  expect(route('#about')).toEqual({ view: 'about', state: null, version: null });
  expect(route('about')).toEqual({ view: 'about', state: null, version: null });
});

test('#v2.<payload> and an old #v1.<payload> are the play view carrying the payload, undecoded', () => {
  expect(route('#v2.eyJhIjoxfQ')).toEqual({ view: 'play', state: 'eyJhIjoxfQ', version: 2 });
  expect(route('#v1.eyJhIjoxfQ')).toEqual({ view: 'play', state: 'eyJhIjoxfQ', version: 1 });
  expect(route('v1.abc-_')).toEqual({ view: 'play', state: 'abc-_', version: 1 });
});

test('empty, bare and junk hashes are the play view with no state', () => {
  for (const hash of ['', '#', '#v1.', '#v1', '#v2.', '#v3.abc', '#About', '#about/', '#%%%', 'v']) {
    expect(route(hash)).toEqual({ view: 'play', state: null, version: null });
  }
});

test('a short link is the play view carrying the whole short form', () => {
  expect(route('#531')).toEqual({ view: 'play', state: '531', version: 'short' });
  expect(route('#531@140')).toEqual({ view: 'play', state: '531@140', version: 'short' });
  expect(route('#3:2/2-2x-2/2x-2@90')).toEqual({ view: 'play', state: '3:2/2-2x-2/2x-2@90', version: 'short' });
  expect(route('#about').view).toBe('about');
});
