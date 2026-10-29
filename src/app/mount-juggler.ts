// The juggler region (SPEC §4.1), above the ladder. A placeholder until stream A draws the balls.
import type { Mount } from './mount';
import './juggler.css';

export const mountJuggler: Mount = (root) => {
  const stage = document.createElement('div');
  stage.className = 'juggler';
  root.append(stage);
  return {};
};
