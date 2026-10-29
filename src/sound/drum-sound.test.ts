import { expect, test, vi } from 'vitest';
import { DEFAULT_MAPPING, PARAM_SMOOTH_SECONDS } from '../tunables';
import { createDrumSound, type Kit } from './drum-sound';
import type { Hit } from './mapping';

type Started = { note: string; velocity: number; time: number; duration: number };

function fakeParam() {
  const param = { value: 0, targets: [] as [number, number, number][] };
  return Object.assign(param, {
    setTargetAtTime: (v: number, at: number, tc: number) => param.targets.push([v, at, tc]),
  });
}

function fakeContext(state: AudioContextState = 'suspended') {
  const nodes: { kind: string; connected: unknown[]; gain: ReturnType<typeof fakeParam>; frequency: ReturnType<typeof fakeParam>; pan: ReturnType<typeof fakeParam>; type?: string }[] = [];
  const node = (kind: string) => {
    const n = {
      kind,
      connected: [] as unknown[],
      gain: fakeParam(),
      frequency: fakeParam(),
      pan: fakeParam(),
      type: undefined as string | undefined,
      connect: (to: unknown) => n.connected.push(to),
    };
    nodes.push(n);
    return n;
  };
  const ctx = {
    nodes,
    destination: { kind: 'destination' },
    createGain: () => node('gain'),
    createBiquadFilter: () => node('filter'),
    createStereoPanner: () => node('panner'),
    currentTime: 1.5,
    state,
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    close: vi.fn(async () => {}),
  };
  return ctx as unknown as AudioContext & typeof ctx;
}

function fakeKit() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const started: Started[] = [];
  const kit: Kit & { started: Started[]; resolve: () => void; reject: (e: unknown) => void; disposed: boolean } = {
    ready: new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    start: (e) => started.push(e),
    dispose: () => {
      kit.disposed = true;
    },
    started,
    resolve,
    reject,
    disposed: false,
  };
  return kit;
}

const hit = (hand: 0 | 1): Hit => ({ sample: 'kick', hand, velocity: 100, pan: 0, gain: 1, durationPulses: 2 });

async function settle() {
  await new Promise((r) => setTimeout(r, 0));
}

test('silent until the kit is in, then plays at the given time', async () => {
  const kits = [fakeKit(), fakeKit()];
  const loadKit = vi.fn(async (_c: AudioContext, hand: 0 | 1) => kits[hand] as Kit);
  const sound = createDrumSound(() => fakeContext(), loadKit);
  sound.preload(DEFAULT_MAPPING);
  await settle();
  expect(loadKit).toHaveBeenCalledTimes(2);
  sound.play(hit(0), 2, 0.25);
  expect(kits[0]?.started).toEqual([]);
  kits[0]?.resolve();
  await settle();
  sound.play(hit(0), 2, 0.25);
  expect(kits[0]?.started).toEqual([{ note: 'kick', velocity: 100, time: 2, duration: 0.5 }]);
  // Hand 2's kit is still loading: silent.
  sound.play(hit(1), 2, 0.25);
  expect(kits[1]?.started).toEqual([]);
});

test('each hand gets one kit, played through its own gain and panner with the mapping pan and gain', async () => {
  const ctx = fakeContext();
  const loadKit = vi.fn(async (_c: AudioContext, _h: 0 | 1, _d: AudioNode) => fakeKit() as Kit);
  const sound = createDrumSound(() => ctx, loadKit);
  sound.preload(DEFAULT_MAPPING);
  await settle();
  expect(loadKit.mock.calls.map((c) => c[1])).toEqual([0, 1]);
  const filter = ctx.nodes.find((n) => n.kind === 'filter');
  const gains = ctx.nodes.filter((n) => n.kind === 'gain').slice(1);
  const panners = ctx.nodes.filter((n) => n.kind === 'panner');
  expect(panners.map((p) => p.pan.value)).toEqual([-0.6, 0.6]);
  expect(gains.map((g) => g.gain.value)).toEqual([1, 1]);
  // The kit plays into its hand's gain, which feeds its panner, which feeds the filter.
  expect(loadKit.mock.calls.map((c) => c[2])).toEqual(gains);
  expect(gains.map((g, i) => g.connected[0] === panners[i])).toEqual([true, true]);
  expect(panners.map((p) => p.connected)).toEqual([[filter], [filter]]);
});

