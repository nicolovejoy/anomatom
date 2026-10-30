// The drums and the downbeat pad: one kit per part, each through its own gain and stereo panner
// (the part's voice), one pad per instrument. No DOM, no timers: unit tested with a fake context and fake kits;
// `drum-machine.ts` and `pad.browser.ts` supply the real ones. Where there is no Web Audio everything
// is silent. The factory shape is L6's piano-sound.ts: the context is made at preload (no
// gesture needed to decode), starts suspended, and the first play, a gesture, resumes it.
// Before a kit or pad has loaded its hits are silent; there is no stand-in tone.
//
// The graph: each part's kit -> its gain -> its panner -> the low-pass filter, and every pad ->
// the filter; the filter -> the master gain -> the destination. `setFilter` (crossings to
// filter), `setMaster` (volume) and a part's pan and gain move those nodes' params, smoothly;
// changing a part's pan or gain never reloads its kit.
//
// A part's kit is its `PartVoice.kit`. Changing it loads that kit for the part while the old one
// keeps playing; the new one plays from its first hit after it is in. A kit a part has had is kept
// (here and in the factory) until close, so switching back is instant.
import type { PartIndex } from '../core/types';
import { FILTER_OPEN_HZ, PARAM_SMOOTH_SECONDS } from '../tunables';
import type { Hit, Mapping, PadHit, PadInstrument } from './mapping';
import { browserAudioSession } from './audio-session.browser';
import { browserPad } from './pad.browser';

export type NoteStart = { note: string; velocity: number; time: number; duration: number };

export type Kit = {
  ready: Promise<void>;
  start(event: NoteStart): unknown;
  dispose(): void;
};

/** A pad instrument has the shape of a kit: notes are pitches, not sample names. */
export type Pad = Kit;

/**
 * `destination` is the node to play into (the part's gain), not the context's output; `kit` is one of
 * KIT_IDS. The kit plays a hit's sample name as a role (KIT_ROLES).
 */
export type LoadKit = (context: AudioContext, part: PartIndex, destination: AudioNode, kit: string) => Promise<Kit>;

/** What the reader sees of the samples: nothing asked for yet, fetching, all in, or a fetch failed. */
export type SoundStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** The slice of `navigator.audioSession` used; null where the browser has none (everything but iOS Safari). */
export type AudioSession = { type: string };

export type LoadPad = (context: AudioContext, instrument: PadInstrument, destination: AudioNode) => Promise<Pad>;

