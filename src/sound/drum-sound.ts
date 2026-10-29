// The drums: one kit per hand so each hand has its own pan and gain. No DOM, no timers: unit
// tested with a fake context and fake kits; `tr808.ts` supplies the real ones. Where there is
// no Web Audio everything is silent. The factory shape is L6's piano-sound.ts: the context is
// made at preload (no gesture needed to decode), starts suspended, and the first play, a
// gesture, resumes it. Before a hand's kit has loaded its hits are silent; there is no
// stand-in tone.
import type { Hand } from '../core/types';
import type { Hit, Mapping } from './mapping';

export type Kit = {
  ready: Promise<void>;
  start(event: { note: string; velocity: number; time: number; duration: number }): unknown;
  dispose(): void;
};

export type LoadKit = (context: AudioContext, hand: Hand, pan: number, gain: number) => Promise<Kit>;

export function createDrumSound(makeContext: () => AudioContext | null, loadKit: LoadKit) {
  let context: AudioContext | null | undefined;
  // Per hand: the kit once loaded, and the voice (pan/gain) most recently asked for. A kit
  // keeps playing until its replacement is in.
  const ready = new Map<Hand, Kit>();
  const loading = new Set<Kit>();
  const requested = new Map<Hand, string>();

  function audio(): AudioContext | null {
    if (context === undefined) context = makeContext();
    return context;
  }

  function load(ctx: AudioContext, hand: Hand, pan: number, gain: number) {
    const key = `${pan}/${gain}`;
    if (requested.get(hand) === key) return;
    requested.set(hand, key);
    loadKit(ctx, hand, pan, gain)
      .then((kit) => {
        if (context !== ctx || requested.get(hand) !== key) return kit.dispose();
        loading.add(kit);
        return kit.ready.then(
          () => {
            loading.delete(kit);
            if (context === ctx && requested.get(hand) === key) {
              ready.get(hand)?.dispose();
              ready.set(hand, kit);
            } else kit.dispose();
          },
          (error: unknown) => {
            loading.delete(kit);
            kit.dispose();
            throw error;
          },
        );
      })
      .catch(() => {
        // The next preload tries again.
        if (context === ctx && requested.get(hand) === key) requested.delete(hand);
      });
  }

  return {
    /** Loads one kit per hand with that hand's pan and gain. Safe to call again. */
    preload(mapping: Mapping) {
      const ctx = audio();
      if (!ctx) return;
      mapping.hands.forEach((voice, hand) => load(ctx, hand as Hand, voice.pan, voice.gain));
    },
    /** Call from a user gesture: a context made before any gesture starts suspended. */
    resume() {
      const ctx = audio();
      if (!ctx) return;
      if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') void ctx.resume();
    },
    /** The one clock. 0 where there is no audio. */
    now(): number {
      return audio()?.currentTime ?? 0;
    },
    play(hit: Hit, time: number, pulseLen: number) {
      ready.get(hit.hand)?.start({
        note: hit.sample,
        velocity: hit.velocity,
        time,
        duration: hit.durationPulses * pulseLen,
      });
    },
    close() {
      for (const kit of [...ready.values(), ...loading]) kit.dispose();
      ready.clear();
      loading.clear();
      requested.clear();
      if (context) void context.close();
      context = null;
    },
  };
}

export type DrumSound = ReturnType<typeof createDrumSound>;
