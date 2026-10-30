// The sheet's frame (docs/plans/phone-sheet.md, stream A): the handle, the tabs Pattern ·
// Rhythm · Sound, and which panel shows. On a phone it is a bottom sheet, closed until a tab,
// the summary or the handle opens it; the handle (drag or tap), the open tab again, and Escape
// close it. On a wide screen it is a column on the right, always open on a tab.
//
// `AppState.sheetTab` holds the open tab; this mount is its only reader, and it writes it from
// the tabs and the handle (the summary button in mount-knobs.ts and "Make your own" write it
// too). The panels' content comes from mount-knobs.ts (Pattern, Rhythm, and the head with
// the summary and Play) and mount-sound-panel.ts (Sound). The logic is in sheet-model.ts.
import { LADDER, SHEET } from '../tunables';
import { copy } from '../ui/copy';
import type { Mount } from './mount';
import { dragEnd, edgeTab, pressTab, shownTab, stepTab, TABS } from './sheet-model';
import type { SheetTab } from './state';
import './sheet.css';

export const mountSheet: Mount = (root, { store }) => {
  const app = (root.closest('#app') as HTMLElement | null) ?? document.body;
  const $ = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const grab = $<HTMLButtonElement>('.sheet-grab');
  const tabList = $<HTMLDivElement>('.sheet-tabs');
  tabList.innerHTML = TABS.map(
    (t) =>
      `<button type="button" role="tab" class="sheet-tab" id="tab-${t}" data-tab="${t}" aria-controls="panel-${t}">${copy.tabNames[t]}</button>`,
  ).join('');
  const tabs = TABS.map((t) => $<HTMLButtonElement>(`#tab-${t}`));
  const panels = TABS.map((t) => $<HTMLDivElement>(`#panel-${t}`));

  const wideQuery = window.matchMedia(`(min-width: ${SHEET.wideMinWidthPx}px)`);
  const landscapeQuery = window.matchMedia(
    `(max-width: ${SHEET.wideMinWidthPx - 1}px) and (max-height: ${SHEET.landscape.maxHeightPx}px) and (orientation: landscape)`,
  );
  let last: SheetTab = 'pattern';
  app.style.setProperty('--sheet-column', `${SHEET.columnPx}px`);
  app.style.setProperty('--sheet-landscape-column', `${SHEET.landscape.columnPx}px`);
  app.style.setProperty('--sheet-open-height', `${SHEET.openHeightDvh}dvh`);

  function render() {
    const wide = wideQuery.matches;
    const open = store.get().sheetTab;
    if (open) last = open;
    const shown = shownTab(open, last, wide);
    const landscape = !wide && landscapeQuery.matches;
    app.classList.toggle('is-wide', wide);
    app.classList.toggle('is-landscape', landscape);
    app.classList.toggle('sheet-open', shown !== null);
    app.style.setProperty(
      '--ladder-height',
      `${wide ? LADDER.heightPx : landscape ? SHEET.landscape.ladderPx : shown === null ? SHEET.ladderPx.closed : SHEET.ladderPx.open}px`,
    );
    TABS.forEach((t, i) => {
      const tab = tabs[i] as HTMLButtonElement;
      const on = t === shown;
      tab.setAttribute('aria-selected', String(on));
      // One tab stop: the shown tab, or the first while closed.
      tab.tabIndex = on || (shown === null && i === 0) ? 0 : -1;
      (panels[i] as HTMLDivElement).hidden = !on;
    });
    grab.hidden = wide;
    grab.setAttribute('aria-expanded', String(shown !== null));
    grab.setAttribute('aria-label', shown === null ? copy.sheetGrabOpen : copy.sheetGrabClose);
  }

  const setTab = (tab: SheetTab | null) => store.set({ sheetTab: tab });

  tabs.forEach((tab, i) => {
    const t = TABS[i] as SheetTab;
    tab.addEventListener('click', () => setTab(pressTab(shownTab(store.get().sheetTab, last, wideQuery.matches), t, wideQuery.matches)));
    tab.addEventListener('keydown', (e) => {
      const back = e.key === 'ArrowLeft';
      const forward = e.key === 'ArrowRight';
      const edge = e.key === 'Home' ? 'first' : e.key === 'End' ? 'last' : null;
      if (!(back || forward || edge) || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      const next = edge ? edgeTab(edge) : stepTab(t, back ? -1 : 1);
      setTab(next);
      (tabs[TABS.indexOf(next)] as HTMLButtonElement).focus();
    });
  });

  // The handle: a drag past SHEET.dragPx opens or closes; a tap (or Enter) toggles.
  let startY: number | null = null;
  let dragged = false;
  grab.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    dragged = false;
    grab.setPointerCapture(e.pointerId);
  });
  grab.addEventListener('pointermove', (e) => {
    if (startY !== null && Math.abs(e.clientY - startY) > SHEET.dragPx) dragged = true;
  });
  grab.addEventListener('pointerup', (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    if (dragged) setTab(dragEnd(store.get().sheetTab, last, dy, SHEET.dragPx));
  });
  grab.addEventListener('pointercancel', () => (startY = null));
  grab.addEventListener('click', () => {
    if (dragged) {
      dragged = false;
      return;
    }
    setTab(dragEnd(store.get().sheetTab, last, 0, SHEET.dragPx));
  });

  // Escape closes the phone sheet; focus goes back to the summary that opens it.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || wideQuery.matches || store.get().sheetTab === null) return;
    const hadFocus = root.contains(document.activeElement);
    setTab(null);
    if (hadFocus) (root.querySelector('.summary') as HTMLButtonElement | null)?.focus();
  });

  wideQuery.addEventListener('change', render);
  landscapeQuery.addEventListener('change', render);
  store.subscribe((state, previous) => {
    if (state.sheetTab !== previous.sheetTab) render();
  });
  render();
  return {};
};
