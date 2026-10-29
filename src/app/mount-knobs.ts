// The knob panel (SPEC §4.1) and the fix state (SPEC §4.2). The knobs write to the store; the
// store is the one source of truth for pattern text, ratio, tempo, volume and whether the sound
// panel is open, and this panel re-reads it on every change (an edit here, or a restored share
// link). The logic is in knobs-model.ts; this file is elements and events.
//
// Space toggles play from anywhere (one capturing handler, at the bottom), with two
// exemptions: a pattern text input, where Space types the space that separates throws at other
// ratios than 1:1; and any control inside `[data-keeps-space]` (a select, say). Range sliders
// do not use Space, so they need no exemption.
import { buildSchedule, fixesFor, isVanilla, reduceRatio } from '../core';
import type { Hand, PatternInput, Schedule } from '../core';
import { BPM_RANGE, KNOBS, MAX_RATIO, RATIO_CHIPS } from '../tunables';
import { copy } from '../ui/copy';
import type { PlayerView } from '../view/types';
import {
  analyse,
  badChar,
  clampBpm,
  cyclePosition,
  editText,
  fixLabel,
  fixTexts,
  hand2Bpm,
  handState,
  pieces,
  siteCovering,
  statusLines,
  stepRatio,
  swapText,
  toggleSite,
  warnSites,
  type Analysis,
  type Caret,
  type SiteSelection,
} from './knobs-model';
import type { Mount } from './mount';
import type { AppState } from './state';
import './knobs.css';

