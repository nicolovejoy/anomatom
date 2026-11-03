// The deck (docs/plans/v4-deck.md, rulings 1 to 4): the transport bar (Play/Pause, ‹, the pattern,
// ›, mute and volume), the sound row (Listen for, Details) and the pattern wheel. On a phone the
// wheel opens over the stage from the pattern name.
//
// The wide layout (docs/plans/v5-sound-model.md, ruling 8; `.is-web`, wide and tall enough) is
// different: the pattern name moves to the top bar beside the mark, the bar under the stage is
// Play alone with key caps (no ‹ ›, no volume: Volume is the Sound panel's), the sound row goes,
// and the wheel stays open at the top of the right-hand column while the Patterns panel shows.
// There (docs/plans/v6-wheel-filters-three.md, rulings 1 to 3) its rows are taller, it fills the
// column while the editor (Pattern and Rhythm) is hidden, which it is until a click on Make your
// own or a pattern that is no card (docs/plans/v6-1-wheel-feel.md, ruling 2). It is a menu
// (docs/plans/v6-2-wheel-ends.md, ruling 3): each row once, the band on the chosen row, a native
// scroll that only browses. On a phone it is a drum with ends (ruling 4).
// The logic is in deck-model.ts and layout-model.ts; this file is elements and events.
//
// This mount owns Play and the keys that drive it: Space plays and pauses from anywhere (one
// capturing handler), except in a pattern text input and in a control that uses Space itself
// (keepsSpace in sheet-model.ts) and on Make your own, which Space opens; on the wide layout ↑ and ↓
// step the pattern and ← and → Listen for, elsewhere ← and → step the pattern, except in a field, a
// select, a slider or a tab (deckKey in layout-model.ts, v6.1 ruling 3). A
// select hands focus to Play after a choice, so the keys work again at once. Every step stops at
// the ends (v6.2 ruling 2).
import { LISTENS, type Listen } from '../sound/drummers';
import { DECK, KNOBS, SHEET } from '../tunables';
import { copy } from '../ui/copy';
import {
  deckLabel,
  deckPresets,
  chooseFilter,
  filterChips,
  filteredPresets,
  filterKeeper,
  sameFilter,
  editorShows,
  type EditorEvent,
  menuBand,
  menuRows,
  nearestTop,
  fitFontPx,
  nextFit,
  groupTag,
  keyTarget,
  masterGain,
  nextPhase,
  type WheelPhase,
  presetIndex,
  rowAfterKey,
  scrollForRow,
  settledPick,
  sheetWheelPlace,
  start,
  stepIndex,
  toggle,
  turnsWheel,
  volumePatch,
  wheelNotch,
  wheelPlace,
  wheelRowAt,
} from './deck-model';
import { cardPattern, presetPatch } from './first-minute';
import type { Preset } from './presets';
import { deckKey, nextListen, webMedia } from './layout-model';
import type { Mount } from './mount';
import { route } from './route';
import { fillPercent, keepsSpace } from './sheet-model';
import './deck.css';

