import { buildSchedule, isVanilla, parsePattern, reduceRatio, validate } from './core';
import type { PatternInput, Ratio, Schedule } from './core';
import { createDrumSound } from './sound/drum-sound';
import { browserContext, tr808 } from './sound/tr808';
import { createPlayer } from './app/player';
import { drawLadder } from './app/ladder-canvas';
import { ladderFrame } from './view/ladder';
import { DEFAULT_BPM, DEFAULT_MAPPING, DEFAULT_PATTERN, LADDER, RATIO_CHIPS } from './tunables';
import { copy } from './ui/copy';

const app = document.getElementById('app');
if (app) {
  app.innerHTML = `
    <h1>${copy.title}</h1>
    <p>${copy.placeholder}</p>
    <canvas id="ladder" height="${LADDER.heightPx}"></canvas>
    <form id="form">
      <div class="row">
        <span>${copy.ratioLabel}</span>
        ${RATIO_CHIPS.map(([a, b]) => `<button type="button" class="chip" data-a="${a}" data-b="${b}">${copy.ratioChip(a, b)}</button>`).join('')}
      </div>
      <div class="row">
        <label id="label-0">${copy.patternLabel} <input id="hand-0" value="${DEFAULT_PATTERN}" autocomplete="off" /></label>
        <label id="label-1" hidden>${copy.handLabel(1)} <input id="hand-1" value="2" autocomplete="off" /></label>
      </div>
      <p id="hint" class="hint" hidden>${copy.oneHandHint}</p>
      <div class="row">
        <button id="play" type="submit">${copy.play}</button>
        <button id="stop" type="button" disabled>${copy.stop}</button>
        <span class="hint">${copy.spaceHint}</span>
      </div>
    </form>
    <p id="status" aria-live="polite"></p>
  `;

  const sound = createDrumSound(browserContext, tr808);
  const player = createPlayer(sound);
  const form = document.getElementById('form') as HTMLFormElement;
  const inputs = [0, 1].map((h) => document.getElementById(`hand-${h}`) as HTMLInputElement);
  const label1 = document.getElementById('label-1') as HTMLLabelElement;
  const label0 = document.getElementById('label-0') as HTMLLabelElement;
  const hint = document.getElementById('hint') as HTMLParagraphElement;
  const stopButton = document.getElementById('stop') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLParagraphElement;
  const canvas = document.getElementById('ladder') as HTMLCanvasElement;
  const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.chip'));

  let ratio: Ratio = { a: 1, b: 1 };
  let schedule: Schedule | null = null;

  sound.preload(DEFAULT_MAPPING);

  function check(): Schedule | null {
    const vanilla = isVanilla(ratio);
    const hands = [];
    for (const input of vanilla ? inputs.slice(0, 1) : inputs) {
      const parsed = parsePattern(input.value);
      if (!parsed.ok) {
        status.textContent = copy.parseError(parsed.error);
        return (schedule = null);
      }
      hands.push(parsed.pattern);
    }
    const pattern: PatternInput = { ratio, hands };
    const v = validate(pattern);
    if (!v.ok) {
      status.textContent = copy.validationError(v.errors[0]!, vanilla);
      return (schedule = null);
    }
    status.textContent = copy.valid(v.balls);
    return (schedule = buildSchedule(pattern));
  }

  function setRatio(next: Ratio) {
    ratio = reduceRatio(next);
    const vanilla = isVanilla(ratio);
    label1.hidden = vanilla;
    hint.hidden = vanilla;
    (label0.firstChild as Text).textContent = `${vanilla ? copy.patternLabel : copy.handLabel(0)} `;
    for (const chip of chips) {
      const on = Number(chip.dataset.a) === ratio.a && Number(chip.dataset.b) === ratio.b;
      chip.setAttribute('aria-pressed', String(on));
    }
    check();
  }

  function play() {
    const s = check();
    if (!s) return;
    player.play(s, DEFAULT_MAPPING, DEFAULT_BPM);
    stopButton.disabled = false;
  }

  function stop() {
    player.stop();
    stopButton.disabled = true;
  }

  for (const input of inputs) input.addEventListener('input', check);
  for (const chip of chips) {
    chip.addEventListener('click', () => setRatio({ a: Number(chip.dataset.a), b: Number(chip.dataset.b) }));
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    play();
  });
  stopButton.addEventListener('click', stop);
  // Space plays and stops, except inside a per-hand input where a space separates throws.
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    const inInput = e.target instanceof HTMLInputElement;
    if (inInput && !isVanilla(ratio)) return;
    e.preventDefault();
    if (player.playing()) stop();
    else play();
  });

  function frame() {
    if (schedule) drawLadder(canvas, ladderFrame(schedule, player.position(), LADDER));
    requestAnimationFrame(frame);
  }

  setRatio(ratio);
  requestAnimationFrame(frame);
}