const HANDS = [0, 1] as const;
const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export const mountKnobs: Mount = (root, { store, player, sound }) => {
  root.style.setProperty('--warning', KNOBS.warning);
  root.style.setProperty('--ok', KNOBS.ok);
  root.style.setProperty('--selected', KNOBS.selected);
  root.innerHTML = `
    <button type="button" class="knobs-toggle" aria-expanded="false" aria-controls="knobs-body" hidden>${copy.knobsOpen}</button>
    <div class="knobs-transport">
      <div class="row transport">
        <button id="play" type="button">${copy.play}</button>
        <button id="stop" type="button" disabled>${copy.stop}</button>
        <span id="pending" class="pending" hidden>${copy.nextCycle}</span>
        <input id="scrub" type="range" min="0" max="${KNOBS.scrubSteps}" step="1" value="0" disabled aria-label="${copy.scrubLabel}" />
      </div>
      <div class="row sound-status" role="status" hidden>
        <span class="sound-status-text"></span>
        <button id="sound-retry" type="button" hidden>${copy.soundRetry}</button>
      </div>
    </div>
    <div id="knobs-body">
      <form class="knobs">
        <div class="group patterns">
          ${HANDS.map(
            (h) => `
          <div class="pattern-row" data-hand="${h}">
            <label for="hand-${h}">${copy.patternLabel}</label>
            <span class="pattern-field">
              <span class="mirror" aria-hidden="true"></span>
              <input id="hand-${h}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
            </span>
            <span class="indicator" role="img"></span>
          </div>`,
          ).join('')}
          <p class="hint one-hand-hint" hidden>${copy.oneHandHint}</p>
          <div class="row digit-pad" role="group" aria-label="${copy.digitPadLabel}">
            ${PAD_KEYS.map((k) => `<button type="button" class="key" data-key="${k}">${k}</button>`).join('')}
            <button type="button" class="key" data-key="x" aria-label="${copy.crossKeyLabel}">${copy.crossKey}</button>
            <button type="button" class="key" data-key="backspace" aria-label="${copy.backspaceKeyLabel}">${copy.backspaceKey}</button>
          </div>
          <div id="status" aria-live="polite"></div>
          <div class="row fixes" hidden>
            <span>${copy.fixesLabel}</span>
            <span class="fix-buttons"></span>
          </div>
        </div>
        <div class="row ratio">
          <span class="knob-label">${copy.ratioLabel}</span>
          ${RATIO_CHIPS.map(([a, b]) => `<button type="button" class="chip" data-a="${a}" data-b="${b}">${copy.ratioChip(a, b)}</button>`).join('')}
          <span class="steppers">
            ${HANDS.map(
              (h) => `<span class="stepper" data-hand="${h}">
                <button type="button" data-delta="-1" aria-label="${copy.ratioStepLabel(h, false)}">${copy.stepDown}</button>
                <output></output>
                <button type="button" data-delta="1" aria-label="${copy.ratioStepLabel(h, true)}">${copy.stepUp}</button>
              </span>`,
            ).join('<span class="colon">:</span>')}
          </span>
        </div>
        <div class="row tempo">
          <label class="knob-label" for="tempo">${copy.tempoLabel}</label>
          <input id="tempo" type="range" min="${BPM_RANGE.min}" max="${BPM_RANGE.max}" step="1" />
          <input id="bpm" type="number" min="${BPM_RANGE.min}" max="${BPM_RANGE.max}" step="1" aria-label="${copy.tempoLabel}" />
          <span>${copy.bpmUnit}</span>
          <span class="hint tempo-both"></span>
        </div>
        <div class="row swap">
          <button id="swap" type="button" disabled>${copy.swap}</button>
          <span class="hint swap-note">${copy.swapHint}</span>
        </div>
        <p class="hint">${copy.spacePlayPause}</p>
        <div class="row">
          <label class="knob-label" for="volume">${copy.volumeLabel}</label>
          <input id="volume" type="range" min="0" max="1" step="${KNOBS.volumeStep}" />
        </div>
        <div class="row">
          <button id="sound-button" type="button" aria-expanded="false">${copy.soundPanelButton}</button>
          <a href="#about" class="about-link">${copy.aboutLink}</a>
        </div>
      </form>
      <dl class="glossary">
        ${copy.glossary.map((g) => `<dt>${g.term}</dt><dd>${g.text}</dd>`).join('')}
      </dl>
    </div>
  `;

  const $ = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const form = $<HTMLFormElement>('form');
  const body = $<HTMLDivElement>('#knobs-body');
  const foldButton = $<HTMLButtonElement>('.knobs-toggle');
  const rows = HANDS.map((h) => $<HTMLDivElement>(`.pattern-row[data-hand="${h}"]`));
  const labels = rows.map((r) => r.querySelector('label') as HTMLLabelElement);
  const inputs = rows.map((r) => r.querySelector('input') as HTMLInputElement);
  const mirrors = rows.map((r) => r.querySelector('.mirror') as HTMLSpanElement);
  const indicators = rows.map((r) => r.querySelector('.indicator') as HTMLSpanElement);
  const hint = $<HTMLParagraphElement>('.one-hand-hint');
  const status = $<HTMLDivElement>('#status');
  const fixesRow = $<HTMLDivElement>('.fixes');
  const fixButtons = $<HTMLSpanElement>('.fix-buttons');
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('.chip'));
  const steppers = HANDS.map((h) => $<HTMLSpanElement>(`.stepper[data-hand="${h}"]`));
  const tempo = $<HTMLInputElement>('#tempo');
  const bpmInput = $<HTMLInputElement>('#bpm');
  const tempoBoth = $<HTMLSpanElement>('.tempo-both');
  const swapButton = $<HTMLButtonElement>('#swap');
  const swapNote = $<HTMLSpanElement>('.swap-note');
  const playButton = $<HTMLButtonElement>('#play');
  const stopButton = $<HTMLButtonElement>('#stop');
  const pending = $<HTMLSpanElement>('#pending');
  const scrub = $<HTMLInputElement>('#scrub');
  const volume = $<HTMLInputElement>('#volume');
  const soundButton = $<HTMLButtonElement>('#sound-button');
  const soundStatus = $<HTMLDivElement>('.sound-status');
  const soundStatusText = $<HTMLSpanElement>('.sound-status-text');
  const soundRetry = $<HTMLButtonElement>('#sound-retry');

  let analysis: Analysis = analyse(store.get().patterns, store.get().ratio);
  /** The latest valid pattern's schedule; null while the pattern is invalid. */
  let schedule: Schedule | null = null;
  let selection: SiteSelection | null = null;
  let swapFailed = false;
  /** The player state the transport controls show. */
  let shownState: PlayerView['state'] = 'stopped';
  /** Where the digit pad types: the last focused input, and each input's caret (null: the end). */
  let activeHand: Hand = 0;
  const carets: (Caret | null)[] = [null, null];

  // -------------------------------------------------------------------------------------------
  // The fix state
  // -------------------------------------------------------------------------------------------

  /** Each input's text drawn behind it, coloured: warnings, the unreadable character, chosen swap sites. */
  function renderMirrors(state: AppState) {
    HANDS.forEach((h) => {
      const chosen = new Set(selection?.hand === h ? selection.sites : []);
      const mirror = mirrors[h] as HTMLSpanElement;
      mirror.replaceChildren(
        ...pieces(state.patterns[h], warnSites(analysis, h), chosen, badChar(analysis, h)).map((p) => {
          const span = document.createElement('span');
          span.textContent = p.text;
          if (p.site !== null) span.dataset.site = String(p.site);
          span.classList.toggle('warn', p.warn);
          span.classList.toggle('chosen', p.selected);
          return span;
        }),
      );
      mirror.scrollLeft = (inputs[h] as HTMLInputElement).scrollLeft;
    });
    const n = selection?.sites.length ?? 0;
    swapButton.disabled = n !== 2;
    swapNote.textContent = swapFailed ? copy.swapImpossible : n === 0 ? copy.swapHint : copy.swapChosen(n);
  }

  let fixToken = 0;
  let fixTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Fix suggestions can take tens of ms, so they are worked out after typing pauses
   * (`KNOBS.fixDebounceMs`), and a result for text since changed is dropped.
   */
  function scheduleFixes(a: Analysis) {
    const token = ++fixToken;
    clearTimeout(fixTimer);
    fixesRow.hidden = true;
    fixButtons.replaceChildren();
    const input = a.input;
    if (input === null || a.balls !== null) return;
    fixTimer = setTimeout(() => {
      if (token !== fixToken) return;
      const fixes = fixesFor(input, a.details.map((d) => d.error));
      if (token !== fixToken) return;
      showFixes(fixes);
    }, KNOBS.fixDebounceMs);
  }

  function showFixes(fixes: readonly PatternInput[]) {
    fixesRow.hidden = false;
    (fixesRow.firstElementChild as HTMLSpanElement).textContent = fixes.length > 0 ? copy.fixesLabel : copy.fixesNone;
    fixButtons.replaceChildren(
      ...fixes.map((fix) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fix';
        b.textContent = fixLabel(fix);
        // Never applied on its own: only this click changes the pattern.
        b.addEventListener('click', () => {
          store.set({ patterns: fixTexts(fix, store.get().patterns) });
          // The button is gone with the next check; focus returns to the pattern.
          (inputs[0] as HTMLInputElement).focus();
        });
        return b;
      }),
    );
  }

  /** Validates, writes the indicators and status, and hands a valid edit to the player. */
  function check(state: AppState) {
    analysis = analyse(state.patterns, state.ratio);
    HANDS.forEach((h) => {
      const s = handState(analysis, h);
      const indicator = indicators[h] as HTMLSpanElement;
      indicator.dataset.state = s;
      if (s !== 'hidden') {
        indicator.textContent = copy.indicator[s].mark;
        indicator.setAttribute('aria-label', copy.indicator[s].label);
      }
    });
    status.replaceChildren(
      ...statusLines(analysis).map((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        return p;
      }),
    );
    status.classList.toggle('invalid', analysis.balls === null);
    schedule = analysis.balls !== null && analysis.input ? buildSchedule(analysis.input) : null;
    if (schedule) player.setEdit(schedule, state.bpm);
    scheduleFixes(analysis);
    renderMirrors(state);
    sync();
  }

  // -------------------------------------------------------------------------------------------
  // Rendering the store
  // -------------------------------------------------------------------------------------------

  function render(state: AppState, previous: AppState | null) {
    const patternsChanged = !previous || state.patterns !== previous.patterns || state.ratio !== previous.ratio;
    state.patterns.forEach((text, h) => {
      const input = inputs[h] as HTMLInputElement;
      // Only when they differ, so typing keeps its caret.
      if (input.value !== text) {
        input.value = text;
        carets[h] = null;
      }
    });
    const vanilla = isVanilla(state.ratio);
    (rows[1] as HTMLDivElement).hidden = vanilla;
    hint.hidden = vanilla;
    if (vanilla) activeHand = 0;
    (labels[0] as HTMLLabelElement).textContent = vanilla ? copy.patternLabel : copy.handLabel(0);
    (labels[1] as HTMLLabelElement).textContent = copy.handLabel(1);
    for (const chip of chips) {
      // Pressed only for its exact a:b: 2:2 from the steppers is not the 1:1 chip, which still normalises it.
      const on = Number(chip.dataset.a) === state.ratio.a && Number(chip.dataset.b) === state.ratio.b;
      chip.setAttribute('aria-pressed', String(on));
    }
    HANDS.forEach((h) => {
      const stepper = steppers[h] as HTMLSpanElement;
      const value = h === 0 ? state.ratio.a : state.ratio.b;
      (stepper.querySelector('output') as HTMLOutputElement).textContent = String(value);
      (stepper.querySelector('[data-delta="-1"]') as HTMLButtonElement).disabled = value <= 1;
      (stepper.querySelector('[data-delta="1"]') as HTMLButtonElement).disabled = value >= MAX_RATIO;
    });
    tempo.value = String(state.bpm);
    if (document.activeElement !== bpmInput) bpmInput.value = String(state.bpm);
    tempoBoth.textContent = copy.tempoBoth(state.bpm, hand2Bpm(state.bpm, state.ratio), vanilla);
    volume.value = String(state.volume);
    soundButton.setAttribute('aria-expanded', String(state.soundPanelOpen));

    if (patternsChanged) {
      // Sites index the old text; a new text starts the choice over.
      if (previous) {
        selection = null;
        swapFailed = false;
      }
      check(state);
    } else if (state.bpm !== previous?.bpm && schedule) {
      player.setEdit(schedule, state.bpm);
    }
    if (state.volume !== previous?.volume) sound.setMaster(state.volume);
  }

  // -------------------------------------------------------------------------------------------
  // Play, pause, stop, the time slider
  // -------------------------------------------------------------------------------------------

  /** Brings the transport controls in line with the player. Play is disabled while invalid (SPEC §4.2). */
  function sync(state: PlayerView['state'] = player.view().state) {
    const playing = state === 'playing';
    playButton.textContent = playing ? copy.pause : copy.play;
    playButton.disabled = !playing && schedule === null;
    stopButton.disabled = state === 'stopped';
    scrub.disabled = state !== 'paused';
    shownState = state;
  }

  /** Shows whether the samples are loading, in or failed, beside Play; Retry only when failed. */
  function showSoundStatus() {
    const status = sound.status();
    soundStatus.hidden = status === 'idle';
    soundStatus.dataset.state = status;
    soundStatusText.textContent =
      status === 'loading' ? copy.soundLoading : status === 'failed' ? copy.soundFailed : status === 'ready' ? copy.soundReady : '';
    soundRetry.hidden = status !== 'failed';
  }
  sound.subscribe(showSoundStatus);
  soundRetry.addEventListener('click', () => sound.retry());
  showSoundStatus();

  /** Starts from stopped, or resumes from paused; nothing while the pattern is invalid. */
  function start() {
    if (schedule === null) return;
    if (player.view().state === 'paused') player.resume();
    else if (!player.playing()) {
      const { mapping, bpm } = store.get();
      player.play(schedule, mapping, bpm);
    }
    sync();
  }

  function toggle() {
    if (player.playing()) {
      player.pause();
      sync();
    } else start();
  }

  function stop() {
    player.stop();
    sync();
  }

  let scrubbing = false;
  scrub.addEventListener('pointerdown', () => (scrubbing = true));
  window.addEventListener('pointerup', () => (scrubbing = false));
  scrub.addEventListener('input', () => {
    const pos = player.scrubPosition();
    if (pos) player.scrub((Number(scrub.value) / KNOBS.scrubSteps) * pos.cycle);
  });

  playButton.addEventListener('click', toggle);
  stopButton.addEventListener('click', stop);
  // Enter never submits the form (there is no submit button); a pattern input handles it below.
  form.addEventListener('submit', (e) => e.preventDefault());

  // -------------------------------------------------------------------------------------------
  // Pattern inputs, the digit pad, swap
  // -------------------------------------------------------------------------------------------

  const setPattern = (hand: Hand, text: string) => {
    const patterns = [...store.get().patterns] as [string, string];
    patterns[hand] = text;
    store.set({ patterns });
  };

  HANDS.forEach((h) => {
    const input = inputs[h] as HTMLInputElement;
    const mirror = mirrors[h] as HTMLSpanElement;
    /** The selection last turned into a swap site, so `select` and `keyup` choose it once. */
    let chosenRange = '';
    const remember = () => {
      activeHand = h;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      carets[h] = { start, end };
      mirror.scrollLeft = input.scrollLeft;
      // Swap by keyboard: selecting exactly one throw (Shift and an arrow) chooses it.
      const range = `${start}:${end}`;
      if (start === end || range === chosenRange) {
        if (start === end) chosenRange = '';
        return;
      }
      const site = siteCovering(input.value, start, end);
      if (site === null) return;
      chosenRange = range;
      selection = toggleSite(selection, h, site);
      swapFailed = false;
      renderMirrors(store.get());
    };
    input.addEventListener('focus', () => (activeHand = h));
    for (const type of ['select', 'keyup', 'pointerup', 'scroll']) input.addEventListener(type, remember);
    input.addEventListener('input', () => {
      setPattern(h, input.value);
      remember();
    });
    // Enter plays, or resumes; it never pauses.
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      start();
    });
    // A tap on a throw chooses it for Swap (SPEC §4.1): the throw under the pointer, read off
    // the coloured text behind the input.
    input.addEventListener('click', (e) => {
      if (input.selectionStart !== input.selectionEnd) return;
      const hit = Array.from(mirror.querySelectorAll<HTMLSpanElement>('[data-site]')).find((span) => {
        const r = span.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX < r.right;
      });
      if (!hit) return;
      selection = toggleSite(selection, h, Number(hit.dataset.site));
      swapFailed = false;
      renderMirrors(store.get());
    });
  });

  for (const key of root.querySelectorAll<HTMLButtonElement>('.digit-pad .key')) {
    key.addEventListener('click', () => {
      const h = activeHand;
      const text = store.get().patterns[h];
      const end = text.length;
      const edited = editText(text, carets[h] ?? { start: end, end }, key.dataset.key as string);
      setPattern(h, edited.text);
      carets[h] = { start: edited.caret, end: edited.caret };
    });
  }

  swapButton.addEventListener('click', () => {
    if (selection?.sites.length !== 2) return;
    const { hand, sites } = selection;
    const state = store.get();
    const swapped = swapText(state.patterns[hand], sites[0] as number, sites[1] as number, isVanilla(state.ratio));
    if (swapped === null) {
      swapFailed = true;
      renderMirrors(state);
      return;
    }
    setPattern(hand, swapped);
  });

  // -------------------------------------------------------------------------------------------
  // Ratio, tempo, volume, sound panel, phone fold
  // -------------------------------------------------------------------------------------------

  for (const chip of chips) {
    chip.addEventListener('keydown', (e) => {
      // Arrows walk the ratio chips, wrapping, and take focus with them. Space is left alone.
      const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
      const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
      if (!(back || forward) || e.ctrlKey || e.metaKey || e.altKey) return;
      const step = back ? -1 : 1;
      e.preventDefault();
      const target = chips[(chips.indexOf(chip) + step + chips.length) % chips.length] as HTMLButtonElement;
      select(target);
      target.focus();
    });
    chip.addEventListener('click', () => select(chip));
  }
  /** Makes `chip`'s ratio the active one, exactly as written (so 2:2 → 1:1 works). */
  function select(chip: HTMLButtonElement) {
    store.set({ ratio: reduceRatio({ a: Number(chip.dataset.a), b: Number(chip.dataset.b) }) });
  }
  HANDS.forEach((h) => {
    for (const b of (steppers[h] as HTMLSpanElement).querySelectorAll<HTMLButtonElement>('button')) {
      b.addEventListener('click', () => store.set({ ratio: stepRatio(store.get().ratio, h, Number(b.dataset.delta)) }));
    }
  });

  tempo.addEventListener('input', () => store.set({ bpm: Number(tempo.value) }));
  bpmInput.addEventListener('change', () => {
    const bpm = clampBpm(bpmInput.valueAsNumber);
    if (bpm !== null) store.set({ bpm });
    bpmInput.value = String(store.get().bpm);
  });
  volume.addEventListener('input', () => store.set({ volume: Number(volume.value) }));
  soundButton.addEventListener('click', () => store.set({ soundPanelOpen: !store.get().soundPanelOpen }));

  // On a phone the panel folds under a button; the juggler and the ladder stay.
  const phone = window.matchMedia(`(max-width: ${KNOBS.phoneMaxWidthPx}px)`);
  let unfolded = false;
  function fold() {
    foldButton.hidden = !phone.matches;
    body.hidden = phone.matches && !unfolded;
    foldButton.setAttribute('aria-expanded', String(!body.hidden));
    foldButton.textContent = unfolded ? copy.knobsClose : copy.knobsOpen;
  }
  foldButton.addEventListener('click', () => {
    unfolded = !unfolded;
    fold();
  });
  phone.addEventListener('change', fold);
  fold();

  // -------------------------------------------------------------------------------------------
  // Space
  // -------------------------------------------------------------------------------------------

  // Space plays and pauses, wherever focus is. Captured before a focused control sees it, so a
  // button does not activate (a ratio chip clicked earlier keeps focus); buttons activate on
  // keyup in some browsers, so that is suppressed too. Exempt: a pattern text input, where
  // Space types a space (the separator at other ratios than 1:1), and any control inside
  // `[data-keeps-space]`.
  const isSpace = (e: KeyboardEvent) =>
    e.code === 'Space' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.isComposing &&
    !(e.target instanceof Element && e.target.closest('.pattern-field, [data-keeps-space]'));
  document.addEventListener(
    'keydown',
    (e) => {
      if (!isSpace(e)) return;
      e.preventDefault();
      if (!e.repeat) toggle();
    },
    { capture: true },
  );
  document.addEventListener(
    'keyup',
    (e) => {
      if (isSpace(e)) e.preventDefault();
    },
    { capture: true },
  );

  store.subscribe((state, previous) => render(state, previous));
  render(store.get(), null);

  return {
    draw(view) {
      if (view.state !== shownState) sync(view.state);
      pending.hidden = !view.pending;
      if (scrubbing && view.state === 'paused') return;
      const pos = view.state === 'paused' ? player.scrubPosition() : view.state === 'playing' ? cyclePosition(view) : null;
      const value = pos ? Math.round((pos.pulse / pos.cycle) * KNOBS.scrubSteps) : 0;
      if (scrub.value !== String(value)) scrub.value = String(value);
    },
  };
};
