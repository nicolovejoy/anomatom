// The mount contract (docs/plans/v1-parallel.md, "Mount contract"). Each region of the page is
// one `mountX(root, ctx)` in its own file; `main.ts` calls them all and runs one animation
// loop over the `draw` functions they return.
import type { DrumSound } from '../sound/drum-sound';
import type { PlayerView } from '../view/types';
import type { Player } from './player';
import type { Store } from './state';

export interface AppContext {
  readonly store: Store;
  readonly player: Player;
  readonly sound: DrumSound;
}

export interface Mounted {
  /** Called once per animation frame with that frame's player view. */
  draw?(view: PlayerView): void;
}

export type Mount = (root: HTMLElement, ctx: AppContext) => Mounted;
