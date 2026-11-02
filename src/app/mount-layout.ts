// The wide layout (docs/plans/v5-sound-model.md, ruling 8): the top bar's Patterns / Sound / Stage
// choice and the classes the page's CSS lays out by. `.is-web` marks the wide layout (wide and tall
// enough; a phone on its side keeps the phone's deck); `.panel-<name>` the panel beside the stage.
// The logic, and how the panel keeps in step with the sheet's tab, is in layout-model.ts.
import { DECK, SHEET } from '../tunables';
import { copy } from '../ui/copy';
import { createPanelSync, PANELS, webMedia } from './layout-model';
import type { Mount } from './mount';

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
  function render() {
    const panel = store.get().panel;
    app.classList.toggle('is-web', web.matches);
    for (const p of PANELS) app.classList.toggle(`panel-${p}`, p === panel);
    for (const option of options) option.setAttribute('aria-pressed', String(option.dataset.panel === panel));
  }
  web.addEventListener('change', render);
  store.subscribe((state, previous) => {
    if (state.panel !== previous.panel) render();
  });
  render();
  return {};
};
