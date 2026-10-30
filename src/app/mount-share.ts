// The share link (docs/plans/v1-parallel.md, stream F): restore state from the hash on load,
// keep the hash in step with the store, and remember the last state hash for About's back
// link. The logic is in share.ts; this file hands it the real location and timer. It draws
// nothing and adds no element. `route()` (main.ts) decides play versus About; this handles
// only the state.
import { copy } from '../ui/copy';
import { SHARE } from '../tunables';
import type { Mount } from './mount';
import { createShare, quietly, shareLink, shareUrl } from './share';

export const mountShare: Mount = (root, { store }) => {
  const share = createShare({
    store,
    hash: () => location.hash,
    replaceHash: quietly((hash) => history.replaceState(history.state, '', hash)),
    after: (fn, ms) => setTimeout(fn, ms),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    debounceMs: SHARE.hashDebounceMs,
  });
  share.start();
  window.addEventListener('hashchange', share.onHashChange);
  // A reload or close within the debounce still keeps the last edit in the address.
  window.addEventListener('pagehide', share.flush);
  // The share button (in the head row, mount-knobs.ts): the live state, not the debounced hash.
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  root.addEventListener('click', (event) => {
    if (!(event.target as Element).closest('#share')) return;
    const url = shareUrl(location.href, store.get());
    const clipboard = navigator.clipboard as Clipboard | undefined;
    void shareLink(url, {
      share: typeof navigator.share === 'function' ? (data) => navigator.share(data) : undefined,
      writeText: clipboard ? (text) => clipboard.writeText(text) : undefined,
    }).then((outcome) => {
      const status = root.querySelector('#share-status');
      if (!status || outcome === 'shared' || outcome === 'cancelled') return;
      status.textContent = outcome === 'copied' ? copy.linkCopied : copy.linkNotCopied;
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => (status.textContent = ''), SHARE.statusMs);
    });
  });
  return {};
};
