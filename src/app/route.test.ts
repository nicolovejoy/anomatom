import { expect, test } from 'vitest';
import { route } from './route';

test('#about is the About view', () => {
  expect(route('#about')).toEqual({ view: 'about', state: null });
  expect(route('about')).toEqual({ view: 'about', state: null });
});

test('#v1.<payload> is the play view carrying the payload, undecoded', () => {
  expect(route('#v1.eyJhIjoxfQ')).toEqual({ view: 'play', state: 'eyJhIjoxfQ' });
  expect(route('v1.abc-_')).toEqual({ view: 'play', state: 'abc-_' });
});

test('empty, bare and junk hashes are the play view with no state', () => {
  for (const hash of ['', '#', '#v1.', '#v1', '#v2.abc', '#About', '#about/', '#%%%', 'v']) {
    expect(route(hash)).toEqual({ view: 'play', state: null });
  }
});
