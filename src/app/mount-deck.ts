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
  deckLabel,
  deckPresets,
  groupTag,
  keyTarget,
  masterGain,
  presetIndex,
  rowAfterKey,
  settledPick,
  start,
  stepIndex,
  stepKey,
  toggle,
  turnsWheel,
  volumePatch,
  wheelIndexAt,
  wheelNotch,
  wheelPlace,
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
          <option value="mixed" disabled hidden>${t.mixed}</option>
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

  root.style.setProperty('--deck-row', `${DECK.rowPx}px`);
  root.style.setProperty('--deck-rows', String(DECK.wheelRows));

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
      for (const p of ['left', 'top', 'width']) wheel.style.removeProperty(p);
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
    // A phone on its side: the right-hand column under the transport bar is free while the sheet is closed.
    let column = null;
    if (app.classList.contains('is-landscape') && !app.classList.contains('sheet-open')) {
      const r = root.getBoundingClientRect();
      const b = (root.querySelector('.deck-bar') as HTMLElement).getBoundingClientRect();
      column = { left: r.left - v.left, top: b.bottom - v.top, width: r.width, height: v.bottom - b.bottom };
    }
    const place = wheelPlace(box, DECK.rowPx * DECK.wheelRows, DECK.minFigurePx, DECK.sidePx, column);
    wheel.style.left = `${place.left}px`;
    wheel.style.top = `${place.top}px`;
    wheel.style.width = `${place.width}px`;
    app.style.setProperty('--wheel-pad-bottom', `${place.padBottom}px`);
    app.style.setProperty('--wheel-pad-right', `${place.padRight}px`);
  }

  /** Brings the wheel's band to the loaded preset; a hand-made pattern leaves it where it is. */
  let scrollWanted = true;
  function scrollToCurrent(smooth: boolean) {
    const i = current();
    if (i === null || wheel.hidden) return;
    const top = i * DECK.rowPx;
    if (Math.abs(list.scrollTop - top) < 1) return;
    list.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
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
    const to = rowAfterKey(e.key, roving, rowCount, DECK.wheelRows);
    rove(to);
    rows[to]?.focus({ preventScroll: true });
    list.scrollTo({ top: to * DECK.rowPx, behavior: 'smooth' });
  });
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  list.addEventListener('scroll', () => {
    const row = wheelIndexAt(list.scrollTop, DECK.rowPx, rowCount);
    band(row);
    if (turning) turn();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const user = turning;
      turning = false;
      clearTimeout(turnTimer);
      if (!user || wheel.hidden) return;
      const at = wheelIndexAt(list.scrollTop, DECK.rowPx, rowCount);
      const chosen = settledPick(at, current(), presets.length);
      if (chosen !== null) pick(chosen);
    }, DECK.settleMs);
  });

  rows.forEach((row, i) =>
    row.addEventListener('click', () => {
      clearTimeout(settleTimer);
      turning = false;
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

  function render() {
    const state = store.get();
    const label = deckLabel(state, presets);
    notation.textContent = label.pattern;
    nameEl.textContent = label.name;
    dot.hidden = label.name === '';
    metaEl.textContent = label.meta;
    patternButton.classList.toggle('invalid', !label.valid);
    patternButton.classList.toggle('long', label.long);
    patternButton.setAttribute('aria-label', t.choose(label.pattern, label.name));
    const i = current();
    rows.forEach((row, r) => {
      row.classList.toggle('on', r === i);
      if (r === i) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
    if (i !== null && !rows[roving]?.matches(':focus')) rove(i);
    const now = nowPlaying(state);
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
        scrollToCurrent(false);
        band(current() ?? banded);
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
