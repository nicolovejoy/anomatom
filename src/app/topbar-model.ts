// The top bar's reset confirm (v4 plan, ruling 6): closed, open, and back to closed on Cancel,
// Escape or a timeout. Pure: the timer arrives as deps, so this is tested with fakes.
export interface ResetConfirmDeps {
  after(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  /** How long the question stays before it withdraws itself. */
  readonly timeoutMs: number;
  /** Called with the new state whenever it changes. */
  onChange(open: boolean): void;
}

export function createResetConfirm(deps: ResetConfirmDeps) {
  let open = false;
  let timer: unknown;

  function set(next: boolean) {
    if (next === open) return;
    open = next;
    if (open) timer = deps.after(() => set(false), deps.timeoutMs);
    else deps.cancel(timer);
    deps.onChange(open);
  }

  return {
    isOpen: () => open,
    open: () => set(true),
    close: () => set(false),
    /** A key press anywhere: Escape withdraws the question. Returns whether it was handled. */
    key(key: string): boolean {
      if (!open || key !== 'Escape') return false;
      set(false);
      return true;
    },
  };
}
