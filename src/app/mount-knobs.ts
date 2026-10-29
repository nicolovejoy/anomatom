// The knob panel (SPEC §4.1): pattern inputs, ratio chips, play and stop, the status line, and
// Space. The knobs write to the store; the store is the one source of truth for pattern text,
// ratio and tempo, and this panel re-reads it on every change (an edit here, or later a
// restored share link).
import { buildSchedule, isVanilla, parsePattern, reduceRatio, validate } from '../core';
import type { HandPattern, Schedule } from '../core';
import { RATIO_CHIPS } from '../tunables';
import { copy } from '../ui/copy';
import type { Mount } from './mount';
import type { AppState } from './state';
import './knobs.css';

export const mountKnobs: Mount = (root, { store, player }) => {
  root.innerHTML = `
    <form class="knobs">
      <div class="row">
        <span>${copy.ratioLabel}</span>
        ${RATIO_CHIPS.map(([a, b]) => `<button type="button" class="chip" data-a="${a}" data-b="${b}">${copy.ratioChip(a, b)}</button>`).join('')}
      </div>
      <div class="row">
        <label>${copy.patternLabel} <input id="hand-0" autocomplete="off" /></label>
        <label hidden>${copy.handLabel(1)} <input id="hand-1" autocomplete="off" /></label>
      </div>
      <p class="hint" hidden>${copy.oneHandHint}</p>
      <div class="row">
        <button id="play" type="submit">${copy.play}</button>
        <button id="stop" type="button" disabled>${copy.stop}</button>
        <span class="hint">${copy.spaceHint}</span>
      </div>
    </form>
    <p id="status" aria-live="polite"></p>
    <dl class="glossary">
      ${copy.glossary.map((g) => `<dt>${g.term}</dt><dd>${g.text}</dd>`).join('')}
    </dl>
  `;

  const form = root.querySelector('form') as HTMLFormElement;
  const inputs = [0, 1].map((h) => root.querySelector(`#hand-${h}`) as HTMLInputElement);
  const [label0, label1] = inputs.map((input) => input.parentElement as HTMLLabelElement) as [
    HTMLLabelElement,
    HTMLLabelElement,
  ];
  const hint = root.querySelector('p.hint') as HTMLParagraphElement;
  const stopButton = root.querySelector('#stop') as HTMLButtonElement;
  const status = root.querySelector('#status') as HTMLParagraphElement;
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('.chip'));

  /** Validates the store's pattern, writes the status line, and hands a valid edit to the player. */
  function check(state: AppState = store.get()): Schedule | null {
    const { ratio } = state;
    const vanilla = isVanilla(ratio);
    const hands: HandPattern[] = [];
    for (const text of vanilla ? state.patterns.slice(0, 1) : state.patterns) {
      const parsed = parsePattern(text);
      if (!parsed.ok) {
        status.textContent = copy.parseError(parsed.error);
        return null;
      }
      hands.push(parsed.pattern);
    }
    const pattern = { ratio, hands };
    const v = validate(pattern);
    if (!v.ok) {
      status.textContent = copy.validationError(v.errors[0]!, vanilla);
      return null;
    }
    status.textContent = copy.valid(v.balls);
    const schedule = buildSchedule(pattern);
    player.setEdit(schedule, state.bpm);
    return schedule;
  }

  /** Brings every control in line with the store, then re-validates. */
  function render(state: AppState) {
    state.patterns.forEach((text, h) => {
      const input = inputs[h] as HTMLInputElement;
      // Only when they differ, so typing keeps its caret.
      if (input.value !== text) input.value = text;
    });
    const vanilla = isVanilla(state.ratio);
    label1.hidden = vanilla;
    hint.hidden = vanilla;
    (label0.firstChild as Text).textContent = `${vanilla ? copy.patternLabel : copy.handLabel(0)} `;
    for (const chip of chips) {
      const on = Number(chip.dataset.a) === state.ratio.a && Number(chip.dataset.b) === state.ratio.b;
      chip.setAttribute('aria-pressed', String(on));
    }
    check(state);
  }

  function play() {
    const s = check();
    if (!s) return;
    const { mapping, bpm } = store.get();
    player.play(s, mapping, bpm);
    stopButton.disabled = false;
  }

  function stop() {
    player.stop();
    stopButton.disabled = true;
  }

  function toggle() {
    if (player.playing()) stop();
    else play();
  }

  store.subscribe((state, previous) => {
    if (state.patterns !== previous.patterns || state.ratio !== previous.ratio || state.bpm !== previous.bpm) {
      render(state);
    }
  });
  for (const input of inputs) {
    input.addEventListener('input', () => {
      store.set({ patterns: [(inputs[0] as HTMLInputElement).value, (inputs[1] as HTMLInputElement).value] });
    });
  }
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
  /** Makes `chip`'s ratio the active one; the chip already active changes nothing. */
  function select(chip: HTMLButtonElement) {
    if (chip.getAttribute('aria-pressed') === 'true') return;
    store.set({ ratio: reduceRatio({ a: Number(chip.dataset.a), b: Number(chip.dataset.b) }) });
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    play();
  });
  stopButton.addEventListener('click', stop);
  // Space always plays and stops, wherever focus is. Captured before a focused button or input
  // sees it: a button would otherwise activate (a ratio chip clicked earlier keeps focus), and
  // an input would get a space, which the parser ignores anyway. Buttons activate on keyup in
  // some browsers, so that is suppressed too.
  const isSpace = (e: KeyboardEvent) =>
    e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing;
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

  render(store.get());
  return {};
};
