// The first screen (docs/plans/phone-sheet.md, stream B): one line, the preset cards in groups by ball count, "Make
// your own" and Play/Pause. Shows only when the page opens with no state in the hash. Tapping a
// card loads it into the store and starts the player; the tap is the gesture iOS needs for
// sound. Leaving never stops playback. The logic is in first-minute.ts.
import { copy } from '../ui/copy';
import { cardGroups, cardPattern, playingPreset, presetPatch, scheduleFor, showsFirstMinute } from './first-minute';
import { PRESETS } from './presets';
import type { Preset } from './presets';
import type { Mount } from './mount';
import './first-minute.css';

const PLAY_ICON = '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor"></path></svg>';
const PAUSE_ICON =
  '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" fill="currentColor"></rect><rect x="14" y="4" width="5" height="16" fill="currentColor"></rect></svg>';

export const mountFirstMinute: Mount = (root, { store, player }) => {
  const app = root.closest('#app') as HTMLElement | null;
  if (!showsFirstMinute(location.hash)) {
    root.hidden = true;
    return {};
  }
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
      <h2 class="fm-group">${t.groups[g.id]}</h2>
      <div class="fm-cards">${g.presets.map(card).join('')}</div>`;

  root.innerHTML = `
    <p class="fm-line">${t.line}</p>
    <div class="fm-scroll">${cardGroups().map(group).join('')}</div>
    <div class="fm-bar">
      <button type="button" class="fm-own">${t.makeYourOwn}</button>
      <button type="button" class="fm-play" aria-label="${copy.play}">${PLAY_ICON}</button>
    </div>`;
  app?.classList.add('is-first-minute');

  const cards = [...root.querySelectorAll<HTMLButtonElement>('.fm-card')];
  const playButton = root.querySelector('.fm-play') as HTMLButtonElement;
  let active = true;

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

  root.querySelector('.fm-own')?.addEventListener('click', () => {
    active = false;
    root.hidden = true;
    app?.classList.remove('is-first-minute');
    store.set({ sheetTab: 'pattern' });
  });

  let shown = '';
  return {
    draw(view) {
      if (!active) return;
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
