// The browser side of the downbeat pad: smplr's Mellotron and Soundfont, fetched on demand.
// Not unit tested (needs Web Audio and the network); coverage ignores `*.browser.ts`.
import { PAD_INSTRUMENTS, PAD_VOLUME } from '../tunables';
import type { LoadPad, Pad } from './drum-sound';

// smplr is fetched once, on the first load; if that fails the next load tries again.
let smplrModule: Promise<typeof import('smplr')> | undefined;
function importSmplr() {
  return (smplrModule ??= import('smplr').catch((error: unknown) => {
    smplrModule = undefined;
    throw error;
  }));
}

export const browserPad: LoadPad = async (context, instrument, destination): Promise<Pad> => {
  const smplr = await importSmplr();
  const options = { instrument: PAD_INSTRUMENTS[instrument], destination, volume: PAD_VOLUME };
  const sampler = instrument === 'mellotron' ? smplr.Mellotron(context, options) : smplr.Soundfont(context, options);
  return {
    ready: sampler.load.then(() => undefined),
    start: (event) => sampler.start(event),
    dispose: () => sampler.disconnect(),
  };
};