test('changing a hand pan or gain moves the node params and never reloads the kit', async () => {
  const ctx = fakeContext();
  const loadKit = vi.fn(async (_c: AudioContext, _h: 0 | 1, _d: AudioNode) => fakeKit() as Kit);
  const sound = createDrumSound(() => ctx, loadKit);
  sound.preload(DEFAULT_MAPPING);
  sound.preload(DEFAULT_MAPPING);
  await settle();
  expect(loadKit).toHaveBeenCalledTimes(2);
  sound.preload({ ...DEFAULT_MAPPING, hands: [{ pan: 0.1, gain: 0.5 }, DEFAULT_MAPPING.hands[1]] });
  await settle();
  expect(loadKit).toHaveBeenCalledTimes(2);
  const [g0] = ctx.nodes.filter((n) => n.kind === 'gain').slice(1);
  const [p0] = ctx.nodes.filter((n) => n.kind === 'panner');
  expect(g0?.gain.targets).toEqual([[0.5, 1.5, PARAM_SMOOTH_SECONDS]]);
  expect(p0?.pan.targets).toEqual([[0.1, 1.5, PARAM_SMOOTH_SECONDS]]);
});

test('a failed load is retried on the next preload', async () => {
  const first = fakeKit();
  const loadKit = vi.fn(async () => first as Kit);
  const sound = createDrumSound(() => fakeContext(), loadKit);
  sound.preload(DEFAULT_MAPPING);
  first.reject(new Error('offline'));
  await settle();
  expect(first.disposed).toBe(true);
  sound.preload(DEFAULT_MAPPING);
  await settle();
  expect(loadKit).toHaveBeenCalledTimes(4);
});

test('resume on a gesture; now reads the audio clock; no Web Audio means silence', async () => {
  const ctx = fakeContext();
  const sound = createDrumSound(() => ctx, async () => fakeKit() as Kit);
  expect(sound.now()).toBe(1.5);
  sound.resume();
  expect(ctx.resume).toHaveBeenCalled();
  const none = createDrumSound(() => null, async () => fakeKit() as Kit);
  none.preload(DEFAULT_MAPPING);
  none.resume();
  none.play(hit(0), 0, 0.25);
  expect(none.now()).toBe(0);
});

test('close disposes kits and the context; a kit arriving after close is dropped', async () => {
  const ctx = fakeContext();
  const late = fakeKit();
  const sound = createDrumSound(() => ctx, async () => late as Kit);
  sound.preload(DEFAULT_MAPPING);
  sound.close();
  late.resolve();
  await settle();
  expect(late.disposed).toBe(true);
  expect(ctx.close).toHaveBeenCalled();
  expect(sound.now()).toBe(0);
});

test('a kit whose samples arrive after close is disposed and not played', async () => {
  const kit = fakeKit();
  const sound = createDrumSound(() => fakeContext(), async () => kit as Kit);
  sound.preload(DEFAULT_MAPPING);
  await settle();
  sound.close();
  kit.resolve();
  await settle();
  expect(kit.disposed).toBe(true);
  sound.play(hit(0), 1, 0.25);
  expect(kit.started).toEqual([]);
});

test('a new pan or gain leaves the loaded kits playing, undisposed and not reloaded', async () => {
  const kits: ReturnType<typeof fakeKit>[] = [];
  const loadKit = vi.fn(async () => {
    const k = fakeKit();
    kits.push(k);
    return k as Kit;
  });
  const sound = createDrumSound(() => fakeContext(), loadKit);
  sound.preload(DEFAULT_MAPPING);
  await settle();
  kits[0]?.resolve();
  kits[1]?.resolve();
  await settle();
  sound.preload({ ...DEFAULT_MAPPING, hands: [DEFAULT_MAPPING.hands[0], { pan: 0, gain: 0.5 }] });
  sound.play(hit(1), 1, 0.25);
  expect(kits[1]?.started).toHaveLength(1);
  expect(kits.map((k) => k.disposed)).toEqual([false, false]);
  expect(loadKit).toHaveBeenCalledTimes(2);
});

test('an interrupted context (iOS) is resumed too', () => {
  const ctx = fakeContext('interrupted' as AudioContextState);
  const sound = createDrumSound(() => ctx, async () => fakeKit() as Kit);
  sound.resume();
  expect(ctx.resume).toHaveBeenCalled();
  const running = fakeContext('running');
  createDrumSound(() => running, async () => fakeKit() as Kit).resume();
  expect(running.resume).not.toHaveBeenCalled();
});

