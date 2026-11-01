// The deck (docs/plans/v4-deck.md, rulings 1 to 4): the transport bar (Play/Pause, ‹, the pattern,
// ›, mute and volume), the sound row (Kit, Sound, Details) and the pattern wheel. On a phone the
// wheel opens over the stage from the pattern name; on a wide screen tall enough it stays open at
// the top of the right-hand column. The logic is in deck-model.ts; this file is elements and events.
//
// This mount owns Play and the keys that drive it: Space plays and pauses from anywhere (one
// capturing handler), except in a pattern text input and in a control that uses Space itself
// (keepsSpace in sheet-model.ts); ← and → step the pattern except in a field, a select, a slider
// or a tab (stepKey in deck-model.ts). A select hands focus to Play after a choice, so both keys
// work again at once.
import { PRESET_NAMES } from '../sound/mapping';
import type { PresetName } from '../sound/mapping';
import { DECK, KIT_IDS, KNOBS, SHEET } from '../tunables';
import { copy } from '../ui/copy';
import {
  centrePlace,
  deckLabel,
  deckPresets,
  fitFontPx,
  groupTag,
  keyTarget,
  loopDelta,
  masterGain,
  nearEnd,
  offsetFor,
  placeOf,
  presetIndex,
  rowAfterKey,
  scrollForPlace,
  settledPick,
  start,
  stepIndex,
  stepKey,
  toggle,
  turnsWheel,
  volumePatch,
  wheelNotch,
  wheelPlace,
  wheelRowAt,
} from './deck-model';
import { cardPattern, presetPatch } from './first-minute';
import type { Mount } from './mount';
import { route } from './route';
import { kitEdit, nowPlaying, presetEdit } from './now-playing-model';
import { fillPercent, keepsSpace } from './sheet-model';
import { applyEdit } from './sound-panel-model';
import './deck.css';

