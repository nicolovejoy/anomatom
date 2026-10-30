import { expect, test, vi } from 'vitest';
import { KIT_VOLUME } from '../tunables';
import { drumMachines, retrying, type SmplrDrums } from './drum-machine';

type Note = { note: string; velocity: number; time: number; duration: number };

/** A fake smplr: every machine's load is resolved or rejected by hand; `made` lists them in order. */
function fakeSmplr() {
  const made: {
    options: { instrument: string; volume: number; destination: AudioNode; loader: unknown };
    started: Note[];
    disconnected: boolean;
    resolve: () => void;
    reject: (e: unknown) => void;
  }[] = [];
  const loaders: unknown[] = [];
  const smplr: SmplrDrums<{ id: number }> = {
    SampleLoader: () => {
      const loader = { id: loaders.length };
      loaders.push(loader);
      return loader;
    },
    DrumMachine: (_context, options) => {
      let resolve!: () => void;
      let reject!: (e: unknown) => void;
      const load = new Promise<unknown>((res, rej) => {
        resolve = () => res(undefined);
        reject = rej;
      });
      const m = { options, started: [] as Note[], disconnected: false, resolve, reject };
      made.push(m);
      return {
        load,
        start: (e: Note) => m.started.push(e),
        disconnect: () => {
          m.disconnected = true;
        },
      };
    },
  };
  return { smplr, made, loaders };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const ctx = () => ({}) as AudioContext;
const node = () => ({}) as AudioNode;

test('one loader per context, shared by every machine; the machine is the kit asked for, into the part\'s node', async () => {
  const { smplr, made, loaders } = fakeSmplr();
  const load = drumMachines(async () => smplr);
  const [a, b] = [ctx(), ctx()];
  const [d0, d1, d2] = [node(), node(), node()];
  void load(a, 0, d0, 'TR-808');
  await settle();
  made[0]?.resolve();
  void load(a, 1, d1, 'LM-2');
  void load(b, 0, d2, 'TR-808');
  await settle();
  expect(loaders).toHaveLength(2);
  const by = (d: AudioNode) => made.find((m) => m.options.destination === d)?.options;
  expect([d0, d1, d2].map((d) => by(d)?.instrument)).toEqual(['TR-808', 'LM-2', 'TR-808']);
  expect(by(d0)?.loader).toBe(loaders[0]);
  expect(by(d1)?.loader).toBe(loaders[0]);
  expect(by(d2)?.loader).toBe(loaders[1]);
  expect(made[0]?.options.volume).toBe(KIT_VOLUME);
});

test('machines on one context are made one after another: the next waits for the last one\'s samples, loaded or failed', async () => {
  const { smplr, made } = fakeSmplr();
  const load = drumMachines(async () => smplr);
  const c = ctx();
  void load(c, 0, node(), 'TR-808');
  const second = load(c, 1, node(), 'TR-808');
  const third = load(c, 2, node(), 'MFB-512');
  await settle();
  expect(made).toHaveLength(1);
  made[0]?.reject(new Error('offline'));
  await settle();
  expect(made).toHaveLength(2);
  made[1]?.resolve();
  await settle();
  expect(made).toHaveLength(3);
  await expect((await second).ready).resolves.toBeUndefined();
  made[2]?.resolve();
  await expect((await third).ready).resolves.toBeUndefined();
});

test('cached per part and kit: asking again for a kit the part has had is the same machine, at once', async () => {
  const { smplr, made } = fakeSmplr();
  const load = drumMachines(async () => smplr);
  const c = ctx();
  const d = node();
  const tr808 = load(c, 0, d, 'TR-808');
  await settle();
  made[0]?.resolve();
  const lm2 = load(c, 0, d, 'LM-2');
  expect(load(c, 0, d, 'TR-808')).toBe(tr808);
  expect(load(c, 0, d, 'LM-2')).toBe(lm2);
  await settle();
  expect(made.map((m) => m.options.instrument)).toEqual(['TR-808', 'LM-2']);
  // Another part's node is another machine (its own pan and gain), on the same shared loader.
  made[1]?.resolve();
  void load(c, 1, node(), 'TR-808');
  await settle();
  expect(made).toHaveLength(3);
});

test('a hit names a role; the machine plays the kit\'s sample for it', async () => {
  const { smplr, made } = fakeSmplr();
  const load = drumMachines(async () => smplr);
  const c = ctx();
  const d = node();
  const p808 = load(c, 0, d, 'TR-808');
  await settle();
  made[0]?.resolve();
  const pRz = load(c, 0, d, 'Casio-RZ1');
  await settle();
  const [k808, kRz] = [await p808, await pRz];
  const hit = { note: 'hihat-close', velocity: 90, time: 1, duration: 0.5 };
  k808.start(hit);
  kRz.start(hit);
  kRz.start({ ...hit, note: 'tom-hi' });
  expect(made[0]?.started).toEqual([hit]);
  expect(made[1]?.started.map((e) => e.note)).toEqual(['hihat-closed', 'tom-1']);
  expect(made[1]?.started[0]).toEqual({ ...hit, note: 'hihat-closed' });
});

test('dispose disconnects and forgets, so the next ask makes a fresh machine (a failed kit is fetched afresh)', async () => {
  const { smplr, made } = fakeSmplr();
  const load = drumMachines(async () => smplr);
  const c = ctx();
  const d = node();
  const first = load(c, 0, d, 'LM-2');
  await settle();
  made[0]?.reject(new Error('offline'));
  const kit = await first;
  await expect(kit.ready).rejects.toThrow('offline');
  kit.dispose();
  expect(made[0]?.disconnected).toBe(true);
  const second = load(c, 0, d, 'LM-2');
  expect(second).not.toBe(first);
  await settle();
  expect(made).toHaveLength(2);
  // Disposing the old one again does not forget the new one.
  kit.dispose();
  expect(load(c, 0, d, 'LM-2')).toBe(second);
});

test('a machine smplr refuses at once (an unknown instrument) fails that load and frees the queue', async () => {
  const { smplr, made } = fakeSmplr();
  const strict: SmplrDrums<{ id: number }> = {
    SampleLoader: smplr.SampleLoader,
    DrumMachine: (context, options) => {
      if (options.instrument === 'nope') throw new Error('Invalid instrument: nope');
      return smplr.DrumMachine(context, options);
    },
  };
  const load = drumMachines(async () => strict);
  const c = ctx();
  await expect(load(c, 0, node(), 'nope')).rejects.toThrow('Invalid instrument');
  const next = load(c, 1, node(), 'TR-808');
  await settle();
  expect(made).toHaveLength(1);
  made[0]?.resolve();
  await expect((await next).ready).resolves.toBeUndefined();
});

test('smplr failing to import is not cached: the next ask tries again', async () => {
  const { smplr, made } = fakeSmplr();
  let fail = true;
  const load = drumMachines(async () => {
    if (fail) throw new Error('no network');
    return smplr;
  });
  const c = ctx();
  const d = node();
  const first = load(c, 0, d, 'TR-808');
  await expect(first).rejects.toThrow('no network');
  fail = false;
  const second = load(c, 0, d, 'TR-808');
  expect(second).not.toBe(first);
  await settle();
  expect(made).toHaveLength(1);
});

test('retrying: one import while it succeeds; a failure is tried again on the next call', async () => {
  const importer = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue('smplr');
  const once = retrying(importer);
  await expect(once()).rejects.toThrow('offline');
  await expect(once()).resolves.toBe('smplr');
  await expect(once()).resolves.toBe('smplr');
  expect(importer).toHaveBeenCalledTimes(2);
});