test('resume asks iOS for the playback audio session, before resuming; a browser without one is fine', async () => {
  const order: string[] = [];
  const session = {
    _type: 'auto',
    get type() {
      return this._type;
    },
    set type(v: string) {
      order.push(`type=${v}`);
      this._type = v;
    },
  };
  const ctx = fakeContext();
  ctx.resume.mockImplementation(async () => {
    order.push('resume');
  });
  const sound = createDrumSound(() => ctx, async () => fakeKit() as Kit, undefined, () => session);
  sound.resume();
  sound.resume();
  expect(order).toEqual(['type=playback', 'resume', 'resume']);
  expect(session.type).toBe('playback');
  const bare = createDrumSound(() => fakeContext(), async () => fakeKit() as Kit, undefined, () => null);
  bare.resume();
});

test('status: idle, loading, ready; subscribers hear each change and can stop', async () => {
  const kits: ReturnType<typeof fakeKit>[] = [];
  const sound = createDrumSound(() => fakeContext(), async () => {
    const k = fakeKit();
    kits.push(k);
    return k as Kit;
  });
  const heard: string[] = [];
  const stop = sound.subscribe(() => heard.push(sound.status()));
  expect(sound.status()).toBe('idle');
  sound.preload(DEFAULT_MAPPING);
  expect(sound.status()).toBe('loading');
  await settle();
  kits.forEach((k) => k.resolve());
  await settle();
  expect(sound.status()).toBe('ready');
  expect(heard.at(-1)).toBe('ready');
  stop();
  const count = heard.length;
  sound.preload({ ...DEFAULT_MAPPING, hands: [{ pan: 0, gain: 0.5 }, { pan: 0, gain: 0.5 }] });
  expect(heard).toHaveLength(count);
});

test('status: a failed load shows failed; retry loads again and reaches ready', async () => {
  const kits: ReturnType<typeof fakeKit>[] = [];
  const loadKit = vi.fn(async () => {
    const k = fakeKit();
    kits.push(k);
    return k as Kit;
  });
  const sound = createDrumSound(() => fakeContext(), loadKit);
  sound.retry(); // nothing asked for yet: nothing to retry
  expect(loadKit).not.toHaveBeenCalled();
  sound.preload(DEFAULT_MAPPING);
  await settle();
  kits.forEach((k) => k.reject(new Error('429')));
  await settle();
  expect(sound.status()).toBe('failed');
  sound.retry();
  expect(sound.status()).toBe('loading');
  await settle();
  kits.slice(2).forEach((k) => k.resolve());
  await settle();
  expect(sound.status()).toBe('ready');
});

test('status: a pad that fails to load is failed too; close resets and stale loads are ignored', async () => {
  const pad = fakeKit();
  const kit = fakeKit();
  const sound = createDrumSound(() => fakeContext(), async () => kit as Kit, async () => pad as Kit);
  sound.preload({ ...DEFAULT_MAPPING, pad: { ...DEFAULT_MAPPING.pad, on: true } });
  await settle();
  kit.resolve();
  pad.reject(new Error('offline'));
  await settle();
  expect(sound.status()).toBe('failed');
  sound.preload({ ...DEFAULT_MAPPING, pad: { ...DEFAULT_MAPPING.pad, on: true } });
  expect(sound.status()).toBe('loading');
  sound.close();
  expect(sound.status()).toBe('idle');
  await settle();
  expect(sound.status()).toBe('idle');
});

test('status: a failed pad that is turned off is no longer a failure', async () => {
  const pad = fakeKit();
  const kit = fakeKit();
  const sound = createDrumSound(() => fakeContext(), async () => kit as Kit, async () => pad as Kit);
  const on = { ...DEFAULT_MAPPING, pad: { ...DEFAULT_MAPPING.pad, on: true } };
  sound.preload(on);
  await settle();
  kit.resolve();
  pad.reject(new Error('offline'));
  await settle();
  expect(sound.status()).toBe('failed');
  const heard: string[] = [];
  sound.subscribe(() => heard.push(sound.status()));
  sound.preload({ ...DEFAULT_MAPPING, pad: { ...DEFAULT_MAPPING.pad, on: false } });
  expect(sound.status()).toBe('ready');
  expect(heard).toEqual(['ready']);
});

test('the playback audio session is also set when the context is made', () => {
  const session = { type: 'auto' };
  const sound = createDrumSound(() => fakeContext(), async () => fakeKit() as Kit, undefined, () => session);
  sound.preload(DEFAULT_MAPPING);
  expect(session.type).toBe('playback');
});
