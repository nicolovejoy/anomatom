// Builds the shared context, mounts every region, and runs the one animation loop. Generic on
// purpose: no stream after wave 0 edits this file. Regions live in src/app/mount-*.ts.
import { createPlayer } from './app/player';
import { createStore } from './app/state';
import { route } from './app/route';
import type { AppContext, Mount, Mounted } from './app/mount';
import { mountJuggler } from './app/mount-juggler';
import { mountLadder } from './app/mount-ladder';
import { mountKnobs } from './app/mount-knobs';
import { mountFirstMinute } from './app/mount-first-minute';
import { mountSoundPanel } from './app/mount-sound-panel';
import { mountSheet } from './app/mount-sheet';
import { mountAbout } from './app/mount-about';
import { mountShare } from './app/mount-share';
import { mountTopbar } from './app/mount-topbar';
import { createDrumSound } from './sound/drum-sound';
import { browserContext, drumMachine } from './sound/drum-machine.browser';
import { copy } from './ui/copy';

const app = document.getElementById('app');
if (app) {
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-main">
        <h1 class="wordmark-wrap"><button type="button" class="wordmark" aria-label="${copy.wordmarkLabel}">${copy.title}</button></h1>
        <span class="topbar-actions">
          <span id="share-status-top" class="share-status-top" role="status" aria-live="polite"></span>
          <button id="share-top" type="button" class="topbar-button" data-share aria-label="${copy.shareLabel}">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
          </button>
          <a href="#about" class="about-link" aria-label="${copy.aboutButtonLabel}">${copy.aboutButtonGlyph}</a>
        </span>
      </div>
      <div class="topbar-confirm" hidden>
        <span class="reset-question" role="alert">${copy.resetQuestion}</span>
        <span class="topbar-actions">
          <button type="button" class="reset-go">${copy.resetConfirm}</button>
          <button type="button" class="reset-cancel">${copy.resetCancel}</button>
        </span>
      </div>
    </header>
    <div class="play-view">
      <div class="stage">
        <section class="region-juggler"></section>
        <section class="region-ladder"></section>
      </div>
      <section class="region-first-minute"></section>
      <section class="region-sheet sheet" aria-label="${copy.sheetLabel}">
        <button type="button" class="sheet-grab" aria-expanded="false" aria-controls="sheet-panels"><span></span></button>
        <div class="sheet-head"></div>
        <div class="sheet-tabs" role="tablist" aria-label="${copy.sheetLabel}"></div>
        <div class="sheet-panels" id="sheet-panels">
          <div class="sheet-panel" id="panel-pattern" role="tabpanel" aria-labelledby="tab-pattern" hidden></div>
          <div class="sheet-panel" id="panel-rhythm" role="tabpanel" aria-labelledby="tab-rhythm" hidden></div>
          <div class="sheet-panel region-sound-panel" id="panel-sound" role="tabpanel" aria-labelledby="tab-sound" hidden></div>
        </div>
      </section>
    </div>
    <section class="region-about" hidden></section>
  `;
  const region = (name: string) => app.querySelector(`.region-${name}`) as HTMLElement;
  const playView = app.querySelector('.play-view') as HTMLElement;

  // The smoke test (SPEC §7.8) watches this: audio output itself is not observable.
  app.dataset.eventsScheduled = '0';
  const sound = createDrumSound(browserContext, drumMachine);
  const player = createPlayer(sound, { onScheduled: (n) => (app.dataset.eventsScheduled = String(n)) });
  const store = createStore();
  const ctx: AppContext = { store, player, sound };

  // Samples preload on page open; a press before they arrive is silent (SPEC §5.4).
  sound.preload(store.get().mapping);

  const mounts: [Mount, HTMLElement][] = [
    [mountJuggler, region('juggler')],
    [mountLadder, region('ladder')],
    [mountKnobs, region('sheet')],
    [mountSoundPanel, region('sound-panel')],
    [mountSheet, region('sheet')],
    [mountFirstMinute, region('first-minute')],
    [mountAbout, region('about')],
    [mountShare, app],
    [mountTopbar, app.querySelector('.topbar') as HTMLElement],
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
