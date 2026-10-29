// Builds the shared context, mounts every region, and runs the one animation loop. Generic on
// purpose: no stream after wave 0 edits this file. Regions live in src/app/mount-*.ts.
import { createPlayer } from './app/player';
import { createStore } from './app/state';
import { route } from './app/route';
import type { AppContext, Mount, Mounted } from './app/mount';
import { mountJuggler } from './app/mount-juggler';
import { mountLadder } from './app/mount-ladder';
import { mountKnobs } from './app/mount-knobs';
import { mountSoundPanel } from './app/mount-sound-panel';
import { mountAbout } from './app/mount-about';
import { mountShare } from './app/mount-share';
import { createDrumSound } from './sound/drum-sound';
import { browserContext, tr808 } from './sound/tr808';
import { copy } from './ui/copy';

const app = document.getElementById('app');
if (app) {
  app.innerHTML = `
    <header>
      <h1>${copy.title}</h1>
      <p>${copy.placeholder}</p>
    </header>
    <div class="play-view">
      <section class="region-juggler"></section>
      <section class="region-ladder"></section>
      <section class="region-knobs"></section>
      <section class="region-sound-panel"></section>
    </div>
    <section class="region-about" hidden></section>
  `;
  const region = (name: string) => app.querySelector(`.region-${name}`) as HTMLElement;
  const playView = app.querySelector('.play-view') as HTMLElement;

  // The smoke test (SPEC §7.8) watches this: audio output itself is not observable.
  app.dataset.eventsScheduled = '0';
  const sound = createDrumSound(browserContext, tr808);
  const player = createPlayer(sound, { onScheduled: (n) => (app.dataset.eventsScheduled = String(n)) });
  const store = createStore();
  const ctx: AppContext = { store, player, sound };

  // Samples preload on page open; a press before they arrive is silent (SPEC §5.4).
  sound.preload(store.get().mapping);

  const mounts: [Mount, HTMLElement][] = [
    [mountJuggler, region('juggler')],
    [mountLadder, region('ladder')],
    [mountKnobs, region('knobs')],
    [mountSoundPanel, region('sound-panel')],
    [mountAbout, region('about')],
    [mountShare, app],
  ];
  const draws = mounts
    .map(([mount, root]): Mounted => mount(root, ctx))
    .flatMap((m) => (m.draw ? [m.draw.bind(m)] : []));

  // Play view or About; playback carries on under About.
  const showRoute = () => {
    const about = route(location.hash).view === 'about';
    playView.hidden = about;
    region('about').hidden = !about;
  };
  window.addEventListener('hashchange', showRoute);
  showRoute();

  const frame = () => {
    const view = player.view();
    for (const draw of draws) draw(view);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
