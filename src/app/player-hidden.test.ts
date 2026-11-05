// v6.5 ruling 2's other branch: with AUDIO_PLAYS_HIDDEN false, hiding the page while playing is a
// press of Pause, and the audio session is let go at once. Its own file, so the tunable can be
// mocked for the whole module; src/app/player.test.ts covers the branch that ships.
import { expect, test, vi } from 'vitest';
import { scheduleOf } from '../test/schedules';
import { HEIGHT_DRUM } from '../test/mappings';
import type { DrumSound } from '../sound/drum-sound';
import { createPlayer } from './player';

vi.mock('../tunables', async (original) => ({ ...(await original<typeof import('../tunables')>()), AUDIO_PLAYS_HIDDEN: false }));

test('without AUDIO_PLAYS_HIDDEN, hidden while playing pauses and parks at once', () => {
  vi.useFakeTimers();
  const sound = {
    now: () => 0,
    resume: vi.fn(),
    park: vi.fn(),
    renew: vi.fn(() => false),
    onInterrupt: vi.fn(),
    preload: vi.fn(),
    setFilter: vi.fn(),
    playPad: vi.fn(),
    play: vi.fn(),
    close: vi.fn(),
  };
  const player = createPlayer(sound as unknown as DrumSound);
  player.play(scheduleOf('3'), HEIGHT_DRUM, 120);
  player.setHidden(true);
  expect(player.playing()).toBe(false);
  expect(player.view().state).toBe('paused');
  expect(sound.park).toHaveBeenCalledTimes(1);
  // Shown again: still paused, no resume without a gesture.
  player.setHidden(false);
  expect(player.view().state).toBe('paused');
  expect(sound.resume).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
