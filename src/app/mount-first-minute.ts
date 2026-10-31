// The first screen (docs/plans/phone-sheet.md, stream B): one line, the preset cards in groups by ball count, "Make
// your own" and Play/Pause. Shows only when the page opens with no state in the hash. Tapping a
// card loads it into the store and starts the player; the tap is the gesture iOS needs for
// sound. Leaving never stops playback. The logic is in first-minute.ts.
import { PRESET_NAMES } from '../sound/mapping';
import type { PresetName } from '../sound/mapping';
import { KIT_IDS } from '../tunables';
import { copy } from '../ui/copy';
import { cardGroups, cardPattern, cardsPatch, playingPreset, presetPatch, scheduleFor, showsFirstMinute } from './first-minute';
import { kitEdit, nowPlaying, presetEdit, tempoAction } from './now-playing-model';
import { applyEdit } from './sound-panel-model';
import { PRESETS } from './presets';
import type { Preset } from './presets';
import type { Mount } from './mount';
import './first-minute.css';

const PLAY_ICON = '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor"></path></svg>';
const PAUSE_ICON =
  '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" fill="currentColor"></rect><rect x="14" y="4" width="5" height="16" fill="currentColor"></rect></svg>';

export const mountFirstMinute: Mount = (root, { store, player }) => {
  const app = root.closest('#app') as HTMLElement | null;
  const t = copy.firstMinute;
  const nameOf = (p: Preset) => copy.presets[p.id]?.name ?? '';

  /** A card: its pattern and name, with the ratio badge on the wide one. */
  const card = (p: Preset) => `
        <button type="button" class="fm-card${p.ratio.a !== p.ratio.b || p.group === 'passing' ? ' fm-wide' : ''}" data-id="${p.id}">
          <span class="fm-text">
            <span class="fm-pattern">${cardPattern(p)}</span>
            <span class="fm-name">${nameOf(p)}</span>
          </span>
          ${p.ratio.a !== p.ratio.b ? `<span class="fm-ratio">${copy.ratioChip(p.ratio.a, p.ratio.b)}</span>` : ''}
        </button>`;

  const group = (g: ReturnType<typeof cardGroups>[number]) => `
      <h2 class="fm-group" id="fm-group-${g.id}">${t.groups[g.id]}</h2>
      <div class="fm-cards" data-group="${g.id}">${g.presets.map(card).join('')}</div>`;

  root.innerHTML = `
    <p class="fm-line">${t.line}</p>
    <div class="fm-scroll">${cardGroups().map(group).join('')}</div>
    <div class="fm-foot">
      <div class="fm-strip" role="group" aria-label="${t.strip.label}">
        <label class="fm-field"><span class="fm-k">${t.strip.kit}</span>
          <select class="fm-kit">
            <option value="mixed" disabled hidden>${t.strip.mixed}</option>
            ${KIT_IDS.map((k) => `<option value="${k}">${copy.kitNames[k] ?? k}</option>`).join('')}
          </select></label>
        <label class="fm-field"><span class="fm-k">${t.strip.sound}</span>
          <select class="fm-sound">
            <option value="custom" disabled hidden>${t.strip.custom}</option>
            ${PRESET_NAMES.map((n) => `<option value="${n}">${copy.presetNames[n] ?? n}</option>`).join('')}
          </select></label>
        <div class="fm-field fm-tempo" role="group" aria-label="${t.strip.tempo}"><span class="fm-k">${t.strip.tempo}</span>
          <span class="fm-stepper">
            <button type="button" class="fm-slower" aria-label="${t.strip.slower}">&minus;</button>
            <span class="fm-bpm" aria-live="polite"></span>
            <button type="button" class="fm-faster" aria-label="${t.strip.faster}">+</button>
          </span></div>
        <button type="button" class="fm-all-sound">${t.strip.allSound}</button>
      </div>
      <div class="fm-bar">
        <button type="button" class="fm-own">${t.makeYourOwn}</button>
        <button type="button" class="fm-play" aria-label="${copy.play}">${PLAY_ICON}</button>
      </div>
    </div>`;

  const cards = [...root.querySelectorAll<HTMLButtonElement>('.fm-card')];
  const playButton = root.querySelector('.fm-play') as HTMLButtonElement;
  const $ = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const kitSelect = $<HTMLSelectElement>('.fm-kit');
  const soundSelect = $<HTMLSelectElement>('.fm-sound');
  const bpmReadout = $<HTMLElement>('.fm-bpm');
  const slower = $<HTMLButtonElement>('.fm-slower');
  const faster = $<HTMLButtonElement>('.fm-faster');

  /** Starts the store's pattern from stopped, or resumes from paused. */
  function start() {
    const state = store.get();
    const schedule = scheduleFor(state);
    if (player.view().state === 'paused') player.resume();
    else if (!player.playing()) player.play(schedule, state.mapping, state.bpm);
  }

  cards.forEach((el) =>
    el.addEventListener('click', () => {
      const preset = PRESETS.find((p) => p.id === el.dataset.id);
      if (!preset) return;
      store.dispatch(presetPatch(preset));
      // The knobs mount hands a changed pattern to a running player; stopped or paused, the tap starts it.
      if (!player.playing()) start();
    }),
  );

  playButton.addEventListener('click', () => {
    if (player.playing()) player.pause();
    else start();
  });

  // The strip acts on whatever the store holds, through the paths the Sound tab and the tempo knob
  // use: the Sound tab's mount hands a new mapping to the player, the knobs' mount a new tempo.
  // A select hands focus to Play afterwards, so Space plays and pauses again at once.
  const edit = (e: Parameters<typeof applyEdit>[1]) => store.set({ mapping: applyEdit(store.get().mapping, e) });
  kitSelect.addEventListener('change', () => {
    edit(kitEdit(kitSelect.value));
    playButton.focus();
  });
  soundSelect.addEventListener('change', () => {
    edit(presetEdit(soundSelect.value as PresetName));
    playButton.focus();
  });
  slower.addEventListener('click', () => store.dispatch(tempoAction(store.get().bpm, -1)));
  faster.addEventListener('click', () => store.dispatch(tempoAction(store.get().bpm, 1)));

  root.querySelector('.fm-own')?.addEventListener('click', () => store.set(cardsPatch(false)));
  root.querySelector('.fm-all-sound')?.addEventListener('click', () => store.set(cardsPatch(false, 'sound')));

  /** The card screen shows while the store says so; the sheet's Patterns control sets it again. */
  const show = (on: boolean) => {
    root.hidden = !on;
    app?.classList.toggle('is-first-minute', on);
  };
  store.subscribe((state, previous) => {
    if (state.cards !== previous.cards) show(state.cards);
  });
  // Only a bare address opens on the cards; About and links skip them.
  store.set({ cards: showsFirstMinute(location.hash) });
  show(store.get().cards);

  let shown = '';
  let strip = '';
  return {
    draw(view) {
      if (!store.get().cards) return;
      const now = nowPlaying(store.get());
      const stripKey = `${now.kit}|${now.preset}|${now.bpm}`;
      if (stripKey !== strip) {
        strip = stripKey;
        kitSelect.value = now.kit;
        soundSelect.value = now.preset;
        bpmReadout.textContent = `${now.bpm} ${copy.bpmUnit}`;
        slower.disabled = !now.canSlower;
        faster.disabled = !now.canFaster;
      }
      const playing = view.state === 'playing';
      const id = playingPreset(store.get(), playing);
      const key = `${id}|${playing}`;
      if (key === shown) return;
      shown = key;
      for (const el of cards) {
        const on = el.dataset.id === id;
        el.classList.toggle('fm-playing', on);
        const preset = PRESETS.find((p) => p.id === el.dataset.id)!;
        const name = nameOf(preset);
        (el.querySelector('.fm-name') as HTMLElement).textContent = name + (on ? t.playingSuffix : '');
        el.setAttribute('aria-label', t.cardLabel(cardPattern(preset), name, on));
      }
      playButton.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
      playButton.setAttribute('aria-label', playing ? t.pause : copy.play);
    },
  };
};
