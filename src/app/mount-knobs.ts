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
import type { Schedule } from '../core';
import { BPM_RANGE, KNOBS, MAX_RATIO, RATIO_CHIPS, SHEET } from '../tunables';
import { copy } from '../ui/copy';
import type { PlayerView } from '../view/types';
import { oneInput, type Action } from './actions';
import { derived } from './derived';
import {
  analyse,
  badChar,
  ballsAction,
  clampBpm,
  cyclePosition,
  cycleSamples,
  draftAction,
  editChanged,
  editText,
  fixActions,
  fixLabel,
  hand2Bpm,
  handState,
  hitsAction,
  inputText,
  joinAction,
  phaseAction,
  pieces,
  reduceRatio,
  rhythmRows,
  siteCovering,
  splitInputs,
  statusLines,
  stepRatio,
  swapAction,
  toggleSite,
  warnSites,
  type Analysis,
  type Caret,
  type HandRhythm,
  type SiteSelection,
} from './knobs-model';
import type { Mount } from './mount';
import { fillPercent, hasChip, summary, tempoLines } from './sheet-model';
import type { AppState } from './state';
import './knobs.css';

const HANDS = [0, 1] as const;
type Hand = (typeof HANDS)[number];
/** The pad in the order it is laid out, four to a row. */
const PAD_KEYS = ['1', '2', '3', 'backspace', '4', '5', '6', 'x', '7', '8', '9', '0'];
/** The Rhythm tab's steppers per hand (design §14 option b), top to bottom. */
const RHYTHM_KINDS = ['phase', 'balls', 'hits'] as const;
type RhythmKind = (typeof RHYTHM_KINDS)[number];
const RHYTHM_LABELS: Record<RhythmKind, string> = { phase: copy.phaseLabel, balls: copy.ballsLabel, hits: copy.hitsLabel };
const RHYTHM_STEP_LABELS: Record<RhythmKind, (hand: number, up: boolean) => string> = {
  phase: copy.phaseStepLabel,
  balls: copy.ballsStepLabel,
  hits: copy.hitsStepLabel,
};
const RHYTHM_ACTIONS: Record<RhythmKind, (row: HandRhythm, delta: number) => Action | null> = {
  phase: phaseAction,
  balls: ballsAction,
  hits: hitsAction,
};

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
      <section class="fixes" hidden aria-labelledby="fixes-heading">
        <h3 class="section-label fixes-heading" id="fixes-heading">${copy.fixesHeading}</h3>
        <p class="hint">${copy.fixesOptional}</p>
        <p class="fixes-label"></p>
        <div class="fix-buttons"></div>
      </section>
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
        <div class="rhythm-grid">
          ${HANDS.map((h) => `<span class="rh-hand" data-hand="${h}" style="grid-area: 1 / ${h + 2}">${copy.rhythmHand(h)}</span>`).join('')}
          ${RHYTHM_KINDS.map(
            (kind, k) => `
          <span class="rh-label" style="grid-area: ${k + 2} / 1">${RHYTHM_LABELS[kind]}</span>
          ${HANDS.map(
            (h) => `
          <span class="rstep" data-kind="${kind}" data-hand="${h}" style="grid-area: ${k + 2} / ${h + 2}">
            <button type="button" data-delta="-1" aria-label="${RHYTHM_STEP_LABELS[kind](h, false)}">${copy.stepDown}</button>
            <output aria-live="polite"></output>
            <button type="button" data-delta="1" aria-label="${RHYTHM_STEP_LABELS[kind](h, true)}">${copy.stepUp}</button>
          </span>${
            kind === 'balls'
              ? `
          <span class="group-balls" data-hand="${h}" style="grid-area: ${k + 2} / ${h + 2}" hidden>
            <span class="group-count"></span>
            <button type="button" class="reset-group">${copy.resetGroup}</button>
          </span>`
              : ''
          }`,
          ).join('')}`,
          ).join('')}
        </div>
        <p class="hint rhythm-hint">${copy.rhythmHint}</p>
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

  let analysis: Analysis = analyse(store.get());
  /** The store's schedule: there always is one, juggleable or not (design §6). */
  let schedule: Schedule = store.derived().schedule;
  let selection: SiteSelection | null = null;
  let swapFailed = false;
  /** The player state the transport controls show. */
  let shownState: PlayerView['state'] = 'stopped';
  /** Where the digit pad types: the last focused input, and each input's caret (null: the end). */
  let activeHand: Hand = 0;
  /** At 1:1, the inputs were split by a `/` typed in this session (so Backspace may join them back). */
  let typedSplit = false;
  const carets: (Caret | null)[] = [null, null];

  // -------------------------------------------------------------------------------------------
  // The fix state
  // -------------------------------------------------------------------------------------------

  /** Each input's text drawn behind it, coloured: warnings, the unreadable character, chosen swap sites. */
  function renderMirrors() {
    HANDS.forEach((h) => {
      const chosen = new Set(selection?.hand === h ? selection.sites : []);
      const mirror = mirrors[h] as HTMLSpanElement;
      mirror.replaceChildren(
        ...pieces(analysis.inputs[h] ?? '', warnSites(analysis, h), chosen, badChar(analysis, h)).map((p) => {
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
  function scheduleFixes(a: Analysis, state: AppState) {
    const token = ++fixToken;
    clearTimeout(fixTimer);
    fixesRow.hidden = true;
    fixButtons.replaceChildren();
    if (!a.fixable) return;
    fixTimer = setTimeout(() => {
      if (token !== fixToken) return;
      // The search runs on first read of `fixTexts`, here, off the keystroke.
      const fixes = derived(state).fixTexts;
      if (token !== fixToken) return;
      showFixes(fixes);
    }, KNOBS.fixDebounceMs);
  }

  function showFixes(fixes: readonly (readonly string[])[]) {
    fixesRow.hidden = false;
    fixesLabel.textContent = fixes.length > 0 ? copy.fixesLabel : copy.fixesNone;
    fixButtons.replaceChildren(
      ...fixes.map((texts) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fix';
        b.textContent = fixLabel(texts);
        // Never applied on its own: only this click changes the pattern.
        b.addEventListener('click', () => {
          for (const action of fixActions(store.get(), texts)) store.dispatch(action);
          // The button is gone with the next check; focus returns to the pattern.
          (inputs[0] as HTMLInputElement).focus();
        });
        return b;
      }),
    );
  }

  /** Judges, writes the indicators and status, and hands the edit to the player, juggleable or not. */
  function check(state: AppState) {
    analysis = analyse(state);
    HANDS.forEach((h) => {
      const s = handState(analysis, h);
      const indicator = indicators[h] as HTMLSpanElement;
      indicator.dataset.state = s;
      if (s !== 'hidden') {
        indicator.textContent = copy.indicator[s].mark;
        indicator.setAttribute('aria-label', copy.indicator[s].label);
      }
    });
    const lines = statusLines(analysis);
    status.replaceChildren(
      ...lines.map((line, i) => {
        const p = document.createElement('p');
        p.textContent = line;
        // The notice is the last line, news rather than a fault: drawn muted.
        if (analysis.notice !== null && i === lines.length - 1) p.className = 'notice';
        return p;
      }),
    );
    status.classList.toggle('invalid', analysis.balls === null);
    rows.forEach((row, h) => row.classList.toggle('bad', handState(analysis, h) === 'bad'));
    scheduleFixes(analysis, state);
    renderMirrors();
    sync();
  }

  // -------------------------------------------------------------------------------------------
  // Rendering the store
  // -------------------------------------------------------------------------------------------

  const rhythmHands = HANDS.map((h) => $<HTMLSpanElement>(`.rh-hand[data-hand="${h}"]`));
  const rsteps = HANDS.map((h) =>
    Object.fromEntries(RHYTHM_KINDS.map((kind) => [kind, $<HTMLSpanElement>(`.rstep[data-kind="${kind}"][data-hand="${h}"]`)])) as Record<
      RhythmKind,
      HTMLSpanElement
    >,
  );
  const groupCells = HANDS.map((h) => $<HTMLSpanElement>(`.group-balls[data-hand="${h}"]`));

  /** The Rhythm tab's columns, one per hand: phase over the cycle, balls (or a manual group's count and Reset), hits. */
  function renderRhythm(state: AppState) {
    const rhythm = rhythmRows(state, derived(state));
    HANDS.forEach((h) => {
      const row = rhythm[h];
      (rhythmHands[h] as HTMLSpanElement).hidden = row === undefined;
      const cells = rsteps[h] as Record<RhythmKind, HTMLSpanElement>;
      const group = groupCells[h] as HTMLSpanElement;
      for (const kind of RHYTHM_KINDS) {
        const cell = cells[kind];
        cell.hidden = row === undefined || (kind === 'balls' && row.k === null);
        if (row === undefined || cell.hidden) continue;
        const out = cell.querySelector('output') as HTMLOutputElement;
        if (kind === 'phase') {
          out.innerHTML = '';
          const value = document.createElement('span');
          value.className = 'rv';
          value.textContent = String(row.phase);
          const of = document.createElement('span');
          of.className = 'rof';
          of.textContent = copy.phaseCycle(row.cycle);
          out.append(value, of);
          out.setAttribute('aria-label', copy.phaseReadoutLabel(h, row.phase, row.cycle));
          out.dataset.phase = String(row.phase);
          out.dataset.cycle = String(row.cycle);
        } else out.textContent = String(kind === 'balls' ? row.k : row.hits);
        const [down, up] = cell.querySelectorAll('button');
        (down as HTMLButtonElement).disabled = RHYTHM_ACTIONS[kind](row, -1) === null;
        (up as HTMLButtonElement).disabled = RHYTHM_ACTIONS[kind](row, 1) === null;
      }
      // A manual group: one count for the group, spanning both columns when it holds both hands.
      const g = row?.group ?? null;
      group.hidden = g === null || g.parts[0] !== h;
      if (g === null || group.hidden) return;
      group.style.gridColumn = g.parts.length > 1 ? `${h + 2} / span ${g.parts.length}` : `${h + 2}`;
      (group.querySelector('.group-count') as HTMLSpanElement).textContent = copy.groupBalls(g.balls, g.parts.length);
      (group.querySelector('.reset-group') as HTMLButtonElement).setAttribute('aria-label', copy.resetGroupLabel(g.parts));
    });
  }

  function render(state: AppState, previous: AppState | null) {
    const patternsChanged =
      !previous ||
      state.parts !== previous.parts ||
      state.drafts !== previous.drafts ||
      state.ratio !== previous.ratio ||
      state.notice !== previous.notice;
    const vanilla = oneInput(state.ratio);
    // At 1:1, `a / b` shows as two inputs (form 2); a vanilla siteswap as one.
    const two = !vanilla || splitInputs(state);
    // A split typed here lasts while the pattern stays split.
    if (!two) typedSplit = false;
    HANDS.forEach((h) => {
      const text = !two && h > 0 ? '' : inputText(state, derived(state), h);
      const input = inputs[h] as HTMLInputElement;
      // Only when they differ, so typing keeps its caret.
      if (input.value !== text) {
        input.value = text;
        carets[h] = null;
      }
    });
    patternForm.classList.toggle('two-hands', two);
    (rows[1] as HTMLDivElement).hidden = !two;
    hint.hidden = vanilla;
    if (!two) activeHand = 0;
    (labels[0] as HTMLLabelElement).textContent = two ? copy.handLabel(0) : copy.patternLabel;
    renderRhythm(state);
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
    }
    // The player hears a new schedule, tempo or ratio, whatever else changed with it.
    schedule = derived(state).schedule;
    if (editChanged(previous, state)) player.setEdit(schedule, state.bpm);
    // Test hook: what one cycle sounds like, so a browser test can see the ball knob leave it alone.
    if (!previous || schedule !== derived(previous).schedule || state.mapping !== previous.mapping) {
      root.dataset.cycleSamples = cycleSamples(schedule, state.mapping);
    }
    const sum = summary(analysis, state.bpm, SHEET.longSummaryChars);
    summaryText.textContent = sum.text;
    summaryMeta.textContent = sum.meta;
    summaryButton.classList.toggle('long', sum.long);
    summaryButton.classList.toggle('invalid', !sum.valid);
    if (state.volume !== previous?.volume) sound.setMaster(state.volume);
  }

  // -------------------------------------------------------------------------------------------
  // Play, pause, stop, the time slider
  // -------------------------------------------------------------------------------------------

  /** Brings the transport controls in line with the player. Play is never disabled: a pattern I can't juggle still sounds (design §6). */
  function sync(state: PlayerView['state'] = player.view().state) {
    const playing = state === 'playing';
    playLabel.textContent = playing ? copy.pause : copy.play;
    playButton.dataset.state = state;
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

  /** Starts from stopped, or resumes from paused. */
  function start() {
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

  /** Typing in one input: at 1:1 with two inputs, both are joined into the one draft (`a / b`). */
  const setPattern = (hand: Hand, text: string) => store.dispatch(draftAction(store.get(), store.derived(), hand, text));

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
      renderMirrors();
    };
    input.addEventListener('focus', () => (activeHand = h));
    for (const type of ['select', 'keyup', 'pointerup', 'scroll']) input.addEventListener(type, remember);
    input.addEventListener('input', () => {
      const wasSplit = splitInputs(store.get());
      setPattern(h, input.value);
      remember();
      // A `/` typed at 1:1 splits the pattern in two inputs: typing goes on in hand 2's.
      if (h === 0 && !wasSplit && splitInputs(store.get())) {
        typedSplit = true;
        const next = inputs[1] as HTMLInputElement;
        next.focus();
        next.setSelectionRange(0, 0);
      }
    });
    // Enter plays, or resumes; it never pauses.
    input.addEventListener('keydown', (e) => {
      // Backspace in an empty hand 2 at 1:1 joins the pattern back into one input, when that
      // changes no grid (`joinAction`).
      const join = h === 1 && e.key === 'Backspace' && input.value === '' ? joinAction(store.get(), store.derived(), typedSplit) : null;
      if (join) {
        e.preventDefault();
        const first = inputs[0] as HTMLInputElement;
        store.dispatch(join);
        first.focus();
        first.setSelectionRange(first.value.length, first.value.length);
        return;
      }
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
      renderMirrors();
    });
  });

  for (const key of root.querySelectorAll<HTMLButtonElement>('.digit-pad .key')) {
    key.addEventListener('click', () => {
      const h = activeHand;
      const text = inputText(store.get(), store.derived(), h);
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
    const action = swapAction(state, hand, sites[0] as number, sites[1] as number);
    if (action !== null) store.dispatch(action);
    // A swap that cannot be made changes nothing.
    if (store.get().parts === state.parts) {
      swapFailed = true;
      renderMirrors();
    }
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
    store.dispatch({ type: 'setRatio', ratio: reduceRatio({ a: Number(chip.dataset.a), b: Number(chip.dataset.b) }) });
  }
  HANDS.forEach((h) => {
    for (const b of (steppers[h] as HTMLSpanElement).querySelectorAll<HTMLButtonElement>('button')) {
      b.addEventListener('click', () =>
        store.dispatch({ type: 'setRatio', ratio: stepRatio(store.get().ratio, h, Number(b.dataset.delta)) }),
      );
    }
  });

  // Phase, balls and hits per hand; Reset on a manual group.
  HANDS.forEach((h) => {
    for (const kind of RHYTHM_KINDS) {
      for (const b of (rsteps[h] as Record<RhythmKind, HTMLSpanElement>)[kind].querySelectorAll<HTMLButtonElement>('button')) {
        b.addEventListener('click', () => {
          const row = rhythmRows(store.get(), store.derived())[h];
          const action = row ? RHYTHM_ACTIONS[kind](row, Number(b.dataset.delta)) : null;
          if (action) store.dispatch(action);
        });
      }
    }
    (groupCells[h] as HTMLSpanElement)
      .querySelector('.reset-group')
      ?.addEventListener('click', () => store.dispatch({ type: 'resetGroup', part: h }));
  });

  moreButton.addEventListener('click', () => {
    moreOpen = !moreOpen;
    render(store.get(), store.get());
  });

  tempo.addEventListener('input', () => store.dispatch({ type: 'setBpm', bpm: Number(tempo.value) }));
  /** The tempo box commits on change and on Enter, and always shows the tempo in force after. */
  const commitBpm = () => {
    const bpm = clampBpm(bpmInput.valueAsNumber);
    if (bpm !== null) store.dispatch({ type: 'setBpm', bpm });
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
