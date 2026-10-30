// The browser side of the drums: a real AudioContext and smplr's drum machines. Not unit tested
// (needs Web Audio); the e2e tests exercise it. The logic is drum-machine.ts.
import { drumMachines, retrying } from './drum-machine';

export function browserContext(): AudioContext | null {
  const Context =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  return Context ? new Context() : null;
}

/** smplr is fetched once, on the first load; if that fails the next load tries again. */
export const drumMachine = drumMachines(retrying(() => import('smplr')));
