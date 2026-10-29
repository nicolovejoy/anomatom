// The browser side of the iOS audio session: `navigator.audioSession` exists on iOS Safari and
// nowhere else. Not unit tested (needs a browser); coverage ignores `*.browser.ts`.
import type { AudioSession } from './drum-sound';

export function browserAudioSession(): AudioSession | null {
  if (typeof navigator === 'undefined' || !('audioSession' in navigator)) return null;
  return (navigator as unknown as { audioSession: AudioSession }).audioSession;
}
