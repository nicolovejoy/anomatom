// The knob panel (SPEC §4.1) and the fix state (SPEC §4.2), laid out in the sheet
// (docs/plans/phone-sheet.md): the sheet's head (the summary that opens the Pattern tab, Play,
// and Stop with the time slider while paused), the Pattern tab and the Rhythm tab. Its root is
// the sheet; it fills the slots main.ts lays out. The knobs write to the store; the store is the
// one source of truth for pattern text, ratio, tempo and volume, and this panel re-reads it on
// every change (an edit here, or a restored share link). The logic is in knobs-model.ts and
// sheet-model.ts; this file is elements and events.
//
// Space toggles play from anywhere (one capturing handler, at the bottom), with two
// exemptions: a pattern text input, where Space types the space that separates throws at other
// ratios than 1:1; and any control inside `[data-keeps-space]` (a select, say). Range sliders
// do not use Space, so they need no exemption.
import { buildSchedule, fixesFor, isVanilla, reduceRatio } from '../core/legacy';
import type { Hand, PatternInput, Schedule } from '../core/legacy';
import { BPM_RANGE, KNOBS, MAX_RATIO, RATIO_CHIPS, SHEET } from '../tunables';
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
import { fillPercent, hasChip, summary, tempoLines } from './sheet-model';
import type { AppState } from './state';
import './knobs.css';

const HANDS = [0, 1] as const;
/** The pad in the order it is laid out, four to a row. */
const PAD_KEYS = ['1', '2', '3', 'backspace', '4', '5', '6', 'x', '7', '8', '9', '0'];

