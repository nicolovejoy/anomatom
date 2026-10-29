import { buildSchedule, isVanilla, parsePattern, validate } from './core';
import { createDrumSound } from './sound/drum-sound';
import { browserContext, tr808 } from './sound/tr808';
import { createPlayer } from './app/player';
import { DEFAULT_BPM, DEFAULT_MAPPING, DEFAULT_PATTERN } from './tunables';
import { copy } from './ui/copy';

const app = document.getElementById('app');
if (app) {
  app.innerHTML = `
    <h1>${copy.title}</h1>
    <p>${copy.placeholder}</p>
    <form id="form">
      <label>${copy.patternLabel} <input id="pattern" value="${DEFAULT_PATTERN}" autocomplete="off" inputmode="numeric" /></label>
      <button id="play" type="submit">${copy.play}</button>
      <button id="stop" type="button" disabled>${copy.stop}</button>
    </form>
    <p id="status" aria-live="polite"></p>
  `;

  const sound = createDrumSound(browserContext, tr808);
  const player = createPlayer(sound);
  const form = document.getElementById('form') as HTMLFormElement;
  const input = document.getElementById('pattern') as HTMLInputElement;
  const stopButton = document.getElementById('stop') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLParagraphElement;
  const ratio = { a: 1, b: 1 };

  sound.preload(DEFAULT_MAPPING);

  function check(): ReturnType<typeof buildSchedule> | null {
    const parsed = parsePattern(input.value);
    if (!parsed.ok) {
      status.textContent = copy.parseError(parsed.error);
      return null;
    }
    const pattern = { ratio, hands: [parsed.pattern] };
    const v = validate(pattern);
    if (!v.ok) {
      status.textContent = copy.validationError(v.errors[0]!, isVanilla(ratio));
      return null;
    }
    status.textContent = copy.valid(v.balls);
    return buildSchedule(pattern);
  }

  input.addEventListener('input', check);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const schedule = check();
    if (!schedule) return;
    player.play(schedule, DEFAULT_MAPPING, DEFAULT_BPM);
    stopButton.disabled = false;
  });
  stopButton.addEventListener('click', () => {
    player.stop();
    stopButton.disabled = true;
  });
  check();
}
