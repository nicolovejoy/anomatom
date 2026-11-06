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
// scroll that only browses. On a phone it is a drum with ends (ruling 4). On a phone held upright
// (docs/plans/v6-6-deck-on-top-four-jugglers.md) the deck is on top: under the top bar the wheel
// is a card with the filter chips, always shown, three rows at rest (compact, v6.4) and grown in
// place while it is turned, with Play, mute and the volume in a column beside it; ‹ › and the
// pattern button do not show there, and the band row is the pattern's name (ruling 9).
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
  grownRows,
  heldTouches,
  keyPage,
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
  presetMeta,
  rowAfterKey,
  scrollForRow,
  settledPick,
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
            `<div class="deck-filter-group" role="group" aria-labelledby="deck-filters-${by}"><span class="deck-filter-label" id="deck-filters-${by}">${t.filterGroups[by]}</span><span class="deck-filter-chips">${chips[by]
              .map((n) => `<button type="button" class="deck-filter" data-by="${by}" data-n="${n}" aria-label="${t.filterName(by, n)}" aria-pressed="false">${n}</button>`)
              .join('')}</span></div>`,
        )
        .join('')}</div>
      <div class="deck-wheel" id="deck-wheel" hidden>
        <ol class="deck-wheel-list" aria-label="${t.wheelLabel}" tabindex="-1"></ol>
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
      : `<li><button type="button" ${attrs}><code class="deck-own-code"></code><span class="deck-row-name deck-own-make">${t.makeYourOwn}</span><span class="deck-own-yours"></span></button></li>`;
  };
  /** The wheel's buttons, one a row. */
  let rows: HTMLButtonElement[] = [];

  root.style.setProperty('--deck-row', `${DECK.rowPx}px`);
  root.style.setProperty('--deck-rows', String(DECK.wheelRows));
  root.style.setProperty('--deck-slider', `${DECK.sliderPx}px`);
  root.style.setProperty('--deck-slider-phone', `${DECK.phoneSliderPx}px`);
  root.style.setProperty('--deck-filters', `${DECK.filtersPx}px`);
  // The upright phone's band (v6.6 ruling 2): read by the play view's grid as well as the deck.
  app.style.setProperty('--deck-card-margin', `${DECK.cardMarginPx}px`);
  app.style.setProperty('--deck-card-radius', `${DECK.cardRadiusPx}px`);
  app.style.setProperty('--deck-side', `${DECK.sideColumnPx}px`);
  app.style.setProperty('--deck-side-play', `${DECK.sidePlayPx}px`);
  app.style.setProperty('--deck-chip', `${DECK.cardChipPx}px`);
  app.style.setProperty('--deck-sheet-figure', `${DECK.sheetFigurePx}px`);

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
  /** Docked, the wheel shows with the Patterns panel; on a phone upright always (v6.6), else while opened. */
  const wheelShown = () => (docked() ? store.get().panel === 'patterns' : upright() || wheelOpen);

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

  /** A phone held upright: the deck on top, the wheel a card that never closes (v6.6). */
  const sheet = document.querySelector<HTMLElement>('.region-sheet');
  const upright = () =>
    !docked() && !app.classList.contains('is-web') && !app.classList.contains('is-wide') && !app.classList.contains('is-landscape');

  /**
   * Upright (v6.6 ruling 2) the card is in the page's flow, in the play view's grid (style.css):
   * nothing is placed, only its rows are chosen, compact or grown (grownRows in deck-model.ts,
   * from measured heights), and the juggler takes what the grid leaves. Elsewhere, over the stage
   * on a phone, measured so it fits every layout: in the right-hand column, else over the stage's
   * foot under the figure, or beside it when the stage is short; the stage keeps that part clear
   * (--wheel-pad-bottom, --wheel-pad-right; style.css), so the juggler draws in what is left and
   * stays in view (wheelPlace in deck-model.ts).
   */
  function placeWheel() {
    const flow = docked() || wheel.hidden || upright();
    if (flow) {
      for (const p of ['left', 'top', 'width']) picker.style.removeProperty(p);
      app.style.setProperty('--wheel-pad-bottom', '0px');
      app.style.setProperty('--wheel-pad-right', '0px');
    }
    picker.classList.toggle('is-compact', upright() && phase === 'compact');
    if (upright() && !wheel.hidden) return setRows(...uprightRows());
    if (flow) {
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
    // The filter chips sit above the rows, in the place (v6 ruling 4).
    const place = wheelPlace(box, DECK.rowPx, DECK.wheelRows, DECK.minFigurePx, DECK.sidePx, column, DECK.filtersPx);
    picker.style.left = `${place.left}px`;
    picker.style.top = `${place.top}px`;
    picker.style.width = `${place.width}px`;
    setRows(place.rows, DECK.rowPx);
    app.style.setProperty('--wheel-pad-bottom', `${place.padBottom}px`);
    app.style.setProperty('--wheel-pad-right', `${place.padRight}px`);
  }

  /** The sheet open on a phone (mount-sheet.ts sets the class). */
  const sheetOpen = () => app.classList.contains('sheet-open');
  /**
   * The upright card's rows (v6.6 rulings 4 and 5): compact, DECK.compactRows cut at the drum's
   * edges, or DECK.sheetRows (the band row alone) with the sheet open (v6.7 ruling 1); grown,
   * grownCount.
   */
  function uprightRows(): [number, number, number] {
    if (phase === 'compact') return [sheetOpen() ? DECK.sheetRows : DECK.compactRows, DECK.rowPx, DECK.compactCut];
    return [grownCount(), DECK.rowPx, 0];
  }
  /**
   * The rows the upright card shows grown: as many as leave the juggler DECK.minFigurePx above the
   * strip (DECK.sheetFigurePx with the sheet open, which then keeps its head and tabs and gives the
   * rest), measured. Nothing measured depends on the card's rows, so it can be asked from compact
   * (v6.7 ruling 2: a key's page).
   */
  function grownCount(): number {
    const view = root.closest('.play-view') as HTMLElement | null;
    const ladder = document.querySelector<HTMLElement>('.region-ladder');
    const sound = root.querySelector<HTMLElement>('.deck-sound');
    if (!view || !ladder || !sound || !sheet) return DECK.wheelRows;
    const open = sheetOpen();
    const top = sheet.getBoundingClientRect().top;
    const tabs = sheet.querySelector<HTMLElement>('.sheet-tabs');
    const keep = open && tabs ? tabs.getBoundingClientRect().bottom - top : sheet.offsetHeight;
    // The card less its rows: its margin over it, its border and the chips (the drum is border-box).
    const margin = parseFloat(getComputedStyle(picker).marginTop) || 0;
    const chrome = margin + picker.offsetHeight - wheel.offsetHeight;
    const heights = { view: view.clientHeight, chrome, strip: ladder.offsetHeight, sound: sound.offsetHeight, sheet: keep };
    return grownRows(heights, DECK.rowPx, DECK.wheelRows, DECK.compactRows, open ? DECK.sheetFigurePx : DECK.minFigurePx);
  }

  /**
   * The wheel shows `shown` rows `px` tall, the drum's edges cutting `cut` of a row off the outer
   * two (the compact wheel, v6.4 ruling 1). A new row height, or any change docked, brings the band
   * back to its row when the wheel next draws. On a phone a new count or cut needs nothing: row r
   * sits in the band at r rows down whatever the drum shows (scrollForRow), and a drum that grows
   * from compact as a turn grows it must not be pulled back to the card on stage.
   */
  function setRows(shown: number, px: number, cut = 0) {
    if (shown !== shownRows || px !== rowPx || cut !== shownCut) {
      if (px !== rowPx || docked()) scrollWanted = true;
      shownRows = shown;
      rowPx = px;
      shownCut = cut;
      wheel.style.setProperty('--deck-rows', String(shown));
      wheel.style.setProperty('--deck-row', `${px}px`);
      wheel.style.setProperty('--deck-cut', String(cut));
      // One row (the sheet open, v6.7 ruling 1) is the band row alone: nothing to dim (deck.css).
      picker.classList.toggle('is-one', shown === 1);
    }
  }

  // On a phone, a drum with ends (v6.2 ruling 4): the list has `half` blank rows above the first
  // row and below the last (deck.css), so row r sits in the band at a scrollTop of r rows
  // (scrollForRow). Docked there are none: the rows are a menu, top aligned, row r r rows down.
  let shownRows: number = DECK.wheelRows;
  let rowPx: number = DECK.rowPx;
  let shownCut = 0;
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
    dressOwn();
    dressBand();
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
      // Upright a hand-made pattern's band rests on Make your own (v6.6 ruling 9). At once, not
      // smoothly: typing passes through cards ("5" and "555" on the way to "5551"), and WebKit
      // snapped the list back to the card's row over a smooth scroll still under way.
      if (upright()) scrollToRow(own, false);
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

  /** Where the phone's band rests between turns: the card on stage, or Make your own where the band rests there. */
  const homeRow = () => (restOwn || current() === null ? own : (current() as number));
  /** The band was to go home under a held finger (shrink); it goes when the last finger lifts. */
  let bandHome = false;
  /** Turns the phone's band to `row` as the page's own goal: asked for again until it is there, and never a pick. */
  function seekBand(row: number) {
    keyTries = 0;
    seekRow = scrollToRow(row, true) ? row : null;
    clearTimeout(seekTimer);
    if (seekRow === null) return;
    seekTimer = setTimeout(() => (seekRow = null), DECK.settleMs * DECK.keySettleTries);
    // The settle asks for the goal again even if no scroll comes (issue 139): shrunk in the same
    // task, the drum's re-snap to the row it holds can cancel the smooth scroll before it moves,
    // and with no scroll event no settle ran, so the band stayed on the cancelled turn's row.
    armSettle();
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
    // A docked wheel is always open: the pattern button then only takes focus to it. Upright the
    // button is hidden and nothing opens the wheel (v6.6 ruling 10).
    if (docked() || upright()) {
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

  /** Closes the phone wheel; upright, where it never closes, makes a grown one compact (v6.6 ruling 4). */
  const closeWheel = () => {
    if (upright()) {
      if (phase !== 'compact') shrink('close');
      return;
    }
    if (!wheelOpen) return;
    wheelOpen = false;
    showWheel();
  };

  // The phone wheel's phase (nextPhase in deck-model.ts): spinning while the reader turns it,
  // settling after it stops, and 3 s later (DECK.returnMs) compact again upright (v6.6 ruling 4),
  // closed on its side. The timers live here; the rule is the model's.
  let phase: WheelPhase = upright() ? 'compact' : 'rest';
  let returnTimer: ReturnType<typeof setTimeout> | undefined;
  /** The wheel stopped under a finger: the return timer waits for the last finger to lift (issue 116). */
  let returnHeld = false;
  /** A touch began on the compact wheel: if it neither turns it nor taps a row, it grows it (v6.4 ruling 3). */
  let pressed = false;
  const setPhase = (event: Parameters<typeof nextPhase>[1]) => {
    phase = nextPhase(phase, event, upright());
    wheel.dataset.phase = phase;
  };
  wheel.dataset.phase = phase;
  // Ending the phase ends the turn: a settle still pending would arm the return timer again and
  // close a wheel that is open (issue 110: a chip tapped mid-turn; the pattern button tapped twice).
  const endPhase = () => {
    stopTurn();
    clearTimeout(returnTimer);
    returnHeld = false;
    pressed = false;
    setPhase('close');
  };
  /**
   * The upright wheel goes compact (v6.6 ruling 4): after the return delay, a row tapped, or
   * `close` (Escape, a tap outside, Details, Make your own). Focus stays where it is: the chips
   * stay, and the focused row survives the shrink (v6.4 ruling 7).
   */
  const shrink = (event: 'return' | 'tap' | 'close') => {
    // A turn still pending ends without a pick (issue 110): Escape or Details mid-turn loads nothing.
    stopTurn();
    clearTimeout(returnTimer);
    clearTimeout(growTimer);
    returnHeld = false;
    pressed = false;
    setPhase(event);
    placeWheel();
    // A turn ended that way leaves the band where it was turned to, on a row that never loaded:
    // the band row names the pattern (v6.6 ruling 9), so it goes back to the card on stage, or to
    // Make your own where the band rests there.
    // A goal the settle asks for again (seekRow), as a scroll the browser still runs (the turn's
    // own, or its snap) may land after this one.
    // Under a finger still on the list the scroll would read as a turn and grow the card again
    // (#116): the band goes home when the last finger lifts instead.
    if (event === 'close') {
      if (touching()) bandHome = true;
      else seekBand(homeRow());
    }
  };
  /**
   * A touch on the compact wheel that turned nothing and tapped no row grows it in place (v6.6
   * ruling 4), and it goes compact again DECK.returnMs after the lift, which was DECK.growGraceMs ago.
   */
  const grow = () => {
    pressed = false;
    setPhase('grow');
    placeWheel();
    if (phase === 'grown') armReturn(DECK.returnMs - DECK.growGraceMs);
  };
  /**
   * The grow waits DECK.growGraceMs after the finger lifts: a tap held past the turn's lapse has its
   * click still to come, and a drum grown under it would send the click to another row. The click
   * (stopTurn), or a new touch (turn), cancels it.
   */
  let growTimer: ReturnType<typeof setTimeout> | undefined;
  const armGrow = () => {
    clearTimeout(growTimer);
    growTimer = setTimeout(() => {
      if (phase === 'compact' && !touching() && !wheel.hidden) grow();
    }, DECK.growGraceMs);
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

  /**
   * One tab stop in the wheel (roving tabindex): the loaded row, else the row last in the band. The
   * list itself is none (tabindex -1): Firefox makes a scrolling box a tab stop of its own, which
   * put a stop before the row (v6.6 ruling 10).
   */
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
    dressBand();
  };

  // Upright the band row is the pattern's name (v6.6 ruling 9): its notation and name, then its
  // meta ("3 balls", "2 jugglers") in place of its tag, or "next cycle" in place of the meta while
  // a change waits (deck.css). One element each, moved to the row in the band; elsewhere "next
  // cycle" is the pattern button's, as before.
  const bandMeta = document.createElement('span');
  bandMeta.className = 'deck-band-meta';
  const pendingHome = pending.parentElement as HTMLElement;
  function dressBand() {
    const row = upright() ? rows[banded] : undefined;
    if (!row) {
      bandMeta.remove();
      if (pending.parentElement !== pendingHome) pendingHome.append(pending);
      return;
    }
    const p = order[banded];
    bandMeta.textContent = p ? presetMeta(p) : current() === null ? deckLabel(store.get()).meta : '';
    if (pending.parentElement !== row) row.append(pending);
    if (bandMeta.parentElement !== row) row.append(bandMeta);
  }
  /**
   * Upright, with a hand-made pattern on stage, Make your own shows the deck label, as the pattern
   * button did: its notation, "Your pattern" (the invalid colour on one that is not juggleable),
   * and, in the band, its meta (v6.6 ruling 9). A tap on it still opens the Pattern tab.
   */
  function dressOwn() {
    const row = rows[own];
    if (!row) return;
    const label = upright() && current() === null ? deckLabel(store.get()) : null;
    row.classList.toggle('is-yours', label !== null);
    row.classList.toggle('invalid', label !== null && !label.valid);
    (row.querySelector('.deck-own-code') as HTMLElement).textContent = label?.pattern ?? '';
    (row.querySelector('.deck-own-make') as HTMLElement).hidden = label !== null;
    (row.querySelector('.deck-own-yours') as HTMLElement).textContent = label?.name ?? '';
  }

  // Only a turn the reader makes picks, and only on a phone: a mouse wheel, a touch, or ↑ ↓ PageUp
  // PageDown Home End on a row. A scroll from the page (snapping after a layout change, the wheel
  // shown again, Tab bringing a row into view, the band following an arrow) never does. A turn
  // that does not scroll (at an end) lapses after two settles, so a later scroll from the page is
  // not taken for one (lapse). Docked the list is a menu, and its scroll only browses (v6.2 ruling 3).
  let turning = false;
  let turnTimer: ReturnType<typeof setTimeout> | undefined;
  const turn = () => {
    clearTimeout(growTimer);
    turning = true;
    seekRow = null;
    clearTimeout(returnTimer);
    returnHeld = false;
    clearTimeout(turnTimer);
    turnTimer = setTimeout(lapse, DECK.settleMs * 2);
  };
  /**
   * A finger is on the list: a turn that scrolls nothing does not end under it (issue 114), the
   * wheel never closes under it (issue 116), and a scroll under it is the reader's turn even after
   * it held still past the settle (issue 118). Only fingers that landed on the list count: one held
   * on a chip lifts there and changes nothing (issue 119). They are known by identifier (v6.7
   * ruling 3): a chip tapped under a held finger rebuilds the list, the finger is then on a
   * detached row, and its lift reaches neither the list nor the document (issue 121; a detached
   * node's event path is its own tree). So each held finger's lift is heard on the element it
   * landed on, attached or not, as well as on the document.
   */
  let held = new Set<number>();
  const touching = () => held.size > 0;
  /** A turn scrolled the wheel and its settle has not stopped it yet. */
  let unsettled = false;
  // The card grows on the first real scroll of a turn, not on the touch or the wheel event that
  // precedes it: a tap on a row must find the row where the finger landed (v5 ruling 9).
  // A touch that never scrolls is no turn at all.
  let scrolled = false;
  const sheetOn = () => {
    if (!upright()) return;
    const was = phase;
    pressed = false;
    setPhase('turn');
    // From compact the card grows in place (v6.6 ruling 4); grown, settling or spinning, it is grown already.
    if (was === 'compact') placeWheel();
  };
  const startTurn = (e: Event) => {
    if (docked()) return;
    scrolled = false;
    pressed = e.type === 'touchstart' && phase === 'compact';
    turn();
  };
  for (const type of ['wheel', 'touchstart']) list.addEventListener(type, startTurn, { passive: true });
  const LIFTS = ['touchend', 'touchcancel'] as const;
  /** Per held touch, the listeners on the element it landed on, removed once it is no longer held. */
  const liftWatch = new Map<number, () => void>();
  // Each touch that starts on the list is held (its target is attached at that moment).
  list.addEventListener(
    'touchstart',
    (e) => {
      for (const t of [...e.changedTouches]) {
        held.add(t.identifier);
        // An identifier the browser reuses (Chromium does, after a touch lost without a lift) may
        // still be watched on the old touch's element: watch the new touch's element instead, or
        // its lift on a detached row would go unheard again (#121).
        liftWatch.get(t.identifier)?.();
        const target = t.target;
        const onLift = (lift: Event) => recount(lift as TouchEvent, true);
        for (const type of LIFTS) target.addEventListener(type, onLift, { passive: true });
        liftWatch.set(t.identifier, () => {
          for (const type of LIFTS) target.removeEventListener(type, onLift);
        });
      }
    },
    { passive: true },
  );
  const liveIds = (e: TouchEvent) => [...e.touches].map((t) => t.identifier);
  /** The list's fingers are all up now: what a lift on the list did before issue 121. */
  const released = () => {
    if (bandHome) {
      bandHome = false;
      seekBand(homeRow());
    }
    // The wheel stopped under the finger: its return delay starts now it lifts.
    if (returnHeld) armReturn();
    // A finger held past the turn's lapse: the turn is over now it lifts.
    if (!turning) lapse();
    armSettle();
  };
  /** Keeps the held touches still down; the step from some held to none is the list's release. */
  const recount = (e: TouchEvent, release: boolean) => {
    if (!touching()) return;
    held = heldTouches(held, liveIds(e));
    for (const [id, unwatch] of liftWatch) {
      if (held.has(id)) continue;
      unwatch();
      liftWatch.delete(id);
    }
    if (!touching() && release) released();
  };
  for (const type of LIFTS) document.addEventListener(type, (e) => recount(e, true), { capture: true, passive: true });
  // A lift the page never heard (a touch lost to a system gesture) clears on the next touch. On
  // the list that touch begins a turn of its own (startTurn), which the release would only undo.
  document.addEventListener('touchstart', (e) => recount(e, !list.contains(e.target as Node)), { capture: true, passive: true });

  /** Turns the phone's wheel to `to` as the reader's turn: the band goes there, and the row loads when it settles. */
  function turnTo(to: number) {
    // A key at an end turns nothing: no turn, the card not grown.
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
    // From the compact card a key's turn grows it, so it pages by the rows the grown card will show
    // (v6.7 ruling 2): upright as many as fit (grownCount); on its side the full drum, as before.
    const to = rowAfterKey(e.key, roving, rowCount, keyPage(phase, shownRows, upright() ? grownCount() : DECK.wheelRows));
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
      unsettled = false;
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
    // A turn begun but not yet scrolled is not this settle's to end (issue 109): the settle was
    // armed before it, by a scroll from the page, and a turn's first scroll can come a few ms
    // after it. Ending the turn here would take that scroll for the page's own. A turn that never
    // scrolls lapses on its own (lapse).
    if (turning && !scrolled && keyRow === null) return;
    const user = turning || keyRow !== null;
    keyRow = null;
    seekRow = null;
    turning = false;
    clearTimeout(turnTimer);
    if (!user || !scrolled) return;
    stopWheel(at);
  }
  /**
   * A turn's input is over (its timer lapsed, or the finger lifted after it): a turn that scrolled
   * nothing is no turn of its own, so no settle comes to end it (issue 114: a sideways swipe, a
   * wheel past the last row, a finger lifted without a tap). The card may still be grown,
   * from the turn before, whose return timer this turn cleared or whose settle it swallowed (the
   * issue 109 guard in settle): the wheel stops, picks and closes as that turn would have.
   */
  function lapse() {
    turning = false;
    if (touching() || scrolled || keyRow !== null || wheel.hidden || docked()) return;
    // Compact, a touch that scrolled nothing and tapped no row (a tap clears this lapse: stopTurn)
    // grows the wheel back, once the last finger is up (v6.4 ruling 3); a mouse wheel does nothing.
    if (phase === 'compact') {
      if (pressed) armGrow();
      pressed = false;
      return;
    }
    if (phase === 'rest' && !unsettled) return;
    // Upright, a touch on the grown wheel at rest that turned nothing: compact the return delay
    // after it (v6.6 ruling 4), as after the lift that grew it.
    if (phase === 'grown' && !unsettled) return armReturn();
    clearTimeout(settleTimer);
    stopWheel(rowAt());
  }
  /** A turn ends: the upright wheel settles and goes compact DECK.returnMs later; the row in the band loads. */
  function stopWheel(at: number) {
    unsettled = false;
    if (upright()) {
      setPhase('stop');
      // It may settle under a held finger, but it closes only after the last finger lifts.
      if (touching()) {
        clearTimeout(returnTimer);
        returnHeld = true;
      } else armReturn();
    }
    // The band resting on Make your own opens nothing and loads nothing: only a tap on it does
    // (v6.1 ruling 2). Settled on a card, the band no longer rests on Make your own.
    if (at !== own) restOwn = false;
    const chosen = settledPick(at, current(), order.length);
    if (chosen !== null) pick(chosen);
  }
  /** Upright the wheel goes compact `ms` from now (v6.6 ruling 4); on its side it closes. */
  function armReturn(ms: number = DECK.returnMs) {
    returnHeld = false;
    clearTimeout(returnTimer);
    returnTimer = setTimeout(() => {
      if (nextPhase(phase, 'return', upright()) !== 'compact' || phase === 'compact') return;
      if (upright()) return shrink('return');
      // Turned on its side mid-settle: there the wheel never shrinks (ruling 6), it closes as before.
      const had = picker.contains(document.activeElement);
      closeWheel();
      if (had) patternButton.focus();
    }, ms);
  }
  function armSettle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, DECK.settleMs);
  }
  /**
   * A tap on a row or a chip ends the reader's turn: the settle it left pending never runs, so it
   * neither picks the row under the band nor arms the return timer that closes the wheel (issue 110).
   */
  function stopTurn() {
    clearTimeout(growTimer);
    clearTimeout(settleTimer);
    clearTimeout(turnTimer);
    turning = false;
    pressed = false;
    unsettled = false;
    keyRow = null;
    seekRow = null;
  }
  list.addEventListener('scroll', () => {
    // Docked, a scroll browses the menu: it never picks and never moves the band (v6.2 ruling 3).
    if (docked()) return;
    const mine = ownTop !== null && Math.abs(list.scrollTop - ownTop) < 1;
    ownTop = null;
    band(rowAt());
    // A scroll the page made itself (re-placing the wheel, a snap) is no turn and grows nothing.
    // Under a finger it is the reader's, though the settle ended the turn while it held still (issue 118).
    if ((turning || touching()) && !mine) {
      // A turn after all: its settle loads the row it lands on, so the band needs no going home.
      bandHome = false;
      sheetOn();
      turn();
      scrolled = true;
      unsettled = true;
    }
    armSettle();
  });

  // One listener for every row, so a rebuilt list (buildList) needs none of its own.
  list.addEventListener('click', (e) => {
    const button = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('.deck-row') : null;
    if (!button) return;
    const i = Number(button.dataset.row);
    stopTurn();
    if (i === own) {
      // Docked, the band goes to Make your own and the editor shows under it (v6 ruling 2): a
      // click, Enter or Space on it, never the band passing (v6.1 ruling 2).
      restOwn = true;
      setEditor({ kind: 'makeOwn' });
      markRows();
      // The next draw brings it into view, once the wheel has its new height.
      if (docked()) scrollWanted = true;
      // Upright the card goes compact, its band on Make your own (v6.6 ruling 4).
      closeWheel();
      if (upright()) scrollToRow(own, true);
      store.set({ sheetTab: 'pattern' });
      return;
    }
    // A tap on a row is a gesture: it plays the row (ruling A), unlike a step or a settle. Upright
    // the wheel then goes compact, from the open, turning or compact wheel (v6.4 ruling 4); on its
    // side it closes.
    pick(i);
    start(player, store.get());
    rove(i);
    markRows();
    if (upright()) shrink('tap');
    else closeWheel();
    scrollToCurrent(true);
  });

  // The filter chips (v6.1 ruling 4, chooseFilter in deck-model.ts): one lit at a time across both
  // groups, the lit one tapped again clears. A chip that does not hold the card on stage loads its first card,
  // as a step does (no sound starts; the web editor hides). The phone wheel stays open.
  /** The filter a chip stands for, from its data attributes. */
  const chipOf = (b: HTMLButtonElement) => ({ by: b.dataset.by as 'balls' | 'jugglers', n: Number(b.dataset.n) });
  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      // On a phone a chip tapped while the wheel turns or settles ends the turn: the wheel goes back
      // to its place at rest and stays open while the reader filters (no pending settle, and so no
      // return timer, closes it: issue 110). In landscape a turn never leaves rest, and its settle
      // is cancelled too, so it cannot pick a row of the rebuilt list.
      // Upright a chip neither grows nor shrinks the card (v6.6 ruling 4): the turn ends without a
      // pick, and a grown card goes compact the return delay after the tap (or the last finger's
      // lift on the list).
      if (upright()) {
        stopTurn();
        if (phase === 'spinning') setPhase('stop');
        if (phase !== 'compact') {
          clearTimeout(returnTimer);
          if (touching()) returnHeld = true;
          else armReturn();
        }
      } else {
        const was = phase;
        endPhase();
        if (was !== 'rest') placeWheel();
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

  // Tapping outside closes the phone wheel; the tap still does what it does, the pattern name
  // toggles it. Upright (v6.6 ruling 4) a tap outside the card and the side column makes a grown
  // card compact; Play, mute and the slider leave it as it is.
  const sideColumn = $<HTMLDivElement>('.deck-bar');
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Node;
    if (docked() || picker.contains(target)) return;
    if (upright()) {
      if (!sideColumn.contains(target)) closeWheel();
      return;
    }
    if (wheelOpen && !patternButton.contains(target)) closeWheel();
  });
  // Escape closes the wheel first, and only the wheel. Upright it makes a grown card compact, and
  // on a compact one passes on (the sheet's Escape closes the sheet); focus stays where it is.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || docked()) return;
      if (upright()) {
        if (phase === 'compact') return;
        e.stopPropagation();
        closeWheel();
        return;
      }
      if (!wheelOpen) return;
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
   * Docked, and in the upright card (v6.6), each wheel row's notation is drawn smaller to fit what
   * its name leaves it (deck.css), from its size (DECK.dockedNotationPx docked, the CSS size upright)
   * down to dockedNotationMinPx, measured as the bar's notation is (fitFontPx, nextFit); past the
   * floor it ellipsizes. On its side the rows keep their CSS size.
   */
  let fittedWidth = -1;
  function fitRows() {
    const on = (docked() || upright()) && !wheel.hidden;
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
      code.style.removeProperty('font-size');
      const full = docked() ? DECK.dockedNotationPx : parseFloat(getComputedStyle(code).fontSize);
      code.style.fontSize = `${full}px`;
      const room = code.clientWidth;
      let size = fitFontPx(code.scrollWidth, room, full, DECK.dockedNotationMinPx);
      for (let i = 0; i < DECK.notationFitTries && size !== full; i++) {
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
    dressOwn();
    dressBand();
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
  // Upright (v6.6 ruling 10) the wheel's list is the first tab stop after the top bar, then the
  // chips, Play, mute, the slider, Listen for, Details: the picker goes before the bar, the chips
  // after the drum (deck.css shows them on top). Elsewhere the order is as before.
  const filtersEl = $<HTMLDivElement>('.deck-filters');
  function placeParts() {
    const had = picker.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    if (upright()) {
      if (picker.nextElementSibling !== bar) bar.before(picker);
      if (filtersEl.previousElementSibling !== wheel) wheel.after(filtersEl);
    } else {
      if (picker.previousElementSibling !== bar) bar.after(picker);
      if (filtersEl.nextElementSibling !== wheel) wheel.before(filtersEl);
    }
    if (had && document.activeElement !== had) had.focus({ preventScroll: true });
  }
  /**
   * The layout turned (mount-sheet.ts and mount-layout.ts set the classes, after this mount):
   * turned upright the card is compact (v6.6 ruling 11); turned on its side from upright, the wheel
   * shows as the column's open wheel. A page that opens on its side is not turned from upright:
   * its wheel opens as before (a first visit only).
   */
  let wasUpright = upright();
  let drawnUpright = false;
  function turned() {
    wasUpright = upright();
    if (!wasUpright && drawnUpright) wheelOpen = true;
    placeParts();
    endPhase();
    showWheel();
    dressOwn();
    dressBand();
    refitRows();
    scrollWanted = true;
  }
  // The sheet opened or closed: upright the compact card's rows follow at once (v6.7 ruling 1: the
  // band row alone while it is open, three when it closes), the band on the same row.
  let wasSheetOpen = sheetOpen();
  new MutationObserver(() => {
    if (upright() !== wasUpright) turned();
    if (sheetOpen() === wasSheetOpen) return;
    wasSheetOpen = sheetOpen();
    // Upright only: wide, docked and on its side the sheet never changes the wheel's rows.
    if (upright() && !wheel.hidden) placeWheel();
  }).observe(app, { attributes: true, attributeFilter: ['class'] });

  buildList();
  applyFilter();
  placePattern();
  placeParts();
  showWheel();
  render();

  let shownState = '';
  return {
    draw(view) {
      drawnUpright = upright();
      if (scrollWanted && !wheel.hidden) {
        scrollWanted = false;
        placeWheel();
        // Docked, the chosen row (menuBand). On a phone a hand-made pattern keeps the row last in
        // the band, or Cascade the first time.
        // Upright it rests on Make your own (v6.6 ruling 9).
        const row = docked() ? menuBand(current(), own, restOwn) : (current() ?? (upright() ? own : Math.max(0, bandRow)));
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
