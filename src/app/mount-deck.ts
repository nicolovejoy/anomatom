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
  settledPick,
  stepIndex,
  stepKey,
  toggle,
  volumePatch,
  wheelIndexAt,
  wheelNotch,
} from './deck-model';
import { cardPattern, presetPatch } from './first-minute';
import type { Mount } from './mount';
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
      <button type="button" class="deck-pattern" aria-controls="deck-wheel" aria-expanded="false">
        <code class="deck-notation"></code>
        <span class="deck-sub"><span class="deck-name"></span><span class="deck-dot">${t.dot}</span><span class="deck-meta"></span><span id="pending" class="deck-pending" hidden>${copy.nextCycle}</span></span>
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
              `<li><button type="button" class="deck-row" data-row="${i}"><code>${cardPattern(p)}</code><span class="deck-row-name">${copy.presets[p.id]?.name ?? ''}</span><em>${groupTag(p.group)}</em></button></li>`,
          )
          .join('')}
        <li><button type="button" class="deck-row deck-own" data-row="${presets.length}"><span class="deck-row-name">${t.makeYourOwn}</span></button></li>
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

  /** Over the stage on a phone: the stage's left, width and bottom, measured, so it fits every layout. */
  function placeWheel() {
    if (docked()) {
      wheel.style.removeProperty('left');
      wheel.style.removeProperty('top');
      wheel.style.removeProperty('width');
      return;
    }
    const stage = document.querySelector('.stage') as HTMLElement | null;
    const view = root.closest('.play-view') as HTMLElement | null;
    if (!stage || !view) return;
    const s = stage.getBoundingClientRect();
    const v = view.getBoundingClientRect();
    const height = DECK.rowPx * DECK.wheelRows;
    wheel.style.left = `${s.left - v.left}px`;
    wheel.style.width = `${s.width}px`;
    wheel.style.top = `${Math.max(s.top - v.top, s.bottom - v.top - height)}px`;
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
    patternButton.setAttribute('aria-expanded', String(shown));
    if (shown) placeWheel();
    if (shown && !was) scrollWanted = true;
  }

  const closeWheel = () => {
    if (!wheelOpen) return;
    wheelOpen = false;
    showWheel();
  };

  patternButton.addEventListener('click', () => {
    if (docked()) return;
    wheelOpen = !wheelOpen;
    showWheel();
  });

  /** The row in the band, marked while the wheel turns. */
  let banded = -1;
  const band = (row: number) => {
    if (row === banded) return;
    rows[banded]?.classList.remove('in-band');
    rows[row]?.classList.add('in-band');
    banded = row;
  };

  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  list.addEventListener('scroll', () => {
    const row = wheelIndexAt(list.scrollTop, DECK.rowPx, rowCount);
    band(row);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const at = wheelIndexAt(list.scrollTop, DECK.rowPx, rowCount);
      const chosen = settledPick(at, current(), presets.length);
      if (chosen !== null) pick(chosen);
    }, DECK.settleMs);
  });

  rows.forEach((row, i) =>
    row.addEventListener('click', () => {
      clearTimeout(settleTimer);
      if (i >= presets.length) {
        closeWheel();
        store.set({ sheetTab: 'pattern' });
        return;
      }
      pick(i);
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
  window.addEventListener('resize', () => {
    if (!wheel.hidden) placeWheel();
  });

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

  // Bubbling, so a control that walks its own arrows (the ratio chips) has had them first.
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
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
    patternButton.setAttribute('aria-label', t.choose(label.pattern, label.name));
    const i = current();
    rows.forEach((row, r) => row.classList.toggle('on', r === i));
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
    scrollToCurrent(true);
  }

  store.subscribe((state, previous) => {
    const keys = ['parts', 'ratio', 'drafts', 'mapping', 'volume', 'muted'] as const;
    if (keys.some((k) => state[k] !== previous[k])) render();
  });
  showWheel();
  render();

  let shownState = '';
  return {
    draw(view) {
      if (scrollWanted && !wheel.hidden) {
        scrollWanted = false;
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
