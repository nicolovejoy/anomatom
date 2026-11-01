// The top bar's wordmark and its reset confirm (v4 plan, ruling 6). The logic is
// topbar-model.ts; this wires the DOM. Reset is a full reload at the bare address: a fresh visit.
import { RESET } from '../tunables';
import type { Mount } from './mount';
import { createResetConfirm } from './topbar-model';

export const mountTopbar: Mount = (root) => {
  const main = root.querySelector('.topbar-main') as HTMLElement;
  const ask = root.querySelector('.topbar-confirm') as HTMLElement;
  const wordmark = root.querySelector('.wordmark') as HTMLButtonElement;
  const cancel = root.querySelector('.reset-cancel') as HTMLButtonElement;
  const confirm = createResetConfirm({
    after: (fn, ms) => setTimeout(fn, ms),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    timeoutMs: RESET.confirmMs,
    onChange: (open) => {
      main.hidden = open;
      ask.hidden = !open;
      if (open) cancel.focus();
      else if (ask.contains(document.activeElement) || document.activeElement === document.body) wordmark.focus();
    },
  });
  wordmark.addEventListener('click', confirm.open);
  cancel.addEventListener('click', confirm.close);
  (root.querySelector('.reset-go') as HTMLButtonElement).addEventListener('click', () => location.assign(location.pathname));
  // Capture phase, so one Escape closes the confirm and nothing else (the phone sheet stays open).
  document.addEventListener(
    'keydown',
    (event) => {
      if (confirm.key(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
  return {};
};
