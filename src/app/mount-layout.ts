// The wide layout (docs/plans/v5-sound-model.md, ruling 8): the top bar's Patterns / Sound
// choice (v6.9 removed Stage) and the classes the page's CSS lays out by. `.is-web` marks the wide layout (wide and tall
// enough; a phone on its side keeps the phone's deck); `.panel-<name>` the panel beside the stage.
// The logic, and how the panel keeps in step with the sheet's tab, is in layout-model.ts.
//
// Full view (docs/plans/v6-9-full-view.md): `.is-full` on the app while `AppState.full` holds, and
// from the width and the pointer kind (full-view-model.ts) `.is-full-two-rows`
// and `.is-full-caps`, which full-view.css lays the row out by. `.is-coarse` marks a finger as the
// main pointer (`pointer: coarse`, as mount-knobs.ts reads it).
import { DECK, FULL, LADDER, SHEET } from '../tunables';
import { copy } from '../ui/copy';
import { rowLayout } from './full-view-model';
import { createPanelSync, layoutPatch, PANELS, webMedia } from './layout-model';
import type { Mount } from './mount';
import { route } from './route';
import './full-view.css';

export const mountLayout: Mount = (app, { store }) => {
  store.derive(createPanelSync());
  const choice = app.querySelector('.panel-choice') as HTMLElement;
  choice.innerHTML = PANELS.map(
    (p) => `<button type="button" class="panel-option" data-panel="${p}" aria-pressed="false">${copy.panelNames[p]}</button>`,
  ).join('');
  const options = [...choice.querySelectorAll<HTMLButtonElement>('.panel-option')];
  for (const option of options) {
    option.addEventListener('click', () => store.set({ panel: option.dataset.panel as (typeof PANELS)[number] }));
  }

  const web = window.matchMedia(webMedia(SHEET.wideMinWidthPx, DECK.dockedMinHeightPx));
  const coarse = window.matchMedia('(pointer: coarse)');
  // Full view's sizes, for full-view.css: the strip (a third of the wide layout's, a fixed height
  // elsewhere) and the row (a finger's is taller).
  app.style.setProperty('--full-strip-wide', `${Math.round(LADDER.heightPx * FULL.stripFractionWide)}px`);
  app.style.setProperty('--full-strip-phone', `${FULL.stripPhonePx}px`);
  app.style.setProperty('--full-row', `${FULL.rowPx}px`);
  app.style.setProperty('--full-row-coarse', `${FULL.rowCoarsePx}px`);
  app.style.setProperty('--full-row-stacked', `${FULL.rowStackedPx}px`);
  app.style.setProperty('--pick-chip', `${FULL.pickChipPx}px`);
  app.style.setProperty('--pick-pop-gap', `${FULL.pickPopGapPx}px`);
  app.style.setProperty('--pick-filters-pad', `${FULL.pickFiltersPadYPx}px ${FULL.pickFiltersPadXPx}px`);
  app.style.setProperty('--full-name-min', `${FULL.nameMinPx}px`);
  app.style.setProperty('--full-name-min-h', `${FULL.nameMinHeightPx}px`);
  app.style.setProperty('--full-name-pad', `${FULL.namePadPx}px`);
  app.style.setProperty('--full-caret', `${FULL.caretPx}px`);
  function renderFull() {
    const layout = rowLayout(app.clientWidth, coarse.matches);
    app.classList.toggle('is-coarse', coarse.matches);
    app.classList.toggle('is-full', store.get().full);
    app.classList.toggle('is-full-two-rows', layout.rows === 2);
    app.classList.toggle('is-full-caps', layout.keyCaps);
  }
  function render() {
    const panel = store.get().panel;
    app.classList.toggle('is-web', web.matches);
    for (const p of PANELS) app.classList.toggle(`panel-${p}`, p === panel);
    for (const option of options) option.setAttribute('aria-pressed', String(option.dataset.panel === panel));
    renderFull();
  }
  // The wide layout has no mute button: a mute from phone width is cleared as it takes over.
  web.addEventListener('change', () => {
    store.set(layoutPatch(web.matches));
    render();
  });
  coarse.addEventListener('change', render);
  store.set(layoutPatch(web.matches));
  store.subscribe((state, previous) => {
    if (state.panel !== previous.panel) render();
    else if (state.full !== previous.full) renderFull();
  });
  // About has no top bar to come back from: a link to it (the back button) leaves full view.
  window.addEventListener('hashchange', () => route(location.hash).view === 'about' && store.set({ full: false }));
  coarse.addEventListener('change', renderFull);
  window.addEventListener('resize', renderFull);
  render();
  return {};
};
