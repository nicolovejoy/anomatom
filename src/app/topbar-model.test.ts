import { expect, test, vi } from 'vitest';
import { createResetConfirm } from './topbar-model';

function setup() {
  let due: (() => void) | null = null;
  const cancel = vi.fn(() => {
    due = null;
  });
  const changes: boolean[] = [];
  const confirm = createResetConfirm({
    after: (fn, ms) => {
      expect(ms).toBe(6000);
      due = fn;
      return 'h';
    },
    cancel,
    timeoutMs: 6000,
    onChange: (o) => changes.push(o),
  });
  return { confirm, cancel, changes, fire: () => due?.(), waiting: () => due !== null };
}

test('opens on a tap and closes on Cancel', () => {
  const t = setup();
  t.confirm.open();
  expect(t.confirm.isOpen()).toBe(true);
  t.confirm.close();
  expect(t.confirm.isOpen()).toBe(false);
  expect(t.changes).toEqual([true, false]);
  expect(t.cancel).toHaveBeenCalled();
  expect(t.waiting()).toBe(false);
});

test('Escape closes it; other keys and a closed bar do nothing', () => {
  const t = setup();
  expect(t.confirm.key('Escape')).toBe(false);
  t.confirm.open();
  expect(t.confirm.key('a')).toBe(false);
  expect(t.confirm.isOpen()).toBe(true);
  expect(t.confirm.key('Escape')).toBe(true);
  expect(t.confirm.isOpen()).toBe(false);
});

test('it withdraws itself when the timer fires', () => {
  const t = setup();
  t.confirm.open();
  t.fire();
  expect(t.confirm.isOpen()).toBe(false);
  expect(t.changes).toEqual([true, false]);
});

test('opening twice or closing twice is one change', () => {
  const t = setup();
  t.confirm.open();
  t.confirm.open();
  t.confirm.close();
  t.confirm.close();
  expect(t.changes).toEqual([true, false]);
});
