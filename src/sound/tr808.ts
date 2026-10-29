// The browser side of the drums: a real AudioContext and smplr's TR-808. Not unit tested
// (needs Web Audio); the browser smoke test exercises it.
import type { Hand } from '../core/types';
import type { Kit } from './drum-sound';

export function browserContext(): AudioContext | null {
  const Context =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  return Context ? new Context() : null;
}

// smplr is fetched once, on the first load; if that fails the next load tries again.
let smplrModule: Promise<typeof import('smplr')> | undefined;
function importSmplr() {
  return (smplrModule ??= import('smplr').catch((error: unknown) => {
    smplrModule = undefined;
    throw error;
  }));
}

export async function tr808(context: AudioContext, _hand: Hand, pan: number, gain: number): Promise<Kit> {
  const smplr = await importSmplr();
  const machine = smplr.DrumMachine(context, { instrument: 'TR-808', pan, volume: Math.round(gain * 127) });
  return {
    ready: machine.load.then(() => undefined),
    start: (event) => machine.start(event),
    dispose: () => machine.disconnect(),
  };
}
