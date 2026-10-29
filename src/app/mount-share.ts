// The share link (docs/plans/v1-parallel.md, stream F): restore state from the hash on load,
// keep the hash in step with the store, and remember the last state hash for About's back
// link. A stub until stream F; it draws nothing and adds no element.
import type { Mount } from './mount';

export const mountShare: Mount = () => ({});
