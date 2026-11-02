// The Sound panel (SPEC §4.3; docs/plans/v5-sound-model.md, ruling 7): the sheet's Sound tab on a
// phone, the column's on a wide screen. mount-sheet.ts shows and hides the tab; this fills it, top
// to bottom: Volume; Listen for, with an ⓘ that shows one plain line per choice; Tempo; Drum
// machines (each juggler on stage with its kit, read only, and Change drum machines); Also play,
// three switches. Every sound control dispatches an action (actions.ts); the logic of what the
// rows show is in sound-panel-model.ts.
//
// This mount also hands every change of the derived Mapping to the player (`player.setMapping`,
// which preloads what the new mapping needs and is read on the next look-ahead tick), so a sound
// restored from a share link reaches the player the same way a panel choice does.
//
// Tempo stays in the panel (as the mocks have it, between Listen for and Drum machines): the
// readout, the slider and each hand's beat. It writes `store.bpm`; mount-knobs.ts hands a new
// tempo to the player with the rest of the edit.
import { ALSO_KEYS, LISTENS, type Also, type Listen } from '../sound/drummers';
import { BPM_RANGE, KNOBS } from '../tunables';
import { copy } from '../ui/copy';
import { inputPerPart } from './actions';
import { volumePatch } from './deck-model';
import { derived } from './derived';
import { clampBpm, hand2Bpm } from './knobs-model';
import type { Mount } from './mount';
import { fillPercent, tempoLines } from './sheet-model';
import { drummerRows } from './sound-panel-model';
import './sound-panel.css';

export const mountSoundPanel: Mount = (root, { store, player }) => {
  root.innerHTML = `
    <div id="sound-panel" class="sound-panel">
      <div class="group sp-volume">
        <label class="section-label" for="sp-volume">${copy.volumeLabel}</label>
        <input id="sp-volume" class="slider" type="range" min="0" max="1" step="${KNOBS.volumeStep}" />
      </div>
      <div class="group sp-listen" role="group" aria-labelledby="sp-listen-heading">
        <div class="sp-head">
          <span class="section-label" id="sp-listen-heading">${copy.listenHeading}</span>
          <button type="button" id="sp-listen-info" class="sp-info" aria-expanded="false" aria-controls="sp-listen-lines" aria-label="${copy.listenInfoLabel}">${copy.listenInfoGlyph}</button>
        </div>
        <ul id="sp-listen-lines" class="sp-lines" hidden>
          ${LISTENS.map((l) => `<li>${copy.listenInfo[l]}</li>`).join('')}
        </ul>
        ${LISTENS.map((l) => `<button type="button" class="sp-choice" data-listen="${l}" aria-pressed="false">${copy.listenNames[l]}</button>`).join('')}
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
      <div class="group sp-drummers">
        <span class="section-label" id="sp-drummers-heading">${copy.drummersHeading}</span>
        <ul class="sp-drummer-list" aria-labelledby="sp-drummers-heading"></ul>
        <button type="button" id="sp-change-kits" class="sp-button">${copy.changeDrummers}</button>
      </div>
      <div class="group sp-also" role="group" aria-labelledby="sp-also-heading">
        <span class="section-label" id="sp-also-heading">${copy.alsoHeading}</span>
        ${ALSO_KEYS.map(
          (key) => `<button type="button" class="sp-switch" role="switch" aria-checked="false" data-also="${key}">
            <span class="sp-switch-text"><span class="sp-switch-name">${copy.alsoNames[key]}</span><span class="sp-switch-hint">${copy.alsoHints[key]}</span></span>
            <span class="sp-toggle" aria-hidden="true"><i></i></span>
          </button>`,
        ).join('')}
      </div>
    </div>
  `;

  const $ = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const volume = $<HTMLInputElement>('#sp-volume');
  const info = $<HTMLButtonElement>('#sp-listen-info');
  const lines = $<HTMLUListElement>('#sp-listen-lines');
  const choices = [...root.querySelectorAll<HTMLButtonElement>('.sp-choice')];
  const drummerList = $<HTMLUListElement>('.sp-drummer-list');
  const switches = [...root.querySelectorAll<HTMLButtonElement>('.sp-switch')];
  const tempo = $<HTMLInputElement>('#tempo');
  const bpmInput = $<HTMLInputElement>('#bpm');
  const tempoHands = Array.from(root.querySelectorAll<HTMLSpanElement>('.tempo-hands span'));
  const tempoBoth = $<HTMLParagraphElement>('.tempo-both');

  /** The tempo group, from the store; the box is left alone while it is typed in. */
  function syncTempo(state = store.get()) {
    tempo.value = String(state.bpm);
    tempo.style.setProperty('--fill', `${fillPercent(state.bpm, BPM_RANGE.min, BPM_RANGE.max)}%`);
    if (document.activeElement !== bpmInput) bpmInput.value = String(state.bpm);
    tempoBoth.textContent = copy.tempoBoth(state.bpm, hand2Bpm(state.bpm, state.ratio), !inputPerPart(state));
    tempoLines(state.bpm, state.ratio).forEach((line, i) => ((tempoHands[i] as HTMLSpanElement).textContent = line));
  }
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

  volume.addEventListener('input', () => store.set(volumePatch(Number(volume.value))));
  info.addEventListener('click', () => {
    const open = lines.hidden;
    lines.hidden = !open;
    info.setAttribute('aria-expanded', String(open));
  });
  for (const choice of choices) {
    choice.addEventListener('click', () => store.dispatch({ type: 'setListen', listen: choice.dataset.listen as Listen }));
  }
  $<HTMLButtonElement>('#sp-change-kits').addEventListener('click', () => store.dispatch({ type: 'nextKits' }));
  for (const s of switches) {
    s.addEventListener('click', () => {
      const key = s.dataset.also as keyof Also;
      store.dispatch({ type: 'setAlso', key, on: !store.get().also[key] });
    });
  }

  let drummersKey = '';
  function sync(state = store.get()) {
    volume.value = String(state.volume);
    volume.style.setProperty('--fill', `${fillPercent(state.volume, 0, 1)}%`);
    for (const choice of choices) choice.setAttribute('aria-pressed', String(choice.dataset.listen === state.listen));
    for (const s of switches) s.setAttribute('aria-checked', String(state.also[s.dataset.also as keyof Also]));
    const rows = drummerRows(state);
    const key = rows.map((r) => `${r.kit}|${r.colour}`).join(',');
    if (key !== drummersKey) {
      drummersKey = key;
      drummerList.innerHTML = rows
        .map(
          (r) => `<li class="sp-drummer" data-juggler="${r.juggler}"${r.colour ? ` style="--juggler:${r.colour}"` : ''}>
            <span class="sp-drummer-name">${r.label}</span><span class="sp-kit" data-kit="${r.kit}">${r.kitName}</span></li>`,
        )
        .join('');
    }
  }

  store.subscribe((state, previous) => {
    const mapping = derived(state).mapping;
    if (mapping !== derived(previous).mapping) player.setMapping(mapping);
    sync(state);
    syncTempo(state);
  });
  sync();
  syncTempo();

  return {};
};
