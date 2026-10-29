// The About page (SPEC §4.4). A placeholder until stream D writes it. `main.ts` shows it when
// the hash is `#about`; playback carries on underneath.
import { copy } from '../ui/copy';
import type { Mount } from './mount';
import './about.css';

export const mountAbout: Mount = (root, { store }) => {
  const page = document.createElement('article');
  page.className = 'about';
  const heading = document.createElement('h2');
  heading.textContent = copy.aboutTitle;
  const back = document.createElement('a');
  back.textContent = copy.aboutBack;
  // Back to the last play-view state, or to the bare play view before there is one.
  const setBack = () => (back.href = store.get().lastStateHash ?? '#');
  setBack();
  store.subscribe(setBack);
  page.append(heading, back);
  root.append(page);
  return {};
};