export const mountKnobs: Mount = (root, { store, player, sound }) => {
  const slot = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  root.style.setProperty('--selected', KNOBS.selected);
  slot<HTMLDivElement>('.sheet-head').innerHTML = `
    <div class="head-row">
      <button type="button" class="summary" aria-controls="panel-pattern">
        <span class="summary-text"></span>
        <span class="summary-side">
          <span class="summary-meta"></span>
          <span id="pending" class="pending" hidden>${copy.nextCycle}</span>
        </span>
      </button>
      <button id="play" type="button" class="play">
        <svg class="icon-play" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>
        <svg class="icon-pause" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" fill="currentColor"/><rect x="14" y="4" width="5" height="16" fill="currentColor"/></svg>
        <span class="sr-only play-label">${copy.play}</span>
      </button>
    </div>
    <div class="row paused-row" hidden>
      <button id="stop" type="button" disabled>${copy.stop}</button>
      <input id="scrub" class="slider" type="range" min="0" max="${KNOBS.scrubSteps}" step="1" value="0" disabled aria-label="${copy.scrubLabel}" />
    </div>
    <div class="row sound-status">
      <span class="sound-status-text" role="status"></span>
      <button id="sound-retry" type="button" hidden>${copy.soundRetry}</button>
    </div>
  `;
  slot<HTMLDivElement>('#panel-pattern').innerHTML = `
    <form class="knobs knobs-pattern">
      ${HANDS.map(
        (h) => `
      <div class="pattern-row" data-hand="${h}">
        <label class="section-label" for="hand-${h}">${copy.patternLabel}</label>
        <div class="pattern-box">
          <span class="pattern-field">
            <span class="mirror" aria-hidden="true"></span>
            <input id="hand-${h}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
          </span>
          <span class="indicator" role="img"></span>
        </div>
      </div>`,
      ).join('')}
      <p class="hint one-hand-hint" hidden>${copy.oneHandHint}</p>
      <div id="status" aria-live="polite"></div>
      <div class="fixes" hidden>
        <p class="fixes-label"></p>
        <div class="fix-buttons"></div>
      </div>
      <div class="digit-pad" role="group" aria-label="${copy.digitPadLabel}">
        ${PAD_KEYS.map((k) => {
          if (k === 'x') return `<button type="button" class="key key-op" data-key="x" aria-label="${copy.crossKeyLabel}">${copy.crossKey}</button>`;
          if (k === 'backspace')
            return `<button type="button" class="key key-op" data-key="backspace" aria-label="${copy.backspaceKeyLabel}">${copy.backspaceKey}</button>`;
          return `<button type="button" class="key" data-key="${k}">${k}</button>`;
        }).join('')}
      </div>
      <div class="row swap">
        <button id="swap" type="button" disabled>${copy.swap}</button>
        <span class="hint swap-note">${copy.swapHint}</span>
      </div>
      <p class="hint space-hint">${copy.spacePlayPause}</p>
      <dl class="glossary">
        ${copy.glossary.map((g) => `<dt>${g.term}</dt><dd>${g.text}</dd>`).join('')}
      </dl>
    </form>
  `;
  slot<HTMLDivElement>('#panel-rhythm').innerHTML = `
    <form class="knobs knobs-rhythm">
      <div class="group">
        <div class="section-label" id="ratio-label">${copy.handsHeadingRhythm}</div>
        <div class="ratio-chips" role="group" aria-labelledby="ratio-label">
          ${RATIO_CHIPS.map(([a, b]) => `<button type="button" class="chip" data-a="${a}" data-b="${b}">${copy.ratioChip(a, b)}</button>`).join('')}
          <button type="button" class="chip-more" aria-expanded="false" aria-controls="ratio-steppers" aria-label="${copy.ratioMoreLabel}">${copy.ratioMore}</button>
        </div>
        <div class="steppers" id="ratio-steppers" hidden>
          ${HANDS.map(
            (h) => `<span class="stepper" data-hand="${h}">
              <button type="button" data-delta="-1" aria-label="${copy.ratioStepLabel(h, false)}">${copy.stepDown}</button>
              <output></output>
              <button type="button" data-delta="1" aria-label="${copy.ratioStepLabel(h, true)}">${copy.stepUp}</button>
            </span>`,
          ).join('<span class="colon">:</span>')}
        </div>
      </div>
      <div class="group tempo">
        <div class="tempo-head">
          <label class="section-label" for="bpm">${copy.tempoLabel}</label>
          <span class="bpm-readout"><input id="bpm" type="number" inputmode="numeric" min="${BPM_RANGE.min}" max="${BPM_RANGE.max}" step="1" /><span class="unit">${copy.bpmUnit}</span></span>
        </div>
        <input id="tempo" class="slider" type="range" min="${BPM_RANGE.min}" max="${BPM_RANGE.max}" step="1" aria-label="${copy.tempoLabel}" />
        <div class="tempo-hands" aria-hidden="true"><span></span><span></span></div>
        <p class="sr-only tempo-both"></p>
      </div>
      <div class="group">
        <label class="section-label" for="volume">${copy.volumeLabel}</label>
        <input id="volume" class="slider" type="range" min="0" max="1" step="${KNOBS.volumeStep}" />
      </div>
    </form>
  `;

  const $ = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const forms = Array.from(root.querySelectorAll<HTMLFormElement>('form.knobs'));
  const patternForm = $<HTMLFormElement>('.knobs-pattern');
  const summaryButton = $<HTMLButtonElement>('.summary');
  const summaryText = $<HTMLSpanElement>('.summary-text');
  const summaryMeta = $<HTMLSpanElement>('.summary-meta');
  const rows = HANDS.map((h) => $<HTMLDivElement>(`.pattern-row[data-hand="${h}"]`));
  const labels = rows.map((r) => r.querySelector('label') as HTMLLabelElement);
  const inputs = rows.map((r) => r.querySelector('input') as HTMLInputElement);
  const mirrors = rows.map((r) => r.querySelector('.mirror') as HTMLSpanElement);
  const indicators = rows.map((r) => r.querySelector('.indicator') as HTMLSpanElement);
  const hint = $<HTMLParagraphElement>('.one-hand-hint');
  const status = $<HTMLDivElement>('#status');
  const fixesRow = $<HTMLDivElement>('.fixes');
  const fixesLabel = $<HTMLParagraphElement>('.fixes-label');
  const fixButtons = $<HTMLDivElement>('.fix-buttons');
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('.chip'));
  const moreButton = $<HTMLButtonElement>('.chip-more');
  const steppersBox = $<HTMLDivElement>('#ratio-steppers');
  const steppers = HANDS.map((h) => $<HTMLSpanElement>(`.stepper[data-hand="${h}"]`));
  const tempo = $<HTMLInputElement>('#tempo');
  const bpmInput = $<HTMLInputElement>('#bpm');
  const tempoHands = Array.from(root.querySelectorAll<HTMLSpanElement>('.tempo-hands span'));
  const tempoBoth = $<HTMLParagraphElement>('.tempo-both');
  const swapButton = $<HTMLButtonElement>('#swap');
  const swapNote = $<HTMLSpanElement>('.swap-note');
  const playButton = $<HTMLButtonElement>('#play');
  const playLabel = $<HTMLSpanElement>('.play-label');
  const stopButton = $<HTMLButtonElement>('#stop');
  const pausedRow = $<HTMLDivElement>('.paused-row');
  const pending = $<HTMLSpanElement>('#pending');
  const scrub = $<HTMLInputElement>('#scrub');
  const volume = $<HTMLInputElement>('#volume');
  const soundStatus = $<HTMLDivElement>('.sound-status');
  const soundStatusText = $<HTMLSpanElement>('.sound-status-text');
  const soundRetry = $<HTMLButtonElement>('#sound-retry');
  /** Steppers stay open once More is pressed, and show on their own for a ratio with no chip. */
  let moreOpen = false;

  /** The filled part of a slider's track (style.css draws it from --fill). */
  const fill = (slider: HTMLInputElement) =>
    slider.style.setProperty('--fill', `${fillPercent(Number(slider.value), Number(slider.min), Number(slider.max))}%`);

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
    fixesLabel.textContent = fixes.length > 0 ? copy.fixesLabel : copy.fixesNone;
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
    rows.forEach((row, h) => row.classList.toggle('bad', handState(analysis, h as Hand) === 'bad'));
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
    patternForm.classList.toggle('two-hands', !vanilla);
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
    const steppersShown = moreOpen || !hasChip(state.ratio, RATIO_CHIPS);
    steppersBox.hidden = !steppersShown;
    moreButton.setAttribute('aria-expanded', String(steppersShown));
    HANDS.forEach((h) => {
      const stepper = steppers[h] as HTMLSpanElement;
      const value = h === 0 ? state.ratio.a : state.ratio.b;
      (stepper.querySelector('output') as HTMLOutputElement).textContent = String(value);
      (stepper.querySelector('[data-delta="-1"]') as HTMLButtonElement).disabled = value <= 1;
      (stepper.querySelector('[data-delta="1"]') as HTMLButtonElement).disabled = value >= MAX_RATIO;
    });
    tempo.value = String(state.bpm);
    fill(tempo);
    if (document.activeElement !== bpmInput) bpmInput.value = String(state.bpm);
    tempoBoth.textContent = copy.tempoBoth(state.bpm, hand2Bpm(state.bpm, state.ratio), vanilla);
    tempoLines(state.bpm, state.ratio).forEach((line, i) => ((tempoHands[i] as HTMLSpanElement).textContent = line));
    volume.value = String(state.volume);
    fill(volume);

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
    const sum = summary(analysis, state.patterns, state.bpm, SHEET.longSummaryChars);
    summaryText.textContent = sum.text;
    summaryMeta.textContent = sum.meta;
    summaryButton.classList.toggle('long', sum.long);
    summaryButton.classList.toggle('invalid', !sum.valid);
    if (state.volume !== previous?.volume) sound.setMaster(state.volume);
  }

  // -------------------------------------------------------------------------------------------
  // Play, pause, stop, the time slider
  // -------------------------------------------------------------------------------------------

  /** Brings the transport controls in line with the player. Play is disabled while invalid (SPEC §4.2). */
  function sync(state: PlayerView['state'] = player.view().state) {
    const playing = state === 'playing';
    playLabel.textContent = playing ? copy.pause : copy.play;
    playButton.dataset.state = state;
    playButton.disabled = !playing && schedule === null;
    stopButton.disabled = state === 'stopped';
    scrub.disabled = state !== 'paused';
    // Stop and the time slider are for a paused cycle; playing, the sheet stays as small as it can.
    pausedRow.hidden = state !== 'paused';
    shownState = state;
  }

  /** Shows whether the samples are loading, in or failed, beside Play; Retry only when failed. */
  function showSoundStatus() {
    const status = sound.status();
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
    fill(scrub);
    const pos = player.scrubPosition();
    if (pos) player.scrub((Number(scrub.value) / KNOBS.scrubSteps) * pos.cycle);
  });

  playButton.addEventListener('click', toggle);
  stopButton.addEventListener('click', stop);
  // Enter never submits the form (there is no submit button); a pattern input handles it below.
  for (const form of forms) form.addEventListener('submit', (e) => e.preventDefault());
  summaryButton.addEventListener('click', () => store.set({ sheetTab: 'pattern' }));

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
  // Ratio, tempo, volume
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

  moreButton.addEventListener('click', () => {
    moreOpen = !moreOpen;
    render(store.get(), store.get());
  });

  tempo.addEventListener('input', () => store.set({ bpm: Number(tempo.value) }));
  /** The tempo box commits on change and on Enter, and always shows the tempo in force after. */
  const commitBpm = () => {
    const bpm = clampBpm(bpmInput.valueAsNumber);
    if (bpm !== null) store.set({ bpm });
    bpmInput.value = String(store.get().bpm);
  };
  bpmInput.addEventListener('change', commitBpm);
  bpmInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    commitBpm();
  });
  volume.addEventListener('input', () => store.set({ volume: Number(volume.value) }));

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
      if (scrub.value !== String(value)) {
        scrub.value = String(value);
        fill(scrub);
      }
    },
  };
};
