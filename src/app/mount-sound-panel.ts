// The sound panel (SPEC §4.3), a drawer over the play view. A placeholder until stream F.
import type { Mount } from './mount';
import './sound-panel.css';

export const mountSoundPanel: Mount = (root) => {
  const drawer = document.createElement('div');
  drawer.className = 'sound-panel';
  drawer.hidden = true;
  root.append(drawer);
  return {};
};
