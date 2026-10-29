// The browser side of the drums: a real AudioContext and smplr's TR-808. Not unit tested
// (needs Web Audio); the browser smoke test exercises it.
import type { Hand } from '../core/types';
import { KIT_VOLUME } from '../tunables';
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

// One sample loader per context, shared by both hands' machines: the TR-808 is fetched and
// decoded once. Pan and gain live on the hand's nodes in drum-sound.ts, not on the machine.
const loaders = new WeakMap<AudioContext, import('smplr').SampleLoader>();

export async function tr808(context: AudioContext, _hand: Hand, destination: AudioNode): Promise<Kit> {
  const smplr = await importSmplr();
  let loader = loaders.get(context);
  if (!loader) {
    loader = smplr.SampleLoader(context);
    loaders.set(context, loader);
  }
  const machine = smplr.DrumMachine(context, {
    instrument: 'TR-808',
    volume: KIT_VOLUME,
    destination,
    loader,
  });
  return {
    ready: machine.load.then(() => undefined),
    start: (event) => machine.start(event),
    dispose: () => machine.disconnect(),
  };
}
