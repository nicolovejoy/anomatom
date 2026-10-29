import { expect, test, vi } from 'vitest';
import { DEFAULT_MAPPING, FILTER_OPEN_HZ, PARAM_SMOOTH_SECONDS } from '../tunables';
import { createDrumSound, type Kit, type LoadPad } from './drum-sound';
import type { Mapping, PadHit } from './mapping';

type Started = { note: string; velocity: number; time: number; duration: number };
type Param = { value: number; targets: [number, number, number][]; setTargetAtTime(v: number, at: number, tc: number): unknown };
type Node = { kind: string; connected: unknown[]; gain: Param; frequency: Param; pan: Param; type?: string };

function param(): Param {
  const p: Param = { value: 0, targets: [], setTargetAtTime: (v, at, tc) => p.targets.push([v, at, tc]) };
  return p;
}

function fakeContext() {
  const nodes: Node[] = [];
  const node = (kind: string): Node => {
    const n: Node = { kind, connected: [], gain: param(), frequency: param(), pan: param(), connect: undefined as never } as never;
    (n as unknown as { connect: (to: unknown) => number }).connect = (to) => n.connected.push(to);
    nodes.push(n);
    return n;
  };
  const ctx = {
    nodes,
    destination: { kind: 'destination' },
    createGain: () => node('gain'),
    createBiquadFilter: () => node('filter'),
    createStereoPanner: () => node('panner'),
    currentTime: 3,
    state: 'running',
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  return ctx as unknown as AudioContext & typeof ctx;
}

function fakePad() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const started: Started[] = [];
  const pad: Kit & { started: Started[]; resolve: () => void; reject: (e: unknown) => void; disposed: boolean } = {
    ready: new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    start: (e) => started.push(e),
    dispose: () => {
      pad.disposed = true;
    },
    started,
    resolve,
    reject,
    disposed: false,
  };
  return pad;
}

const noKit = async () => fakePad() as Kit;
const padOn = (instrument: 'mellotron' | 'soundfont' = 'mellotron'): Mapping => ({
  ...DEFAULT_MAPPING,
  pad: { on: true, instrument, chord: 'Dm9' },
});
const chord: PadHit[] = [
  { note: 'D3', velocity: 70, durationPulses: 4 },
  { note: 'A3', velocity: 70, durationPulses: 4 },
];
const settle = () => new Promise((r) => setTimeout(r, 0));

test('the graph is kit -> gain -> panner -> filter -> master -> destination', async () => {
  const ctx = fakeContext();
  const destinations: unknown[] = [];
  const sound = createDrumSound(() => ctx, async (_c, _h, destination) => {
    destinations.push(destination);
    return fakePad() as Kit;
  }, async () => fakePad() as Kit);
  sound.preload(DEFAULT_MAPPING);
  const filter = ctx.nodes.find((n) => n.kind === 'filter');
  const master = ctx.nodes.find((n) => n.kind === 'gain');
  expect(filter?.type).toBe('lowpass');
  expect(filter?.frequency.value).toBe(FILTER_OPEN_HZ);
  expect(master?.gain.value).toBe(1);
  expect(filter?.connected).toEqual([master]);
  expect(master?.connected).toEqual([ctx.destination]);
  const voiceGains = ctx.nodes.filter((n) => n.kind === 'gain').slice(1);
  const panners = ctx.nodes.filter((n) => n.kind === 'panner');
  expect(destinations).toEqual(voiceGains);
  expect(voiceGains.map((g) => g.connected)).toEqual(panners.map((p) => [p]));
  expect(panners.map((p) => p.connected)).toEqual([[filter], [filter]]);
});

test('setMaster and setFilter ramp the live nodes; values set earlier apply when the context is made', () => {
  const ctx = fakeContext();
  const sound = createDrumSound(() => ctx, noKit, async () => fakePad() as Kit);
  sound.setMaster(0.5);
  sound.setFilter(800);
  expect(ctx.nodes).toEqual([]);
  sound.now();
  const filter = ctx.nodes.find((n) => n.kind === 'filter');
  const master = ctx.nodes.find((n) => n.kind === 'gain');
  expect(master?.gain.value).toBe(0.5);
  expect(filter?.frequency.value).toBe(800);
  sound.setMaster(0.25);
  sound.setFilter(2000);
  expect(master?.gain.targets).toEqual([[0.25, 3, PARAM_SMOOTH_SECONDS]]);
  expect(filter?.frequency.targets).toEqual([[2000, 3, PARAM_SMOOTH_SECONDS]]);
});

