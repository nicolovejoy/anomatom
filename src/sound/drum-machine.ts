// The drum machines: smplr's DrumMachine, one per part and kit, behind the `LoadKit` shape that
// drum-sound.ts plays. No DOM, no timers: unit tested with a fake smplr; drum-machine.browser.ts
// hands it the real one (a dynamic import) and the real AudioContext.
//
// Samples are roles (docs/plans/v2-share-kits-passing.md, ruling 1): a hit names a sound in the
// TR-808's vocabulary, and the kit plays its own sample for that role (KIT_ROLES), here, where the
// hit reaches the machine. So presets, the panel and the share link never name a kit's samples.
import type { PartIndex } from '../core/types';
import { KIT_ROLES, KIT_VOLUME } from '../tunables';
import type { Kit, LoadKit } from './drum-sound';

/** The slice of smplr used. Method syntax, so the real module (whose loader type is its own) fits. */
export interface SmplrDrums<Loader = unknown> {
  SampleLoader(context: AudioContext): Loader;
  DrumMachine(
    context: AudioContext,
    options: { instrument: string; volume: number; destination: AudioNode; loader: Loader },
  ): { load: Promise<unknown>; start(event: { note: string; velocity: number; time: number; duration: number }): unknown; disconnect(): void };
}

/** The kit's sample for a role; a name the table does not know (none should reach here) passes through. */
export function kitSample(kit: string, role: string): string {
  return KIT_ROLES[kit]?.[role] ?? role;
}

/** `load`, called once until it succeeds: a failed import is tried again on the next call. */
export function retrying<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () =>
    (pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    }));
}

/**
 * A `LoadKit` over smplr. Per context: one sample loader, shared by every machine, so each sample is
 * fetched and decoded once; and one queue, because the loader caches a sample only once it has
 * arrived, so a machine made while another is still fetching would fetch again. Per part's
 * destination and kit: the machine, kept, so switching a part back to a kit it had is instant. Pan and
 * gain live on the part's nodes in drum-sound.ts, not on the machine. Disposing a machine forgets it,
 * so a kit that failed to load is fetched afresh on the next try.
 */
export function drumMachines<Loader>(importSmplr: () => Promise<SmplrDrums<Loader>>): LoadKit {
  const loaders = new WeakMap<AudioContext, Loader>();
  const lastLoad = new WeakMap<AudioContext, Promise<unknown>>();
  const machines = new WeakMap<AudioNode, Map<string, Promise<Kit>>>();

  async function make(context: AudioContext, destination: AudioNode, kit: string, forget: () => void): Promise<Kit> {
    const smplr = await importSmplr();
    // Join the queue synchronously, so the next machine waits for this one's samples.
    const turn = (lastLoad.get(context) ?? Promise.resolve()).catch(() => undefined);
    let finish!: () => void;
    lastLoad.set(context, new Promise<void>((resolve) => (finish = resolve)));
    await turn;
    let loader = loaders.get(context);
    if (loader === undefined) {
      loader = smplr.SampleLoader(context);
      loaders.set(context, loader);
    }
    let machine: ReturnType<SmplrDrums<Loader>['DrumMachine']>;
    try {
      machine = smplr.DrumMachine(context, { instrument: kit, volume: KIT_VOLUME, destination, loader });
    } catch (error) {
      // smplr throws at once for an instrument it does not know: free the queue for the next machine.
      finish();
      throw error;
    }
    const ready = machine.load.then(() => undefined);
    ready.then(finish, finish);
    return {
      ready,
      start: (event) => machine.start({ ...event, note: kitSample(kit, event.note) }),
      dispose: () => {
        forget();
        machine.disconnect();
      },
    };
  }

  return (context: AudioContext, _part: PartIndex, destination: AudioNode, kit: string) => {
    let byKit = machines.get(destination);
    if (!byKit) {
      byKit = new Map();
      machines.set(destination, byKit);
    }
    const cached = byKit.get(kit);
    if (cached) return cached;
    const kits = byKit;
    const made = make(context, destination, kit, () => {
      if (kits.get(kit) === made) kits.delete(kit);
    });
    kits.set(kit, made);
    // A machine that never came (smplr failed to import) is not kept either.
    made.catch(() => kits.get(kit) === made && kits.delete(kit));
    return made;
  };
}
