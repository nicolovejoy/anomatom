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
