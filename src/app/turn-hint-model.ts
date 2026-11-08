// The hint that says the 3D view turns (v6.9 ruling 2): shown from the moment the 3D view shows
// until the reader's first turn or zoom, then gone for the rest of the page's life. No timer.
export type HintEvent = 'shown3d' | 'hidden3d' | 'turned';
export interface HintState {
  readonly in3d: boolean;
  readonly turned: boolean;
}
export const hintStart: HintState = { in3d: false, turned: false };

export function hintStep(state: HintState, event: HintEvent): HintState {
  if (event === 'turned') return { ...state, turned: true };
  return { ...state, in3d: event === 'shown3d' };
}

export const hintShows = (state: HintState): boolean => state.in3d && !state.turned;