const chevron = (left: boolean) =>
  `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="${left ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;
const SPEAKER =
  '<svg class="icon-on" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>' +
  '<svg class="icon-off" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6"/></svg>';

export const mountDeck: Mount = (root, { store, player, sound }) => {
  const app = (root.closest('#app') as HTMLElement | null) ?? document.body;
  const t = copy.deck;
  // The cards the wheel holds, in order, then Make your own: `rowCount` rows, each once, a list
  // item a row (v6.2 ruling 1). ‹ › and ↑ ↓ walk the same order. buildList() renders it. Under a
  // filter chip (v6.1 ruling 4) the order is that filter's cards alone (applyFilter).
  let order: readonly Preset[] = filteredPresets(deckPresets(), store.get().deckFilter);
  let rowCount = order.length + 1;
  /** The chips, from the deck (filterChips): Balls 3 4 5, Jugglers 2 3 today. */
  const chips = filterChips();
  let own = order.length;

  root.innerHTML = `
    <div class="deck-bar" role="group" aria-label="${t.label}">
      <button id="play" type="button" class="deck-play" data-state="stopped">
        <svg class="icon-play" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>
        <svg class="icon-pause" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" fill="currentColor"/><rect x="14" y="4" width="5" height="16" fill="currentColor"/></svg>
        <span class="sr-only play-label">${copy.play}</span>
      </button>
      <div class="deck-keys" role="group" aria-label="${t.keysLabel}">${t.keys
        .map((k) => `<span class="deck-key">${k.caps.map((c) => `<kbd>${c}</kbd>`).join('')}<span>${k.does}</span></span>`)
        .join('')}</div>
      <button type="button" class="deck-arrow deck-prev" aria-label="${t.previous}">${chevron(true)}</button>
      <button type="button" class="deck-pattern">
        <code class="deck-notation"></code>
        <span class="deck-line"><span class="deck-sub"><span class="deck-name"></span><span class="deck-dot">${t.dot}</span><span class="deck-meta"></span></span><span id="pending" class="deck-pending" hidden>${copy.nextCycle}</span></span>
      </button>
      <button type="button" class="deck-arrow deck-next" aria-label="${t.next}">${chevron(false)}</button>
      <span class="deck-volume">
        <button type="button" id="mute" class="deck-mute" aria-pressed="false" aria-label="${t.mute}">${SPEAKER}</button>
        <input id="volume" class="slider" type="range" min="0" max="1" step="${KNOBS.volumeStep}" aria-label="${copy.volumeLabel}" />
      </span>
    </div>
    <div class="deck-picker" id="deck-picker" hidden>
      <div class="deck-filters" role="group" aria-label="${t.filtersLabel}">${(['balls', 'jugglers'] as const)
        .map(
          (by) =>
            `<div class="deck-filter-group" role="group" aria-labelledby="deck-filters-${by}"><span class="deck-filter-label" id="deck-filters-${by}">${t.filterGroups[by]}</span>${chips[by]
              .map((n) => `<button type="button" class="deck-filter" data-by="${by}" data-n="${n}" aria-label="${t.filterName(by, n)}" aria-pressed="false">${n}</button>`)
              .join('')}</div>`,
        )
        .join('')}</div>
      <div class="deck-wheel" id="deck-wheel" hidden>
        <ol class="deck-wheel-list" aria-label="${t.wheelLabel}"></ol>
      </div>
    </div>
    <div class="deck-sound">
      <label class="deck-field"><span class="deck-k">${t.listen}</span>
        <select id="deck-listen">
          ${LISTENS.map((l) => `<option value="${l}">${copy.listenNames[l]}</option>`).join('')}
        </select></label>
      <button type="button" class="deck-details" aria-label="${t.detailsLabel}">${t.details}</button>
    </div>`;

  const $ = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const playButton = $<HTMLButtonElement>('#play');
  const playLabel = $<HTMLSpanElement>('.play-label');
  const patternButton = $<HTMLButtonElement>('.deck-pattern');
  const notation = $<HTMLElement>('.deck-notation');
  const nameEl = $<HTMLSpanElement>('.deck-name');
  const dot = $<HTMLSpanElement>('.deck-dot');
  const metaEl = $<HTMLSpanElement>('.deck-meta');
  const pending = $<HTMLSpanElement>('#pending');
  const mute = $<HTMLButtonElement>('#mute');
  const volume = $<HTMLInputElement>('#volume');
  const picker = $<HTMLDivElement>('.deck-picker');
  const filterButtons = [...root.querySelectorAll<HTMLButtonElement>('.deck-filter')];
  const wheel = $<HTMLDivElement>('.deck-wheel');
  const list = $<HTMLOListElement>('.deck-wheel-list');
  const listenSelect = $<HTMLSelectElement>('#deck-listen');
  const details = $<HTMLButtonElement>('.deck-details');

  /** One list item a row: a card (data-id), or Make your own (.deck-own), last. */
  const rowHtml = (row: number) => {
    const p = order[row];
    const attrs = `class="deck-row${p ? '' : ' deck-own'}" tabindex="-1" data-row="${row}"${p ? ` data-id="${p.id}"` : ''}`;
    return p
      ? `<li><button type="button" ${attrs}><code>${cardPattern(p)}</code><span class="deck-row-name">${copy.presets[p.id]?.name ?? ''}</span><em>${groupTag(p.group)}</em></button></li>`
      : `<li><button type="button" ${attrs}><span class="deck-row-name">${t.makeYourOwn}</span></button></li>`;
  };
  /** The wheel's buttons, one a row. */
  let rows: HTMLButtonElement[] = [];

  root.style.setProperty('--deck-row', `${DECK.rowPx}px`);
  root.style.setProperty('--deck-rows', String(DECK.wheelRows));
  root.style.setProperty('--deck-slider', `${DECK.sliderPx}px`);
  root.style.setProperty('--deck-slider-phone', `${DECK.phoneSliderPx}px`);
  root.style.setProperty('--deck-filters', `${DECK.filtersPx}px`);

  // -------------------------------------------------------------------------------------------
  // Play, and the pattern: step, pick
  // -------------------------------------------------------------------------------------------

  const togglePlay = () => toggle(player, store.get());
  playButton.addEventListener('click', togglePlay);

  const current = () => presetIndex(store.get(), order);
  /**
   * Loads a preset; a playing player plays it from the next cycle, a paused or stopped one stays so.
   * A card picked hides the web editor (v6 ruling 2).
   */
  const pick = (i: number) => {
    const p = order[i];
    if (!p) return;
    restOwn = false;
    setEditor({ kind: 'pickCard' });
    store.dispatch(presetPatch(p));
  };
  /**
   * Chooses card `i` as a step or a key does: the card already on stage is never loaded again (that
   * would queue the same pattern for the next cycle while playing); Make your own just gives way.
   */
  const choose = (i: number) => {
    if (i !== current()) return pick(i);
    restOwn = false;
    setEditor({ kind: 'pickCard' });
  };
  /**
   * One card on, or back: nothing at an end (v6.2 ruling 2). Docked, Make your own chosen is the
   * last row, past the cards (stepIndex).
   */
  const step = (delta: -1 | 1) => {
    const i = stepIndex(current(), delta, order.length, restOwn && docked());
    if (i === null) return;
    choose(i);
    // The card may be on stage already (↑ from Make your own): the band still goes to it.
    markRows();
    scrollToCurrent(true);
  };
  const prevButton = $<HTMLButtonElement>('.deck-prev');
  prevButton.addEventListener('click', () => step(-1));
  $<HTMLButtonElement>('.deck-next').addEventListener('click', () => step(1));

  let notchAcc = 0;
  patternButton.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // Lines or pages (Firefox): one notch an event.
      const px = e.deltaMode === 0 ? e.deltaY : Math.sign(e.deltaY) * DECK.notchPx;
      const r = wheelNotch(notchAcc, px, DECK.notchPx);
      notchAcc = r.acc;
      if (r.step) step(r.step);
    },
    { passive: false },
  );

  // -------------------------------------------------------------------------------------------
  // The wheel
  // -------------------------------------------------------------------------------------------

  // The wide layout (mount-layout.ts sets `.is-web` from the same query): docked in the column.
  const dockedQuery = window.matchMedia(webMedia(SHEET.wideMinWidthPx, DECK.dockedMinHeightPx));
  // A bare address opens with the wheel open on a phone, so a first visit sees the patterns.
  let wheelOpen = location.hash === '' || location.hash === '#';
  const docked = () => dockedQuery.matches;
  /** Docked, the wheel shows with the Patterns panel; on a phone, while opened. */
  const wheelShown = () => (docked() ? store.get().panel === 'patterns' : wheelOpen);

  // The pattern button sits in the bar, between ‹ and ›; on the wide layout, in the top bar.
  const topSlot = document.querySelector('.topbar-pattern');
  const nextButton = $<HTMLButtonElement>('.deck-next');
  function placePattern() {
    if (docked() && topSlot) {
      if (patternButton.parentElement !== topSlot) topSlot.append(patternButton);
    } else if (patternButton.nextElementSibling !== nextButton) nextButton.before(patternButton);
  }
  // The web editor (v6 ruling 2): under the docked wheel the Pattern and Rhythm tabs show only for
  // Make your own or a pattern that is no card (editorShows in deck-model.ts). UI state, never in
  // the link. `restOwn`: the band rests on Make your own, so a re-placed wheel keeps it there.
  let editorShown = current() === null;
  let restOwn = false;
  function setEditor(event: EditorEvent) {
    const next = editorShows(editorShown, event);
    if (next === editorShown) return;
    editorShown = next;
    showEditor();
  }
  function showEditor() {
    app.classList.toggle('deck-editor-hidden', docked() && !editorShown);
    if (docked() && !wheel.hidden) placeWheel();
  }

  /** A phone held upright: the one layout where the wheel takes the sheet (ruling 9). */
  const sheet = document.querySelector<HTMLElement>('.region-sheet');
  const upright = () =>
    !docked() && !app.classList.contains('is-web') && !app.classList.contains('is-wide') && !app.classList.contains('is-landscape');

  /**
   * Over the stage on a phone, measured so it fits every layout: under the figure, or beside it
   * when the stage is short. The stage keeps that part clear (--wheel-pad-*, style.css), so the
   * juggler draws in what is left and stays in view (wheelPlace in deck-model.ts).
   */
  function placeWheel() {
    if (docked() || wheel.hidden) {
      for (const p of ['left', 'top', 'width']) picker.style.removeProperty(p);
      app.style.setProperty('--wheel-pad-bottom', '0px');
      app.style.setProperty('--wheel-pad-right', '0px');
      if (wheel.hidden) return setRows(DECK.wheelRows, DECK.rowPx);
      // Docked (v6 ruling 1, v6.2 ruling 3): taller rows, top aligned; while the editor is hidden,
      // as many as the column holds between the wheel's top and the sheet's head at its foot (Stop,
      // the time slider, the sound's status: as tall as they need), or all of them where they are
      // fewer; DECK.dockedEditRows above the editor when it shows.
      if (editorShown) return setRows(Math.min(rowCount, DECK.dockedEditRows), DECK.dockedRowPx);
      const room = document.documentElement.clientHeight - wheel.getBoundingClientRect().top;
      // The sheet's head shares the column's foot with Play's bar under the stage (the grid's last
      // row): the wheel stops above the taller of the two. Measured against the head alone, a short
      // head (the sound's status gone) let the wheel push the bar's row down, the stage grew and the
      // page overflowed, and the observers on the stage and the sheet looped (WebKit's
      // "ResizeObserver loop completed with undelivered notifications").
      // The wheel's rule at its foot is outside its rows (deck.css), so a short menu has nothing to scroll.
      const head = Math.max(sheet?.offsetHeight ?? 0, (root.querySelector('.deck-bar') as HTMLElement).offsetHeight);
      const rule = wheel.offsetHeight - wheel.clientHeight;
      return setRows(menuRows(rowCount, room - head - rule, DECK.dockedRowPx, DECK.wheelRows), DECK.dockedRowPx);
    }
    const stage = document.querySelector('.stage') as HTMLElement | null;
    const view = root.closest('.play-view') as HTMLElement | null;
    if (!stage || !view) return;
    const s = stage.getBoundingClientRect();
    const v = view.getBoundingClientRect();
    const box = { left: s.left - v.left, top: s.top - v.top, width: s.width, height: s.height };
    // A phone on its side, or a wide screen too short to dock: the right-hand column below the
    // sound row, over the sheet, so the wheel covers neither the beat ladder nor Listen for.
    let column = null;
    if (app.classList.contains('is-landscape') || app.classList.contains('is-wide')) {
      const k = (root.querySelector('.deck-sound') as HTMLElement).getBoundingClientRect();
      column = { left: k.left - v.left, top: k.bottom - v.top, width: k.width, height: v.bottom - k.bottom };
    }
    // A phone upright: the wheel takes the whole sheet, the deck and all (ruling 9).
    const bar = (root.querySelector('.deck-bar') as HTMLElement).getBoundingClientRect();
    const sheetPlace = column || phase === 'rest'
      ? null
      : sheetWheelPlace({ left: 0, top: 0, width: v.width, height: v.height }, { ...box, left: 0 }, bar.top - v.top, DECK.rowPx, DECK.phoneMinRows, DECK.minFigurePx, DECK.filtersPx);
    // The filter chips sit above the rows, in the place (v6 ruling 4).
    const place = sheetPlace ?? wheelPlace(box, DECK.rowPx, DECK.wheelRows, DECK.minFigurePx, DECK.sidePx, column, DECK.filtersPx);
    picker.style.left = `${place.left}px`;
    picker.style.top = `${place.top}px`;
    picker.style.width = `${place.width}px`;
    setRows(place.rows, DECK.rowPx);
    app.style.setProperty('--wheel-pad-bottom', `${place.padBottom}px`);
    app.style.setProperty('--wheel-pad-right', `${place.padRight}px`);
  }

  /** The wheel shows `shown` rows `px` tall. A change brings the band back to its row when the wheel next draws. */
  function setRows(shown: number, px: number) {
    if (shown !== shownRows || px !== rowPx) {
      shownRows = shown;
      rowPx = px;
      wheel.style.setProperty('--deck-rows', String(shown));
      wheel.style.setProperty('--deck-row', `${px}px`);
      scrollWanted = true;
    }
  }

  // On a phone, a drum with ends (v6.2 ruling 4): the list has `half` blank rows above the first
  // row and below the last (deck.css), so row r sits in the band at a scrollTop of r rows
  // (scrollForRow). Docked there are none: the rows are a menu, top aligned, row r r rows down.
  let shownRows: number = DECK.wheelRows;
  let rowPx: number = DECK.rowPx;
  /** Where the page last set the list's scrollTop itself; the scroll event it causes is not a turn. */
  let ownTop: number | null = null;
  /** The row in the phone's band at the list's scrollTop. */
  const rowAt = () => wheelRowAt(list.scrollTop, rowPx, rowCount);

  /** Renders the list: each row once. */
  function buildList() {
    const focusRow = rows.length > 0 && list.contains(document.activeElement) ? roving : null;
    list.innerHTML = Array.from({ length: rowCount }, (_, r) => rowHtml(r)).join('');
    rows = [...list.querySelectorAll<HTMLButtonElement>('.deck-row')];
    banded = -1;
    roving = 0;
    rove(current() ?? Math.max(0, bandRow));
    if (focusRow !== null) {
      rove(focusRow);
      rows[roving]?.focus({ preventScroll: true });
    }
    markRows();
    refitRows();
  }

  /**
   * Brings `row` to the band. Docked, the menu brings it into view the nearest way, at once (the
   * band is already on it: markRows). On a phone the drum turns to it; a smooth scroll issued
   * returns true, so the settle can ask for it again.
   */
  function scrollToRow(row: number, smooth: boolean): boolean {
    if (wheel.hidden) return false;
    if (docked()) {
      const top = nearestTop(scrollForRow(row, rowPx), rowPx, list.scrollTop, list.clientHeight);
      if (Math.abs(list.scrollTop - top) >= 1) list.scrollTop = top;
      return false;
    }
    const top = scrollForRow(row, rowPx);
    if (!smooth) {
      list.scrollTop = top;
      ownTop = list.scrollTop;
      return false;
    }
    // The band is already on the row: nothing to scroll, whatever a pixel or two of snap says.
    if (rowAt() === row || Math.abs(list.scrollTop - top) < 1) return false;
    list.scrollTo({ top, behavior: 'smooth' });
    return true;
  }

  /** Brings the wheel's band to the loaded preset; on a phone a hand-made pattern leaves it where it is. */
  let scrollWanted = true;
  function scrollToCurrent(smooth: boolean) {
    if (docked()) {
      const row = menuBand(current(), own, restOwn);
      band(row);
      scrollToRow(row, false);
      return;
    }
    const i = current();
    if (i === null) {
      seekRow = null;
      return;
    }
    // A browser may wait a while before it starts a smooth scroll: the goal is asked for again
    // until the band is there (settle). Only a scroll actually issued is a goal: a stale one at
    // rest would drag the band back.
    keyTries = 0;
    seekRow = scrollToRow(i, smooth) ? i : null;
    // A smooth scroll that moves nothing (the band a pixel or two off) fires no event to end it, so
    // the goal expires: a scroll from the page much later is never pulled back to it.
    clearTimeout(seekTimer);
    if (seekRow !== null) seekTimer = setTimeout(() => (seekRow = null), DECK.settleMs * DECK.keySettleTries);
  }

  function showWheel() {
    const shown = wheelShown();
    const was = !wheel.hidden;
    wheel.hidden = !shown;
    picker.hidden = !shown;
    app.classList.toggle('deck-docked', docked());
    app.classList.toggle('wheel-open', shown && !docked());
    app.classList.toggle('deck-editor-hidden', docked() && !editorShown);
    if (!shown || docked()) endPhase();
    // A docked wheel is always open: the pattern button then only takes focus to it.
    if (docked()) {
      patternButton.removeAttribute('aria-expanded');
      patternButton.removeAttribute('aria-controls');
    } else {
      patternButton.setAttribute('aria-controls', 'deck-picker');
      patternButton.setAttribute('aria-expanded', String(shown));
    }
    placeWheel();
    fitRows();
    if (shown && !was) scrollWanted = true;
  }

  const closeWheel = () => {
    if (!wheelOpen) return;
    wheelOpen = false;
    showWheel();
  };

  // The phone wheel's phase (nextPhase in deck-model.ts): spinning while the reader turns it,
  // settling after it stops, and 1.5 s later (DECK.returnMs) the wheel closes and the controls
  // return. The timer lives here; the rule is the model's.
  let phase: WheelPhase = 'rest';
  let returnTimer: ReturnType<typeof setTimeout> | undefined;
  const setPhase = (event: Parameters<typeof nextPhase>[1]) => {
    phase = nextPhase(phase, event);
    wheel.dataset.phase = phase;
  };
  wheel.dataset.phase = phase;
  const endPhase = () => {
    clearTimeout(returnTimer);
    setPhase('close');
  };

  patternButton.addEventListener('click', () => {
    if (docked()) {
      // In the top bar: shows the patterns, and takes focus to the wheel.
      store.set({ panel: 'patterns' });
      rows[roving]?.focus();
      return;
    }
    wheelOpen = !wheelOpen;
    showWheel();
  });

  /** One tab stop in the wheel (roving tabindex): the loaded row, else the row last in the band. */
  let roving = 0;
  const rove = (row: number) => {
    rows[roving]?.setAttribute('tabindex', '-1');
    roving = Math.min(rowCount - 1, Math.max(0, row));
    rows[roving]?.setAttribute('tabindex', '0');
  };
  // A row focused by a click or by script is the tab stop, so ↑ ↓ move on from the row with focus.
  list.addEventListener('focusin', (e) => {
    const row = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('.deck-row') : null;
    if (row) rove(Number(row.dataset.row));
  });

  /** The row in the band: on a phone the one the drum holds under it, docked the chosen one. */
  let banded = -1;
  let bandRow = -1;
  const band = (row: number) => {
    bandRow = row;
    if (row === banded) return;
    rows[banded]?.classList.remove('in-band');
    rows[row]?.classList.add('in-band');
    banded = row;
  };

  // Only a turn the reader makes picks, and only on a phone: a mouse wheel, a touch, or ↑ ↓ PageUp
  // PageDown Home End on a row. A scroll from the page (snapping after a layout change, the wheel
  // shown again, Tab bringing a row into view, the band following an arrow) never does. A turn
  // that does not scroll (at an end) lapses after two settles, so a later scroll from the page is
  // not taken for one. Docked the list is a menu, and its scroll only browses (v6.2 ruling 3).
  let turning = false;
  let turnTimer: ReturnType<typeof setTimeout> | undefined;
  const turn = () => {
    turning = true;
    seekRow = null;
    clearTimeout(returnTimer);
    clearTimeout(turnTimer);
    turnTimer = setTimeout(() => (turning = false), DECK.settleMs * 2);
  };
  // The wheel takes the sheet on the first real scroll of a turn, not on the touch or the wheel
  // event that precedes it: a tap on a row must find the row where the finger landed (ruling 9).
  // A touch that never scrolls is no turn at all.
  let scrolled = false;
  const sheetOn = () => {
    if (!upright()) return;
    const was = phase;
    setPhase('turn');
    if (was === 'rest') placeWheel();
  };
  const startTurn = () => {
    if (docked()) return;
    scrolled = false;
    turn();
  };
  for (const type of ['wheel', 'touchstart']) list.addEventListener(type, startTurn, { passive: true });
  for (const type of ['touchend', 'touchcancel']) list.addEventListener(type, armSettle, { passive: true });

  /** Turns the phone's wheel to `to` as the reader's turn: the band goes there, and the row loads when it settles. */
  function turnTo(to: number) {
    // A key at an end turns nothing: no turn, no sheet taken.
    if (rowAt() === to) return rove(to);
    scrolled = true;
    sheetOn();
    turn();
    keyRow = to;
    keyTries = 0;
    scrollToRow(to, true);
    rove(to);
    armSettle();
  }
  /**
   * Docked, a key on a row picks at once (v6.2 ruling 3): a card loads, without sound; Make your
   * own takes the band and opens nothing (only a click, Enter or Space opens it: v6.1 ruling 2).
   */
  function chooseRow(to: number) {
    // A key at an end (↑ on the first row, ↓ on Make your own) chooses what is chosen already: nothing.
    if (to === menuBand(current(), own, restOwn)) return;
    if (to === own) restOwn = true;
    else choose(to);
    // The card may be on stage already (a key from Make your own): the band still goes to it.
    markRows();
    scrollToCurrent(false);
  }
  list.addEventListener('keydown', (e) => {
    if (!turnsWheel(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const to = rowAfterKey(e.key, roving, rowCount, shownRows);
    if (docked()) {
      // Focus first: the tab stop stays on a focused row (markRows), Make your own included.
      rove(to);
      rows[roving]?.focus({ preventScroll: true });
      chooseRow(to);
      return;
    }
    turnTo(to);
    rows[roving]?.focus({ preventScroll: true });
  });

  // A key's target row, until the band reaches it. A browser may wait a few hundred ms before it
  // starts a smooth scroll; a settle in that gap must not end the turn, or the band lands on a
  // row that is never loaded. So while a key's row is outstanding the settle re-arms (and asks
  // for the scroll again), a bounded number of times.
  let keyRow: number | null = null;
  let seekRow: number | null = null;
  let seekTimer: ReturnType<typeof setTimeout> | undefined;
  let keyTries = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  function settle() {
    if (wheel.hidden || docked()) {
      keyRow = null;
      seekRow = null;
      turning = false;
      return;
    }
    const at = rowAt();
    const goal = keyRow ?? seekRow;
    if (goal !== null && at !== goal && keyTries < DECK.keySettleTries) {
      keyTries += 1;
      if (keyRow !== null) turn();
      scrollToRow(goal, true);
      armSettle();
      return;
    }
    const user = turning || keyRow !== null;
    keyRow = null;
    seekRow = null;
    turning = false;
    clearTimeout(turnTimer);
    if (!user || !scrolled) return;
    if (upright()) {
      setPhase('stop');
      clearTimeout(returnTimer);
      returnTimer = setTimeout(() => {
        setPhase('return');
        if (phase !== 'rest') return;
        const had = picker.contains(document.activeElement);
        closeWheel();
        if (had) patternButton.focus();
      }, DECK.returnMs);
    }
    // The band resting on Make your own opens nothing and loads nothing: only a tap on it does
    // (v6.1 ruling 2).
    const chosen = settledPick(at, current(), order.length);
    if (chosen !== null) pick(chosen);
  }
  function armSettle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, DECK.settleMs);
  }
  list.addEventListener('scroll', () => {
    // Docked, a scroll browses the menu: it never picks and never moves the band (v6.2 ruling 3).
    if (docked()) return;
    const mine = ownTop !== null && Math.abs(list.scrollTop - ownTop) < 1;
    ownTop = null;
    band(rowAt());
    // A scroll the page made itself (re-placing the wheel, a snap) is no turn and takes no sheet.
    if (turning && !mine) {
      sheetOn();
      turn();
      scrolled = true;
    }
    armSettle();
  });

  // One listener for every row, so a rebuilt list (buildList) needs none of its own.
  list.addEventListener('click', (e) => {
    const button = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('.deck-row') : null;
    if (!button) return;
    const i = Number(button.dataset.row);
    clearTimeout(settleTimer);
    turning = false;
    keyRow = null;
    seekRow = null;
    if (i === own) {
      // Docked, the band goes to Make your own and the editor shows under it (v6 ruling 2): a
      // click, Enter or Space on it, never the band passing (v6.1 ruling 2).
      restOwn = true;
      setEditor({ kind: 'makeOwn' });
      markRows();
      // The next draw brings it into view, once the wheel has its new height.
      if (docked()) scrollWanted = true;
      closeWheel();
      store.set({ sheetTab: 'pattern' });
      return;
    }
    // A tap on a row is a gesture: it plays the row (ruling A), unlike a step or a settle.
    pick(i);
    start(player, store.get());
    rove(i);
    markRows();
    scrollToCurrent(true);
    closeWheel();
  });

  // The filter chips (v6.1 ruling 4, chooseFilter in deck-model.ts): one lit at a time across both
  // groups, the lit one tapped again clears. A chip that does not hold the card on stage loads its first card,
  // as a step does (no sound starts; the web editor hides). The phone wheel stays open.
  /** The filter a chip stands for, from its data attributes. */
  const chipOf = (b: HTMLButtonElement) => ({ by: b.dataset.by as 'balls' | 'jugglers', n: Number(b.dataset.n) });
  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      // On a phone a chip tapped while the wheel settles ends the turn: the wheel goes back to its
      // place at rest and stays open while the reader filters (no return timer closes it).
      if (phase !== 'rest') {
        endPhase();
        placeWheel();
      }
      const choice = chooseFilter(store.get(), chipOf(button));
      store.set({ deckFilter: choice.deckFilter });
      if (choice.load) pick(order.indexOf(choice.load));
    });
  }
  /** The wheel, ‹ › and ↑ ↓ take the filter's cards; the list is rebuilt and the band brought back. */
  function applyFilter() {
    const filter = store.get().deckFilter;
    for (const b of filterButtons) b.setAttribute('aria-pressed', String(sameFilter(chipOf(b), filter)));
    const next = filteredPresets(deckPresets(), filter);
    if (next.length === order.length && next.every((p, i) => p === order[i])) return;
    order = next;
    rowCount = order.length + 1;
    own = order.length;
    // A hand-made pattern's band goes to the first card, or stays on Make your own.
    bandRow = restOwn ? own : -1;
    buildList();
    fittedWidth = -1;
    fitRows();
    // Docked, the menu is as tall as its rows where they are fewer than the column holds.
    if (docked() && !wheel.hidden) placeWheel();
    scrollWanted = true;
  }
  // A card outside the lit filter, typed or from a link, clears it (filterKeeper).
  store.derive(filterKeeper());

  // Tapping outside closes the phone wheel; the tap still does what it does.
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Node;
    if (wheelOpen && !docked() && !picker.contains(target) && !patternButton.contains(target)) closeWheel();
  });
  // Escape closes the wheel first, and only the wheel.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !wheelOpen || docked()) return;
      e.stopPropagation();
      closeWheel();
      patternButton.focus();
    },
    { capture: true },
  );

  dockedQuery.addEventListener('change', () => {
    placePattern();
    showWheel();
  });
  // The stage moves as the sheet opens and closes and the window turns: the wheel follows it.
  const follow = () => {
    if (!wheel.hidden) placeWheel();
  };
  const stageEl = document.querySelector('.stage');
  if (stageEl && typeof ResizeObserver === 'function') new ResizeObserver(follow).observe(stageEl);
  // Docked with the editor hidden, the sheet's head under the wheel grows and shrinks (paused,
  // a sound status): the wheel follows it.
  if (sheet && typeof ResizeObserver === 'function') new ResizeObserver(() => docked() && !editorShown && follow()).observe(sheet);
  window.addEventListener('resize', follow);

  // -------------------------------------------------------------------------------------------
  // Volume, mute, Listen for, Details
  // -------------------------------------------------------------------------------------------

  volume.addEventListener('input', () => store.set(volumePatch(Number(volume.value))));
  mute.addEventListener('click', () => store.set({ muted: !store.get().muted }));

  listenSelect.addEventListener('change', () => {
    store.dispatch({ type: 'setListen', listen: listenSelect.value as Listen });
    playButton.focus();
  });
  details.addEventListener('click', () => {
    closeWheel();
    store.set({ sheetTab: 'sound' });
    const panels = document.querySelector('.sheet-panels');
    if (panels) panels.scrollTop = 0;
  });

  // -------------------------------------------------------------------------------------------
  // Keys: Space plays and pauses, the arrows step the pattern and Listen for
  // -------------------------------------------------------------------------------------------

  // Captured before a focused control sees it, so a button does not activate; buttons activate on
  // keyup in some browsers, so that is suppressed too. Exempt: a pattern text input, where Space
  // types a space (the separator at other ratios than 1:1), any control inside keepsSpace, and Make
  // your own in the wheel, where Space opens the editor as a click does (v6.1 ruling 2).
  const isSpace = (e: KeyboardEvent) =>
    e.code === 'Space' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.isComposing &&
    !(
      e.target instanceof Element &&
      (e.target.closest('.pattern-field, .deck-own') !== null ||
        keepsSpace(e.target.tagName, e.target instanceof HTMLInputElement ? e.target.type : null))
    );
  document.addEventListener(
    'keydown',
    (e) => {
      if (!isSpace(e)) return;
      e.preventDefault();
      if (!e.repeat) togglePlay();
    },
    { capture: true },
  );
  document.addEventListener('keyup', (e) => isSpace(e) && e.preventDefault(), { capture: true });

  // Bubbling, so a control that walks its own arrows (the ratio chips, the wheel) has had them
  // first. Only on the play view: under About the arrows scroll the page.
  const playView = root.closest('.play-view') as HTMLElement | null;
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing || playView?.hidden || route(location.hash).view === 'about') return;
    const el = e.target instanceof Element ? e.target : null;
    const kind = el ? keyTarget(el.tagName, el instanceof HTMLInputElement ? el.type : null, el.getAttribute('role')) : 'other';
    const key = deckKey(e.key, kind, { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey }, docked());
    if (key === null) return;
    e.preventDefault();
    if (key.kind === 'step') step(key.delta);
    else store.dispatch({ type: 'setListen', listen: nextListen(store.get().listen, key.delta) });
  });

  // -------------------------------------------------------------------------------------------
  // Rendering the store
  // -------------------------------------------------------------------------------------------

  /**
   * The notation shrinks to fit its space, down to DECK.notationMinPx, before it ellipsizes
   * (fitFontPx in deck-model.ts). Measured at full size: the pattern button shrinks to the bar's
   * free width, so the notation's box is the space and its scrollWidth the text.
   */
  let fittedText = '';
  /** The text's own width, to a fraction of a pixel (scrollWidth is rounded and never less than the box). */
  const textWidth = () => {
    const range = document.createRange();
    range.selectNodeContents(notation);
    return range.getBoundingClientRect().width;
  };
  function fitNotation() {
    notation.style.fontSize = `${DECK.notationPx}px`;
    const room = notation.clientWidth;
    if (room === 0) return; // hidden (About shows): fitted when it shows again
    let size = fitFontPx(textWidth(), room, DECK.notationPx, DECK.notationMinPx);
    // Then measured again at that size, since glyphs may not scale in proportion (nextFit).
    for (let i = 0; i < DECK.notationFitTries && size !== DECK.notationPx; i++) {
      notation.style.fontSize = `${size}px`;
      const next = nextFit(size, textWidth(), room, DECK.notationMinPx);
      if (next === null) break;
      size = next;
    }
    notation.style.fontSize = `${size}px`;
  }
  // The bar's width changes as the window turns and as the play view shows again after About.
  const bar = $<HTMLDivElement>('.deck-bar');
  if (typeof ResizeObserver === 'function') {
    const fits = new ResizeObserver(fitNotation);
    fits.observe(bar);
    // The top bar, not its pattern slot: the slot is as wide as the notation, so watching it
    // would refit on every fit.
    const topMain = topSlot?.closest('.topbar-main');
    if (topMain) fits.observe(topMain);
  } else window.addEventListener('resize', fitNotation);
  // The web fonts arrive after the first fit (fonts.ready can resolve before Plex Mono is even
  // asked for): each finished load fits again, with the real glyphs.
  void document.fonts?.ready.then(fitNotation);
  document.fonts?.addEventListener('loadingdone', fitNotation);

  /**
   * Docked, each wheel row's notation is drawn smaller to fit what its name leaves it (deck.css),
   * from DECK.dockedNotationPx down to dockedNotationMinPx, measured as the bar's notation is
   * (fitFontPx, nextFit); past the floor it ellipsizes. Elsewhere the rows keep their CSS size.
   */
  let fittedWidth = -1;
  function fitRows() {
    const on = docked() && !wheel.hidden;
    const width = on ? wheel.clientWidth : 0;
    if (width === fittedWidth) return;
    fittedWidth = width;
    for (const row of rows) {
      const code = row.querySelector('code');
      if (!code) continue;
      if (!on) {
        code.style.removeProperty('font-size');
        continue;
      }
      code.style.fontSize = `${DECK.dockedNotationPx}px`;
      const room = code.clientWidth;
      let size = fitFontPx(code.scrollWidth, room, DECK.dockedNotationPx, DECK.dockedNotationMinPx);
      for (let i = 0; i < DECK.notationFitTries && size !== DECK.dockedNotationPx; i++) {
        code.style.fontSize = `${size}px`;
        const next = nextFit(size, code.scrollWidth, room, DECK.dockedNotationMinPx);
        if (next === null) break;
        size = next;
      }
      code.style.fontSize = `${size}px`;
    }
  }
  const refitRows = () => {
    fittedWidth = -1;
    fitRows();
  };
  document.fonts?.addEventListener('loadingdone', refitRows);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitRows()).observe(wheel);

  /**
   * The loaded card's row is on; the tab stop follows it unless a row has focus. Docked, the band is
   * the chosen row's own highlight (v6.2 ruling 3). ‹ and › are disabled at the ends (ruling 2),
   * by aria-disabled, so a focused one keeps its focus.
   */
  function markRows() {
    const i = current();
    rows.forEach((row, r) => {
      const on = r === i;
      row.classList.toggle('on', on);
      if (on) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
    if (i !== null && !rows[roving]?.matches(':focus')) rove(i);
    if (docked()) band(menuBand(i, own, restOwn));
    prevButton.setAttribute('aria-disabled', String(stepIndex(i, -1, order.length) === null));
    nextButton.setAttribute('aria-disabled', String(stepIndex(i, 1, order.length) === null));
  }

  function render() {
    const state = store.get();
    const label = deckLabel(state);
    notation.textContent = label.pattern;
    nameEl.textContent = label.name;
    dot.hidden = label.name === '';
    metaEl.textContent = label.meta;
    patternButton.classList.toggle('invalid', !label.valid);
    // Only a new text needs a new fit; a new width comes through the ResizeObserver.
    if (label.pattern !== fittedText) {
      fittedText = label.pattern;
      fitNotation();
    }
    patternButton.setAttribute('aria-label', t.choose(label.pattern, label.name));
    markRows();
    listenSelect.value = state.listen;
    volume.value = String(state.volume);
    volume.style.setProperty('--fill', `${fillPercent(state.volume, 0, 1)}%`);
    mute.setAttribute('aria-pressed', String(state.muted));
    mute.setAttribute('aria-label', state.muted ? t.unmute : t.mute);
    mute.classList.toggle('muted', state.muted);
    const gain = masterGain(state.volume, state.muted);
    root.dataset.master = String(gain);
    sound.setMaster(gain);
  }

  store.subscribe((state, previous) => {
    // First: a pattern that cleared the filter (filterKeeper) is found in the whole deck below.
    if (state.deckFilter !== previous.deckFilter) applyFilter();
    const keys = ['parts', 'ratio', 'drafts', 'listen', 'volume', 'muted'] as const;
    if (keys.some((k) => state[k] !== previous[k])) render();
    // Only a new pattern moves the band: a volume or sound change mid-turn leaves the wheel be.
    // A new pattern that is no card shows the web editor; one that is a card leaves it be.
    if (state.parts !== previous.parts || state.ratio !== previous.ratio) {
      const card = current() !== null;
      if (card) restOwn = false;
      setEditor({ kind: 'pattern', card });
      scrollToCurrent(true);
    }
    if (state.panel !== previous.panel) showWheel();
  });
  buildList();
  applyFilter();
  placePattern();
  showWheel();
  render();

  let shownState = '';
  return {
    draw(view) {
      if (scrollWanted && !wheel.hidden) {
        scrollWanted = false;
        placeWheel();
        // Docked, the chosen row (menuBand). On a phone a hand-made pattern keeps the row last in
        // the band, or Cascade the first time.
        const row = docked() ? menuBand(current(), own, restOwn) : (current() ?? Math.max(0, bandRow));
        band(row);
        scrollToRow(row, false);
      }
      if (view.state !== shownState) {
        shownState = view.state;
        const playing = view.state === 'playing';
        playButton.dataset.state = view.state;
        playLabel.textContent = playing ? copy.pause : copy.play;
      }
      pending.hidden = !view.pending;
    },
  };
};
