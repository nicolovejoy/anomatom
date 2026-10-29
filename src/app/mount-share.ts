// The share link (docs/plans/v1-parallel.md, stream F): restore state from the hash on load,
// keep the hash in step with the store, and remember the last state hash for About's back
// link. The logic is in share.ts; this file hands it the real location and timer. It draws
// nothing and adds no element. `route()` (main.ts) decides play versus About; this handles
// only the state.
import { SHARE } from '../tunables';
import type { Mount } from './mount';
import { createShare } from './share';

export const mountShare: Mount = (_root, { store }) => {
  const share = createShare({
    store,
    hash: () => location.hash,
    replaceHash: (hash) => history.replaceState(history.state, '', hash),
    after: (fn, ms) => setTimeout(fn, ms),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    debounceMs: SHARE.hashDebounceMs,
  });
  share.start();
  window.addEventListener('hashchange', share.onHashChange);
  // A reload or close within the debounce still keeps the last edit in the address.
  window.addEventListener('pagehide', share.flush);
  return {};
};
