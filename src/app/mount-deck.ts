// The deck (docs/plans/v4-deck.md, rulings 1 to 4): the transport bar (Play/Pause, ‹, the pattern,
// ›, mute and volume), the sound row (Listen for, Details) and the pattern wheel. On a phone the
// wheel opens over the stage from the pattern name.
//
// The wide layout (docs/plans/v5-sound-model.md, ruling 8; `.is-web`, wide and tall enough) is
// different: the pattern name moves to the top bar beside the mark, the bar under the stage is
// Play alone with key caps (no ‹ ›, no volume: Volume is the Sound panel's), the sound row goes,
// and the wheel stays open at the top of the right-hand column while the Patterns panel shows.
// There (docs/plans/v6-wheel-filters-three.md, rulings 1 to 3) its rows are taller, it fills the
// column while the editor (Pattern and Rhythm) is hidden, which it is until Make your own or a
// pattern that is no card, and a mouse wheel turns it a row a notch.
// The logic is in deck-model.ts and layout-model.ts; this file is elements and events.
//
// This mount owns Play and the keys that drive it: Space plays and pauses from anywhere (one
// capturing handler), except in a pattern text input and in a control that uses Space itself
// (keepsSpace in sheet-model.ts); ← and → step the pattern, and on the wide layout ↑ and ↓ step
// Listen for, except in a field, a select, a slider or a tab (deckKey in layout-model.ts). A
// select hands focus to Play after a choice, so the keys work again at once.
import { LISTENS, type Listen } from '../sound/drummers';
import { DECK, KNOBS, SHEET } from '../tunables';
import { copy } from '../ui/copy';
import {
  centrePlace,
  deckLabel,
  deckPresets,
  chooseFilter,
  filteredPresets,
  filterKeeper,
  dockedRows,
  editorShows,
  type EditorEvent,
  rowOfSlot,
  slotNear,
  wheelCopies,
  wheelDeltaPx,
  wheelTurn,
  type WheelTurn,
  WHEEL_AT_REST,
  fitFontPx,
  nextFit,
  groupTag,
  keyTarget,
  loopDelta,
  masterGain,
  nearEnd,
  nextPhase,
  type WheelPhase,
  offsetFor,
  placeOf,
  presetIndex,
  rowAfterKey,
  scrollForPlace,
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
import type { CardGroup, Preset } from './presets';
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
  // The cards the wheel holds, in order, then Make your own: `rowCount` rows. The list holds
  // `copies` of them (wheelCopies in deck-model.ts) where it shows more rows than that.
  // ‹ › and ← → walk the same order. buildList() renders it. Under a filter chip (v6 ruling 4)
  // the order is that group's cards alone (applyFilter).
  let order: readonly Preset[] = filteredPresets(deckPresets(), store.get().deckFilter);
  let rowCount = order.length + 1;
  let own = order.length;
  let copies = 1;
  /** The most rows the wheel was last asked to show: what copies are counted for. */
  let mostRows: number = DECK.wheelRows;
  let slotCount = rowCount;

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
    <div class="deck-picker" hidden>
      <div class="deck-filters" role="group" aria-label="${t.filtersLabel}">${t.filters
        .map((f) => `<button type="button" class="deck-filter" data-group="${f.group}" aria-pressed="false">${f.name}</button>`)
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

  /**
   * One list item a slot: the row it holds is `rowOfSlot(slot, rowCount)`. The first copy of a row
   * is the row itself (data-row, data-id, .deck-own, .on and aria-current mark it alone); a further
   * copy (.deck-copy, data-echo) looks the same and does the same, so each row keeps one name in
   * the page. At rest the band is always on a first copy (settle).
   */
  const rowHtml = (slot: number) => {
    const row = rowOfSlot(slot, rowCount);
    const echo = slot >= rowCount;
    const pos = copies > 1 ? ` aria-posinset="${row + 1}" aria-setsize="${rowCount}"` : '';
    const p = order[row];
    const cls = echo ? `deck-row deck-copy${p ? '' : ' deck-own-copy'}` : `deck-row${p ? '' : ' deck-own'}`;
    const attrs = `class="${cls}" tabindex="-1" ${echo ? 'data-echo' : 'data-row'}="${row}"${p && !echo ? ` data-id="${p.id}"` : ''}`;
    return p
      ? `<li${pos}><button type="button" ${attrs}><code>${cardPattern(p)}</code><span class="deck-row-name">${copy.presets[p.id]?.name ?? ''}</span><em>${groupTag(p.group)}</em></button></li>`
      : `<li${pos}><button type="button" ${attrs}><span class="deck-row-name">${t.makeYourOwn}</span></button></li>`;
  };
  /** The wheel's buttons and their list items, one a slot. */
  let rows: HTMLButtonElement[] = [];
  let rowItems: HTMLLIElement[] = [];
  const slotOf = (row: number) => slotNear(row, offset, rowCount, copies);

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
  const step = (delta: -1 | 1) => pick(stepIndex(current(), delta, order.length));
  $<HTMLButtonElement>('.deck-prev').addEventListener('click', () => step(-1));
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
      if (wheel.hidden) return setRows(DECK.wheelRows, DECK.rowPx, DECK.wheelRows);
      // Docked (v6 ruling 1): taller rows; while the editor is hidden, as many as the column holds
      // between the wheel's top and the sheet's head at its foot (Stop, the time slider, the
      // sound's status: as tall as they need), DECK.dockedEditRows above the editor when it shows.
      // The list holds copies enough for the whole column, so showing the editor and hiding it,
      // or the head growing, never rebuilds it.
      const room = document.documentElement.clientHeight - wheel.getBoundingClientRect().top;
      const most = dockedRows(room, DECK.dockedRowPx, DECK.wheelRows);
      if (editorShown) return setRows(DECK.dockedEditRows, DECK.dockedRowPx, most);
      const head = sheet?.offsetHeight ?? 0;
      return setRows(dockedRows(room - head, DECK.dockedRowPx, DECK.wheelRows), DECK.dockedRowPx, most);
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
    setRows(place.rows, DECK.rowPx, place.rows);
    app.style.setProperty('--wheel-pad-bottom', `${place.padBottom}px`);
    app.style.setProperty('--wheel-pad-right', `${place.padRight}px`);
  }

  /**
   * The wheel shows `shown` rows `px` tall; its list holds copies enough to show `most` and turn.
   * A change brings the band back to its row when the wheel next draws.
   */
  function setRows(shown: number, px: number, most: number) {
    mostRows = most;
    const k = wheelCopies(rowCount, most, DECK.loopMarginRows);
    if (k !== copies) {
      copies = k;
      buildList();
      scrollWanted = true;
    }
    if (shown !== shownRows || px !== rowPx) {
      shownRows = shown;
      rowPx = px;
      wheel.style.setProperty('--deck-rows', String(shown));
      wheel.style.setProperty('--deck-row', `${px}px`);
      scrollWanted = true;
    }
  }

  // The loop (deck-model.ts): each list item's place is its CSS order; `offset` is the slot at
  // place 0. While the wheel rests, the band's slot sits at the middle place. With one copy (a
  // phone) a slot is its row.
  let shownRows: number = DECK.wheelRows;
  let rowPx: number = DECK.rowPx;
  const half = () => (shownRows - 1) / 2;
  let offset = 0;
  /** Where the page last set the list's scrollTop itself; the scroll event it causes is not a turn. */
  let ownTop: number | null = null;
  /** The slot in the band at the list's scrollTop, and the row it holds. */
  const slotAt = () => wheelRowAt(list.scrollTop, rowPx, half(), offset, slotCount);
  const rowAt = () => rowOfSlot(slotAt(), rowCount);

  /** Renders the list: `copies` of the rows, each a slot, at their places from offset 0. */
  function buildList() {
    const focusRow = rows.length > 0 && list.contains(document.activeElement) ? rowOfSlot(roving, rowCount) : null;
    slotCount = rowCount * copies;
    list.innerHTML = Array.from({ length: slotCount }, (_, s) => rowHtml(s)).join('');
    rows = [...list.querySelectorAll<HTMLButtonElement>('.deck-row')];
    rowItems = rows.map((r) => r.parentElement as HTMLLIElement);
    offset = 0;
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
   * Turns the list so `slot` sits at the middle place, moving scrollTop by as many rows as `slot`
   * moved, so nothing on screen shifts. Programmatic: never a turn by the reader.
   */
  function recentre(slot: number) {
    const next = offsetFor(slot, slotCount);
    if (next === offset) return;
    // Read before the order changes: a browser may re-snap to the moved row on the next layout
    // (WebKit does), so the new scrollTop is set outright, never added to the live one.
    const top = list.scrollTop + (centrePlace(slotCount) - placeOf(slot, offset, slotCount)) * rowPx;
    offset = next;
    rowItems.forEach((li, s) => (li.style.order = String(placeOf(s, offset, slotCount))));
    list.scrollTop = top;
    ownTop = list.scrollTop;
  }

  /** Brings `row` into the band, the shortest way round the loop. */
  function scrollToRow(row: number, smooth: boolean): boolean {
    if (wheel.hidden) return false;
    if (!smooth) {
      // A jump brings the row's first copy (the row itself) to the band.
      recentre(row);
      list.scrollTop = scrollForPlace(centrePlace(slotCount), rowPx, half());
      ownTop = list.scrollTop;
      return false;
    }
    const fromSlot = slotAt();
    recentre(fromSlot);
    const from = rowOfSlot(fromSlot, rowCount);
    // The band is already on the row: nothing to scroll, whatever a pixel or two of snap says.
    if (from === row) return false;
    const top = scrollForPlace(centrePlace(slotCount) + loopDelta(from, row, rowCount), rowPx, half());
    if (Math.abs(list.scrollTop - top) < 1) return false;
    list.scrollTo({ top, behavior: 'smooth' });
    return true;
  }

  /** Brings the wheel's band to the loaded preset; a hand-made pattern leaves it where it is. */
  let scrollWanted = true;
  function scrollToCurrent(smooth: boolean) {
    const i = current();
    if (i === null) {
      seekRow = null;
      return;
    }
    // A smooth scroll to a row far round the loop crosses the margin where the list turns itself
    // (nearEnd), which cuts the scroll short; the goal is asked for again until the band is there
    // (issue 79: the band stopped rows short of a typed 97531).
    // Only a scroll actually issued is a goal: a stale one at rest would drag the band back.
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
      patternButton.setAttribute('aria-controls', 'deck-wheel');
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

  /** One tab stop in the wheel (roving tabindex): the loaded row, else the row last in the band. A slot. */
  let roving = 0;
  const rove = (row: number) => {
    rows[roving]?.setAttribute('tabindex', '-1');
    roving = slotOf(Math.min(rowCount - 1, Math.max(0, row)));
    rows[roving]?.setAttribute('tabindex', '0');
  };

  /** The slot in the band, marked while the wheel turns, and the row it holds. */
  let banded = -1;
  let bandRow = -1;
  const band = (slot: number) => {
    bandRow = rowOfSlot(slot, rowCount);
    if (slot === banded) return;
    rows[banded]?.classList.remove('in-band');
    rows[slot]?.classList.add('in-band');
    banded = slot;
  };

  // Only a turn the reader makes picks: a mouse wheel, a touch, or ↑ ↓ PageUp PageDown Home End
  // on a row. A scroll from the page (snapping after a layout change, the wheel shown again, Tab
  // bringing a row into view, the band following an arrow) never does. A turn that does not scroll
  // (at an end) lapses after two settles, so a later scroll from the page is not taken for one.
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
  const startTurn = (e: Event) => {
    // Docked, a mouse wheel turns the wheel row by row instead (below).
    if (e.type === 'wheel' && docked()) return;
    scrolled = false;
    turn();
  };
  for (const type of ['wheel', 'touchstart']) list.addEventListener(type, startTurn, { passive: true });
  for (const type of ['touchend', 'touchcancel']) list.addEventListener(type, armSettle, { passive: true });

  /** Turns the wheel to `to` as the reader's turn: the band goes there, and the row loads when it settles. */
  function turnTo(to: number) {
    scrolled = true;
    sheetOn();
    turn();
    keyRow = to;
    keyTries = 0;
    scrollToRow(to, true);
    rove(to);
    armSettle();
  }
  list.addEventListener('keydown', (e) => {
    if (!turnsWheel(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    turnTo(rowAfterKey(e.key, rowOfSlot(roving, rowCount), rowCount, shownRows));
    rows[roving]?.focus({ preventScroll: true });
  });

  // Docked, the mouse wheel and the trackpad turn the wheel one row per DECK.wheelStepPx, at most
  // one row per DECK.wheelStepMs (v6 ruling 3, wheelTurn in deck-model.ts), not a native scroll:
  // a notch is one row and a swipe a few. Each row turns from the row the last one aimed at.
  let wheelAcc: WheelTurn = WHEEL_AT_REST;
  list.addEventListener(
    'wheel',
    (e) => {
      if (!docked()) return;
      e.preventDefault();
      const r = wheelTurn(wheelAcc, wheelDeltaPx(e.deltaY, e.deltaMode, DECK.wheelLinePx, list.clientHeight), e.timeStamp, DECK.wheelStepPx, DECK.wheelStepMs, DECK.wheelIdleMs);
      wheelAcc = r.state;
      if (r.step) turnTo(rowAfterKey(r.step > 0 ? 'ArrowDown' : 'ArrowUp', keyRow ?? rowAt(), rowCount, shownRows));
    },
    { passive: false },
  );

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
    if (wheel.hidden) {
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
    // At rest, the band's row goes back to the middle place, so the wheel can turn on either way.
    // With copies, its first copy takes the band: the copies repeat the rows in order, so the
    // picture does not change, and the row's hooks (data-row, .on) are the band's.
    // A slot against a row: equal exactly when the band is on the row's first copy, since first
    // copies hold slots 0 to rowCount - 1, each its own row.
    if (copies > 1 && slotAt() !== at) {
      const focused = rows[roving] === document.activeElement;
      scrollToRow(at, false);
      band(slotAt());
      rove(at);
      if (focused) rows[roving]?.focus({ preventScroll: true });
    } else recentre(slotAt());
    if (!user || !scrolled) return;
    if (upright()) {
      setPhase('stop');
      clearTimeout(returnTimer);
      returnTimer = setTimeout(() => {
        setPhase('return');
        if (phase !== 'rest') return;
        const had = wheel.contains(document.activeElement);
        closeWheel();
        if (had) patternButton.focus();
      }, DECK.returnMs);
    }
    // The band on Make your own shows the web editor (v6 ruling 2).
    if (at === own) {
      restOwn = true;
      setEditor({ kind: 'makeOwn' });
    }
    const chosen = settledPick(at, current(), order.length);
    if (chosen !== null) pick(chosen);
  }
  function armSettle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, DECK.settleMs);
  }
  list.addEventListener('scroll', () => {
    const mine = ownTop !== null && Math.abs(list.scrollTop - ownTop) < 1;
    ownTop = null;
    // Near an end mid-spin, the list turns at once (the turn goes on), so a long spin loops
    // forever and picks once, when it settles. A key's smooth scroll, cut short by the turn, is
    // asked for again.
    if (nearEnd(list.scrollTop, rowPx, half(), slotCount, DECK.loopMarginRows)) {
      recentre(slotAt());
      const goal = keyRow ?? seekRow;
      if (goal !== null) scrollToRow(goal, true);
    }
    band(slotAt());
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
    const i = Number(button.dataset.row ?? button.dataset.echo);
    clearTimeout(settleTimer);
    turning = false;
    keyRow = null;
    seekRow = null;
    if (i === own) {
      // Docked, the band goes to Make your own and the editor shows under it (v6 ruling 2).
      restOwn = true;
      setEditor({ kind: 'makeOwn' });
      // The next draw brings it there, once the wheel has its new height.
      if (docked()) scrollWanted = true;
      closeWheel();
      store.set({ sheetTab: 'pattern' });
      return;
    }
    // A tap on a row is a gesture: it plays the row (ruling A), unlike a step or a settle.
    pick(i);
    start(player, store.get());
    rove(i);
    scrollToCurrent(true);
    closeWheel();
  });

  // The filter chips (v6 ruling 4, chooseFilter in deck-model.ts): one lit at a time, the lit one
  // tapped again clears. A chip whose group does not hold the card on stage loads its first card,
  // as a step does (no sound starts; the web editor hides). The phone wheel stays open.
  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      const choice = chooseFilter(store.get(), button.dataset.group as CardGroup);
      store.set({ deckFilter: choice.deckFilter });
      if (choice.load) pick(order.indexOf(choice.load));
    });
  }
  /** The wheel, ‹ › and ← → take the filter's cards; the list is rebuilt and the band brought back. */
  function applyFilter() {
    const filter = store.get().deckFilter;
    for (const b of filterButtons) b.setAttribute('aria-pressed', String(b.dataset.group === filter));
    const next = filteredPresets(deckPresets(), filter);
    if (next.length === order.length && next.every((p, i) => p === order[i])) return;
    order = next;
    rowCount = order.length + 1;
    own = order.length;
    copies = wheelCopies(rowCount, mostRows, DECK.loopMarginRows);
    // A hand-made pattern's band goes to the first card, or stays on Make your own.
    bandRow = restOwn ? own : -1;
    buildList();
    fittedWidth = -1;
    fitRows();
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
  // Keys: Space plays and pauses, ← → step
  // -------------------------------------------------------------------------------------------

  // Captured before a focused control sees it, so a button does not activate; buttons activate on
  // keyup in some browsers, so that is suppressed too. Exempt: a pattern text input, where Space
  // types a space (the separator at other ratios than 1:1), and any control inside keepsSpace.
  const isSpace = (e: KeyboardEvent) =>
    e.code === 'Space' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.isComposing &&
    !(
      e.target instanceof Element &&
      (e.target.closest('.pattern-field') !== null ||
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

  /** The loaded card's rows (each copy of it) are on; the tab stop follows it unless a row has focus. */
  function markRows() {
    const i = current();
    rows.forEach((row, s) => {
      const on = rowOfSlot(s, rowCount) === i;
      if (s >= rowCount) {
        row.classList.toggle('on-copy', on);
        return;
      }
      row.classList.toggle('on', on);
      if (on) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
    if (i !== null && !rows[roving]?.matches(':focus')) rove(i);
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
        // A hand-made pattern keeps the row last in the band, or Cascade the first time; docked,
        // a band resting on Make your own stays there.
        const row = restOwn && docked() ? own : (current() ?? Math.max(0, bandRow));
        scrollToRow(row, false);
        band(slotOf(row));
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