const chevron = (left: boolean) =>
  `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="${left ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;
const SPEAKER =
  '<svg class="icon-on" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>' +
  '<svg class="icon-off" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6"/></svg>';

export const mountDeck: Mount = (root, { store, player, sound }) => {
  const app = (root.closest('#app') as HTMLElement | null) ?? document.body;
  const t = copy.deck;
  const presets = deckPresets();
  const rowCount = presets.length + 1;

  root.innerHTML = `
    <div class="deck-bar" role="group" aria-label="${t.label}">
      <button id="play" type="button" class="deck-play" data-state="stopped">
        <svg class="icon-play" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>
        <svg class="icon-pause" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" fill="currentColor"/><rect x="14" y="4" width="5" height="16" fill="currentColor"/></svg>
        <span class="sr-only play-label">${copy.play}</span>
      </button>
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
    <div class="deck-wheel" id="deck-wheel" hidden>
      <ol class="deck-wheel-list" aria-label="${t.wheelLabel}">
        ${presets
          .map(
            (p, i) =>
              `<li><button type="button" class="deck-row" tabindex="-1" data-row="${i}" data-id="${p.id}"><code>${cardPattern(p)}</code><span class="deck-row-name">${copy.presets[p.id]?.name ?? ''}</span><em>${groupTag(p.group)}</em></button></li>`,
          )
          .join('')}
        <li><button type="button" class="deck-row deck-own" tabindex="-1" data-row="${presets.length}"><span class="deck-row-name">${t.makeYourOwn}</span></button></li>
      </ol>
    </div>
    <div class="deck-sound">
      <label class="deck-field"><span class="deck-k">${t.kit}</span>
        <select id="deck-kit">
          <option value="mixed" disabled hidden></option>
          ${KIT_IDS.map((k) => `<option value="${k}">${copy.kitNames[k] ?? k}</option>`).join('')}
        </select></label>
      <label class="deck-field"><span class="deck-k">${t.sound}</span>
        <select id="deck-sound">
          <option value="custom" disabled hidden>${t.custom}</option>
          ${PRESET_NAMES.map((n) => `<option value="${n}">${copy.presetNames[n] ?? n}</option>`).join('')}
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
  const wheel = $<HTMLDivElement>('.deck-wheel');
  const list = $<HTMLOListElement>('.deck-wheel-list');
  const rows = [...root.querySelectorAll<HTMLButtonElement>('.deck-row')];
  const kitSelect = $<HTMLSelectElement>('#deck-kit');
  const soundSelect = $<HTMLSelectElement>('#deck-sound');
  const details = $<HTMLButtonElement>('.deck-details');

  const mixedOption = kitSelect.querySelector('option[value="mixed"]') as HTMLOptionElement;
  const rowItems = rows.map((r) => r.parentElement as HTMLLIElement);

  root.style.setProperty('--deck-row', `${DECK.rowPx}px`);
  root.style.setProperty('--deck-rows', String(DECK.wheelRows));
  root.style.setProperty('--deck-slider', `${DECK.sliderPx}px`);
  root.style.setProperty('--deck-slider-phone', `${DECK.phoneSliderPx}px`);

  // -------------------------------------------------------------------------------------------
  // Play, and the pattern: step, pick
  // -------------------------------------------------------------------------------------------

  const togglePlay = () => toggle(player, store.get());
  playButton.addEventListener('click', togglePlay);

  const current = () => presetIndex(store.get(), presets);
  /** Loads a preset; a playing player plays it from the next cycle, a paused or stopped one stays so. */
  const pick = (i: number) => {
    const p = presets[i];
    if (p) store.dispatch(presetPatch(p));
  };
  const step = (delta: -1 | 1) => pick(stepIndex(current(), delta, presets.length));
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

  const dockedQuery = window.matchMedia(`(min-width: ${SHEET.wideMinWidthPx}px) and (min-height: ${DECK.dockedMinHeightPx}px)`);
  // A bare address opens with the wheel open on a phone, so a first visit sees the patterns.
  let wheelOpen = location.hash === '' || location.hash === '#';
  const docked = () => dockedQuery.matches;
  const wheelShown = () => docked() || wheelOpen;

  /**
   * Over the stage on a phone, measured so it fits every layout: under the figure, or beside it
   * when the stage is short. The stage keeps that part clear (--wheel-pad-*, style.css), so the
   * juggler draws in what is left and stays in view (wheelPlace in deck-model.ts).
   */
  function placeWheel() {
    if (docked() || wheel.hidden) {
      for (const p of ['left', 'top', 'width', '--deck-rows']) wheel.style.removeProperty(p);
      shownRows = DECK.wheelRows;
      app.style.setProperty('--wheel-pad-bottom', '0px');
      app.style.setProperty('--wheel-pad-right', '0px');
      return;
    }
    const stage = document.querySelector('.stage') as HTMLElement | null;
    const view = root.closest('.play-view') as HTMLElement | null;
    if (!stage || !view) return;
    const s = stage.getBoundingClientRect();
    const v = view.getBoundingClientRect();
    const box = { left: s.left - v.left, top: s.top - v.top, width: s.width, height: s.height };
    // A phone on its side, or a wide screen too short to dock: the right-hand column below Kit and
    // Sound, over the sheet, so the wheel covers neither the beat ladder nor Kit and Sound.
    let column = null;
    if (app.classList.contains('is-landscape') || app.classList.contains('is-wide')) {
      const k = (root.querySelector('.deck-sound') as HTMLElement).getBoundingClientRect();
      column = { left: k.left - v.left, top: k.bottom - v.top, width: k.width, height: v.bottom - k.bottom };
    }
    const place = wheelPlace(box, DECK.rowPx, DECK.wheelRows, DECK.minFigurePx, DECK.sidePx, column);
    wheel.style.left = `${place.left}px`;
    wheel.style.top = `${place.top}px`;
    wheel.style.width = `${place.width}px`;
    if (place.rows !== shownRows) {
      shownRows = place.rows;
      wheel.style.setProperty('--deck-rows', String(place.rows));
      scrollWanted = true;
    }
    app.style.setProperty('--wheel-pad-bottom', `${place.padBottom}px`);
    app.style.setProperty('--wheel-pad-right', `${place.padRight}px`);
  }

  // The loop (deck-model.ts): each row's place in the list is its CSS order; `offset` is the row
  // at place 0. While the wheel rests, the band's row sits at the middle place.
  let shownRows: number = DECK.wheelRows;
  const half = () => (shownRows - 1) / 2;
  let offset = 0;
  const rowAt = () => wheelRowAt(list.scrollTop, DECK.rowPx, half(), offset, rowCount);

  /**
   * Turns the list so `row` sits at the middle place, moving scrollTop by as many rows as `row`
   * moved, so nothing on screen shifts. Programmatic: never a turn by the reader.
   */
  function recentre(row: number) {
    const next = offsetFor(row, rowCount);
    if (next === offset) return;
    // Read before the order changes: a browser may re-snap to the moved row on the next layout
    // (WebKit does), so the new scrollTop is set outright, never added to the live one.
    const top = list.scrollTop + (centrePlace(rowCount) - placeOf(row, offset, rowCount)) * DECK.rowPx;
    offset = next;
    rowItems.forEach((li, r) => (li.style.order = String(placeOf(r, offset, rowCount))));
    list.scrollTop = top;
  }

  /** Brings `row` into the band, the shortest way round the loop. */
  function scrollToRow(row: number, smooth: boolean) {
    if (wheel.hidden) return;
    if (!smooth) {
      recentre(row);
      list.scrollTop = scrollForPlace(centrePlace(rowCount), DECK.rowPx, half());
      return;
    }
    const from = rowAt();
    recentre(from);
    const top = scrollForPlace(centrePlace(rowCount) + loopDelta(from, row, rowCount), DECK.rowPx, half());
    if (Math.abs(list.scrollTop - top) < 1) return;
    list.scrollTo({ top, behavior: 'smooth' });
  }

  /** Brings the wheel's band to the loaded preset; a hand-made pattern leaves it where it is. */
  let scrollWanted = true;
  function scrollToCurrent(smooth: boolean) {
    const i = current();
    if (i !== null) scrollToRow(i, smooth);
  }

  function showWheel() {
    const shown = wheelShown();
    const was = !wheel.hidden;
    wheel.hidden = !shown;
    app.classList.toggle('deck-docked', docked());
    app.classList.toggle('wheel-open', shown && !docked());
    // A docked wheel is always open: the pattern button then only takes focus to it.
    if (docked()) {
      patternButton.removeAttribute('aria-expanded');
      patternButton.removeAttribute('aria-controls');
    } else {
      patternButton.setAttribute('aria-controls', 'deck-wheel');
      patternButton.setAttribute('aria-expanded', String(shown));
    }
    placeWheel();
    if (shown && !was) scrollWanted = true;
  }

  const closeWheel = () => {
    if (!wheelOpen) return;
    wheelOpen = false;
    showWheel();
  };

  patternButton.addEventListener('click', () => {
    if (docked()) {
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
    roving = Math.min(rows.length - 1, Math.max(0, row));
    rows[roving]?.setAttribute('tabindex', '0');
  };

  /** The row in the band, marked while the wheel turns. */
  let banded = -1;
  const band = (row: number) => {
    if (row === banded) return;
    rows[banded]?.classList.remove('in-band');
    rows[row]?.classList.add('in-band');
    banded = row;
  };

  // Only a turn the reader makes picks: a mouse wheel, a touch, or ↑ ↓ PageUp PageDown Home End
  // on a row. A scroll from the page (snapping after a layout change, the wheel shown again, Tab
  // bringing a row into view, the band following an arrow) never does. A turn that does not scroll
  // (at an end) lapses after two settles, so a later scroll from the page is not taken for one.
  let turning = false;
  let turnTimer: ReturnType<typeof setTimeout> | undefined;
  const turn = () => {
    turning = true;
    clearTimeout(turnTimer);
    turnTimer = setTimeout(() => (turning = false), DECK.settleMs * 2);
  };
  for (const type of ['wheel', 'touchstart']) list.addEventListener(type, turn, { passive: true });
  list.addEventListener('keydown', (e) => {
    if (!turnsWheel(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    turn();
    const to = rowAfterKey(e.key, roving, rowCount, shownRows);
    rove(to);
    rows[to]?.focus({ preventScroll: true });
    keyRow = to;
    keyTries = 0;
    scrollToRow(to, true);
    armSettle();
  });

  // A key's target row, until the band reaches it. A browser may wait a few hundred ms before it
  // starts a smooth scroll; a settle in that gap must not end the turn, or the band lands on a
  // row that is never loaded. So while a key's row is outstanding the settle re-arms (and asks
  // for the scroll again), a bounded number of times.
  let keyRow: number | null = null;
  let keyTries = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  function settle() {
    if (wheel.hidden) {
      keyRow = null;
      turning = false;
      return;
    }
    const at = rowAt();
    if (keyRow !== null && at !== keyRow && keyTries < DECK.keySettleTries) {
      keyTries += 1;
      turn();
      scrollToRow(keyRow, true);
      armSettle();
      return;
    }
    const user = turning || keyRow !== null;
    keyRow = null;
    turning = false;
    clearTimeout(turnTimer);
    // At rest, the band's row goes back to the middle place, so the wheel can turn on either way.
    recentre(at);
    if (!user) return;
    const chosen = settledPick(at, current(), presets.length);
    if (chosen !== null) pick(chosen);
  }
  function armSettle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, DECK.settleMs);
  }
  list.addEventListener('scroll', () => {
    // Near an end mid-spin, the list turns at once (the turn goes on), so a long spin loops
    // forever and picks once, when it settles. A key's smooth scroll, cut short by the turn, is
    // asked for again.
    if (nearEnd(list.scrollTop, DECK.rowPx, half(), rowCount, DECK.loopMarginRows)) {
      recentre(rowAt());
      if (keyRow !== null) scrollToRow(keyRow, true);
    }
    band(rowAt());
    if (turning) turn();
    armSettle();
  });

  rows.forEach((row, i) =>
    row.addEventListener('click', () => {
      clearTimeout(settleTimer);
      turning = false;
      keyRow = null;
      if (i >= presets.length) {
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
    }),
  );

  // Tapping outside closes the phone wheel; the tap still does what it does.
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Node;
    if (wheelOpen && !docked() && !wheel.contains(target) && !patternButton.contains(target)) closeWheel();
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

  dockedQuery.addEventListener('change', showWheel);
  // The stage moves as the sheet opens and closes and the window turns: the wheel follows it.
  const follow = () => {
    if (!wheel.hidden) placeWheel();
  };
  const stageEl = document.querySelector('.stage');
  if (stageEl && typeof ResizeObserver === 'function') new ResizeObserver(follow).observe(stageEl);
  window.addEventListener('resize', follow);

  // -------------------------------------------------------------------------------------------
  // Volume, mute, Kit, Sound, Details
  // -------------------------------------------------------------------------------------------

  volume.addEventListener('input', () => store.set(volumePatch(Number(volume.value))));
  mute.addEventListener('click', () => store.set({ muted: !store.get().muted }));

  const edit = (e: Parameters<typeof applyEdit>[1]) => store.set({ mapping: applyEdit(store.get().mapping, e) });
  kitSelect.addEventListener('change', () => {
    edit(kitEdit(kitSelect.value));
    playButton.focus();
  });
  soundSelect.addEventListener('change', () => {
    edit(presetEdit(soundSelect.value as PresetName));
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

  // Bubbling, so a control that walks its own arrows (the ratio chips) has had them first. Only
  // on the play view: under About the arrows scroll the page.
  const playView = root.closest('.play-view') as HTMLElement | null;
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing || playView?.hidden || route(location.hash).view === 'about') return;
    const el = e.target instanceof Element ? e.target : null;
    const kind = el ? keyTarget(el.tagName, el instanceof HTMLInputElement ? el.type : null, el.getAttribute('role')) : 'other';
    const delta = stepKey(e.key, kind, { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey });
    if (delta === null) return;
    e.preventDefault();
    step(delta);
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
  function fitNotation() {
    notation.style.fontSize = `${DECK.notationPx}px`;
    if (notation.clientWidth === 0) return; // hidden (About shows): fitted when it shows again
    // A pixel spare: scrollWidth is rounded, and a fraction over would ellipsize.
    const size = fitFontPx(notation.scrollWidth, notation.clientWidth - 1, DECK.notationPx, DECK.notationMinPx);
    if (size !== DECK.notationPx) notation.style.fontSize = `${size}px`;
  }
  // The bar's width changes as the window turns and as the play view shows again after About.
  const bar = $<HTMLDivElement>('.deck-bar');
  if (typeof ResizeObserver === 'function') new ResizeObserver(fitNotation).observe(bar);
  else window.addEventListener('resize', fitNotation);
  void document.fonts?.ready.then(fitNotation);

  function render() {
    const state = store.get();
    const label = deckLabel(state, presets);
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
    const i = current();
    rows.forEach((row, r) => {
      row.classList.toggle('on', r === i);
      if (r === i) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
    if (i !== null && !rows[roving]?.matches(':focus')) rove(i);
    const now = nowPlaying(state);
    mixedOption.textContent = now.kitLabel;
    kitSelect.value = now.kit;
    soundSelect.value = now.preset;
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
    const keys = ['parts', 'ratio', 'drafts', 'mapping', 'volume', 'muted'] as const;
    if (keys.some((k) => state[k] !== previous[k])) render();
    // Only a new pattern moves the band: a volume or sound change mid-turn leaves the wheel be.
    if (state.parts !== previous.parts || state.ratio !== previous.ratio) scrollToCurrent(true);
  });
  showWheel();
  render();

  let shownState = '';
  return {
    draw(view) {
      if (scrollWanted && !wheel.hidden) {
        scrollWanted = false;
        placeWheel();
        // A hand-made pattern keeps the row last in the band, or Cascade the first time.
        const row = current() ?? Math.max(0, banded);
        scrollToRow(row, false);
        band(row);
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