export function createDrumSound(
  makeContext: () => AudioContext | null,
  loadKit: LoadKit,
  loadPad: LoadPad = browserPad,
  audioSession: () => AudioSession | null = browserAudioSession,
) {
  let context: AudioContext | null | undefined;
  let bus: { filter: BiquadFilterNode; master: GainNode } | null = null;
  // The last values asked for, applied when the context is made if it is not yet.
  let masterVolume = 1;
  let cutoff = FILTER_OPEN_HZ;
  // Per part: the kit playing, and the kit id most recently asked for. A kit keeps playing until
  // its replacement is in. `held`: every kit that has come in, disposed on close.
  const ready = new Map<PartIndex, Kit>();
  const held = new Set<Kit>();
  // The same, by part and kit id: switching a part back to a kit it has had swaps at once, no load.
  const kept = new Map<PartIndex, Map<string, Kit>>();
  const loading = new Set<Kit>();
  const requested = new Map<PartIndex, string>();
  // Per part: its gain and panner, made with the first load and kept for the context's life.
  const voices = new Map<PartIndex, { gain: GainNode; panner: StereoPannerNode; last: string }>();
  // Per pad instrument: loaded once per context and kept (the cache), so switching back is instant.
  const pads = new Map<PadInstrument, Pad>();
  const padsRequested = new Set<PadInstrument>();
  // The status: loads in flight, whether one failed, and who to tell. `epoch` moves on close so a
  // load from a closed context cannot touch the count.
  let inFlight = 0;
  const failedParts = new Set<PartIndex>();
  const failedPads = new Set<PadInstrument>();
  let epoch = 0;
  let lastMapping: Mapping | null = null;
  const listeners = new Set<() => void>();

  function status(): SoundStatus {
    if (inFlight > 0) return 'loading';
    if (failedParts.size + failedPads.size > 0) return 'failed';
    return held.size > 0 || pads.size > 0 ? 'ready' : 'idle';
  }

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  /** Counts a load in flight; the returned function ends it, once. */
  function begin(): () => void {
    const mine = epoch;
    let open = true;
    inFlight++;
    notify();
    return () => {
      if (!open || mine !== epoch) return;
      open = false;
      inFlight--;
      notify();
    };
  }

  /** iOS mutes Web Audio under the ringer switch unless the page asks for the playback session. */
  function setPlaybackSession() {
    const session = audioSession();
    if (session && session.type !== 'playback') session.type = 'playback';
  }

  function audio(): AudioContext | null {
    if (context === undefined) {
      context = makeContext();
      if (context) {
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        const master = context.createGain();
        master.gain.value = masterVolume;
        filter.connect(master);
        master.connect(context.destination);
        bus = { filter, master };
        setPlaybackSession();
      }
    }
    return context;
  }

  function ramp(param: AudioParam, value: number) {
    param.setTargetAtTime(value, (context as AudioContext).currentTime, PARAM_SMOOTH_SECONDS);
  }

  function voice(ctx: AudioContext, part: PartIndex, pan: number, gain: number) {
    let v = voices.get(part);
    if (!v) {
      const g = ctx.createGain();
      const panner = ctx.createStereoPanner();
      g.gain.value = gain;
      panner.pan.value = pan;
      g.connect(panner);
      panner.connect((bus as NonNullable<typeof bus>).filter);
      v = { gain: g, panner, last: `${pan}/${gain}` };
      voices.set(part, v);
    } else if (v.last !== `${pan}/${gain}`) {
      v.last = `${pan}/${gain}`;
      ramp(v.gain.gain, gain);
      ramp(v.panner.pan, pan);
    }
    return v;
  }

  function load(ctx: AudioContext, part: PartIndex, id: string, pan: number, gain: number) {
    const v = voice(ctx, part, pan, gain);
    if (requested.get(part) === id) return;
    requested.set(part, id);
    const had = kept.get(part)?.get(id);
    if (had) {
      ready.set(part, had);
      if (failedParts.delete(part)) notify();
      return;
    }
    failedParts.delete(part);
    const end = begin();
    loadKit(ctx, part, v.gain, id)
      .then((kit) => {
        if (context !== ctx) return kit.dispose();
        loading.add(kit);
        return kit.ready.then(
          () => {
            loading.delete(kit);
            if (context !== ctx) return kit.dispose();
            held.add(kit);
            kept.set(part, (kept.get(part) ?? new Map<string, Kit>()).set(id, kit));
            // A kit that arrives after the part has moved on is kept for switching back, not played.
            if (requested.get(part) === id) ready.set(part, kit);
          },
          (error: unknown) => {
            loading.delete(kit);
            kit.dispose();
            throw error;
          },
        );
      })
      .catch(() => {
        // The next preload tries again; a kit the part has moved on from is not a failure.
        if (context === ctx && requested.get(part) === id) {
          requested.delete(part);
          failedParts.add(part);
        }
      })
      .finally(end);
  }

  function loadPadInstrument(ctx: AudioContext, instrument: PadInstrument) {
    if (padsRequested.has(instrument)) return;
    padsRequested.add(instrument);
    failedPads.delete(instrument);
    const end = begin();
    loadPad(ctx, instrument, (bus as NonNullable<typeof bus>).filter)
      .then((pad) => {
        if (context !== ctx) return pad.dispose();
        loading.add(pad);
        return pad.ready.then(
          () => {
            loading.delete(pad);
            if (context === ctx) pads.set(instrument, pad);
            else pad.dispose();
          },
          (error: unknown) => {
            loading.delete(pad);
            pad.dispose();
            throw error;
          },
        );
      })
      .catch(() => {
        if (context === ctx) {
          padsRequested.delete(instrument);
          failedPads.add(instrument);
        }
      })
      .finally(end);
  }

  function preload(mapping: Mapping) {
    lastMapping = mapping;
    const ctx = audio();
    if (!ctx) return;
    mapping.parts.forEach((voice, part) => load(ctx, part, voice.kit, voice.pan, voice.gain));
    if (mapping.pad.on) loadPadInstrument(ctx, mapping.pad.instrument);
    // A pad that failed and is no longer wanted (off, or another instrument) is not a failure.
    const dropped = [...failedPads].filter((i) => !mapping.pad.on || i !== mapping.pad.instrument);
    if (dropped.length > 0) {
      dropped.forEach((i) => failedPads.delete(i));
      notify();
    }
  }

  return {
    /**
     * Loads each part's kit (once per part and kit) and sets that part's pan and gain on its nodes, and loads the
     * pad instrument if the pad is on. Safe to call again; call it whenever the mapping changes:
     * a new pan or gain moves the node params and reloads nothing.
     */
    preload,
    /** Call from a user gesture: a context made before any gesture starts suspended. */
    resume() {
      const ctx = audio();
      if (!ctx) return;
      setPlaybackSession();
      if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') void ctx.resume();
    },
    /** Whether the samples are loading, in, or failed to load. */
    status,
    /** Calls `listener` whenever the status may have changed; returns the way to stop. */
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Tries the failed samples again: the same preload, for the mapping last asked for. */
    retry() {
      if (lastMapping) preload(lastMapping);
    },
    /** The one clock. 0 where there is no audio. */
    now(): number {
      return audio()?.currentTime ?? 0;
    },
    /** Master volume, 0 to 1. Takes effect smoothly, and at once on a context made later. */
    setMaster(volume: number) {
      masterVolume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
      if (bus) ramp(bus.master.gain, masterVolume);
    },
    /** The low-pass cutoff in Hz (see `filterCutoff`); FILTER_OPEN_HZ is transparent. */
    setFilter(hz: number) {
      cutoff = Number.isFinite(hz) ? hz : FILTER_OPEN_HZ;
      if (bus) ramp(bus.filter.frequency, cutoff);
    },
    play(hit: Hit, time: number, pulseLen: number) {
      ready.get(hit.part)?.start({
        note: hit.sample,
        velocity: hit.velocity,
        time,
        duration: hit.durationPulses * pulseLen,
      });
    },
    /** Plays a chord (from `padHitsAt`) on the given pad instrument; silent until that pad has loaded. */
    playPad(instrument: PadInstrument, hits: readonly PadHit[], time: number, pulseLen: number) {
      const pad = pads.get(instrument);
      if (!pad) return;
      for (const hit of hits) {
        pad.start({ note: hit.note, velocity: hit.velocity, time, duration: hit.durationPulses * pulseLen });
      }
    },
    close() {
      for (const kit of [...held, ...pads.values(), ...loading]) kit.dispose();
      ready.clear();
      held.clear();
      kept.clear();
      pads.clear();
      padsRequested.clear();
      loading.clear();
      requested.clear();
      voices.clear();
      epoch++;
      inFlight = 0;
      failedParts.clear();
      failedPads.clear();
      notify();
      bus = null;
      if (context) void context.close();
      context = null;
    },
  };
}

export type DrumSound = ReturnType<typeof createDrumSound>;