test('junk volume and cutoff are made safe', () => {
  const ctx = fakeContext();
  const sound = createDrumSound(() => ctx, noKit, async () => fakePad() as Kit);
  sound.now();
  const filter = ctx.nodes.find((n) => n.kind === 'filter');
  const master = ctx.nodes.find((n) => n.kind === 'gain');
  sound.setMaster(7);
  sound.setMaster(-1);
  sound.setMaster(Number.NaN);
  expect(master?.gain.targets.map((t) => t[0])).toEqual([1, 0, 0]);
  sound.setFilter(Number.POSITIVE_INFINITY);
  expect(filter?.frequency.targets.map((t) => t[0])).toEqual([FILTER_OPEN_HZ]);
});

test('without Web Audio the setters do nothing and play is silent', () => {
  const sound = createDrumSound(() => null, noKit, async () => fakePad() as Kit);
  sound.setMaster(0.3);
  sound.setFilter(500);
  sound.preload(padOn());
  sound.playPad('mellotron', chord, 0, 0.25);
  expect(sound.now()).toBe(0);
});

test('the pad is silent until it has loaded, then plays each note at the time', async () => {
  const pad = fakePad();
  const loadPad = vi.fn<LoadPad>(async () => pad);
  const sound = createDrumSound(() => fakeContext(), noKit, loadPad);
  sound.preload(padOn());
  await settle();
  sound.playPad('mellotron', chord, 5, 0.5);
  expect(pad.started).toEqual([]);
  pad.resolve();
  await settle();
  sound.playPad('mellotron', chord, 5, 0.5);
  expect(pad.started).toEqual([
    { note: 'D3', velocity: 70, time: 5, duration: 2 },
    { note: 'A3', velocity: 70, time: 5, duration: 2 },
  ]);
  // Another instrument was never loaded.
  sound.playPad('soundfont', chord, 5, 0.5);
  expect(pad.started).toHaveLength(2);
});

test('the pad loads only when on, once per instrument; switching instrument loads the other', async () => {
  const loadPad = vi.fn<LoadPad>(async () => {
    const p = fakePad();
    p.resolve();
    return p;
  });
  const sound = createDrumSound(() => fakeContext(), noKit, loadPad);
  sound.preload(DEFAULT_MAPPING);
  expect(loadPad).not.toHaveBeenCalled();
  sound.preload(padOn());
  sound.preload(padOn());
  await settle();
  expect(loadPad).toHaveBeenCalledTimes(1);
  expect(loadPad.mock.calls[0]?.[1]).toBe('mellotron');
  sound.preload(padOn('soundfont'));
  sound.preload(padOn('mellotron'));
  await settle();
  expect(loadPad).toHaveBeenCalledTimes(2);
});

test('a failed pad load is retried on the next preload', async () => {
  const first = fakePad();
  const loadPad = vi.fn<LoadPad>(async () => first);
  const sound = createDrumSound(() => fakeContext(), noKit, loadPad);
  sound.preload(padOn());
  first.reject(new Error('offline'));
  await settle();
  expect(first.disposed).toBe(true);
  sound.preload(padOn());
  await settle();
  expect(loadPad).toHaveBeenCalledTimes(2);
});

test('a pad that arrives after close is dropped, and close disposes loaded pads', async () => {
  const late = fakePad();
  const loaded = fakePad();
  loaded.resolve();
  const pads = [loaded, late];
  const sound = createDrumSound(() => fakeContext(), noKit, async () => pads.shift() as Kit);
  sound.preload(padOn());
  await settle();
  sound.preload(padOn('soundfont'));
  await settle();
  sound.close();
  expect(loaded.disposed).toBe(true);
  late.resolve();
  await settle();
  expect(late.disposed).toBe(true);
  sound.playPad('mellotron', chord, 0, 1);
  expect(loaded.started).toEqual([]);
});

test('a pad whose load promise settles after close is dropped before its ready', async () => {
  const early = fakePad();
  let give!: (p: Kit) => void;
  const sound = createDrumSound(() => fakeContext(), noKit, () => new Promise<Kit>((r) => (give = r)));
  sound.preload(padOn());
  sound.close();
  give(early);
  await settle();
  expect(early.disposed).toBe(true);
});
