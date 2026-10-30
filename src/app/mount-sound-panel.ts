// The sound panel (SPEC §4.3): the sheet's Sound tab (docs/plans/phone-sheet.md). mount-sheet.ts
// shows and hides the tab; this fills it. One control per Mapping field, in
// SPEC order; every edit goes through `applyEdit` and is written to `store.mapping`, and this
// panel is the only thing that writes it. The logic is in sound-panel-model.ts.
//
// This mount also hands every Mapping change to the player (`player.setMapping`, which
// preloads what the new mapping needs and is read on the next look-ahead tick), so a
// Mapping restored from a share link reaches the sound the same way a panel edit does.
//
// Everything inside the panel is `[data-keeps-space]`: Space belongs to the focused select,
// checkbox or button there, not to play and pause.
import {
  PAD_CHORD_IDS,
  PAD_INSTRUMENT_IDS,
  presetOf,
  PRESET_NAMES,
  type Mapping,
  type PresetName,
  type Sample,
} from '../sound/mapping';
import {
  CROSS_BOOST_RANGE,
  FILTER_HZ_RANGE,
  GAIN_RANGE,
  KIT_IDS,
  KIT_SAMPLES,
  MAX_HEIGHT,
  PAN_RANGE,
  SOUND_PANEL,
} from '../tunables';
import { copy } from '../ui/copy';
import type { Mount } from './mount';
import {
  applyEdit,
  downbeatChoices,
  ensureVoices,
  resetTarget,
  sampleFromValue,
  sampleValue,
  type MappingEdit,
} from './sound-panel-model';
import { shareUrl } from './share';
import './sound-panel.css';

const label = (sample: Sample) => (sample === null ? copy.noSample : (copy.sampleNames[sample] ?? sample));

export const mountSoundPanel: Mount = (root, { store, player }) => {
  const heights = Array.from({ length: MAX_HEIGHT }, (_, i) => i + 1);
  const sampleOptions = (samples: readonly Sample[]) =>
    samples.map((s) => `<option value="${sampleValue(s)}">${label(s)}</option>`).join('');
  const allSamples: readonly Sample[] = [null, ...KIT_SAMPLES];

  /** One row of sound, pan and gain per part; the part is read back from `data-part`. */
  const renderParts = (count: number) =>
    Array.from(
      { length: count },
      (_, i) => `<div class="sp-row"><label for="sp-part-sample-${i}">${copy.partSoundLabel(i)}</label>
        <select id="sp-part-sample-${i}" data-part="${i}" data-field="sample">${sampleOptions(allSamples)}</select></div>
      <div class="sp-row"><label for="sp-pan-${i}">${copy.panLabel(i)}</label>
        <input id="sp-pan-${i}" data-part="${i}" data-field="pan" type="range" min="${PAN_RANGE.min}" max="${PAN_RANGE.max}" step="${SOUND_PANEL.panStep}" />
        <output id="sp-pan-out-${i}"></output></div>
      <div class="sp-row"><label for="sp-gain-${i}">${copy.gainLabel(i)}</label>
        <input id="sp-gain-${i}" data-part="${i}" data-field="gain" type="range" min="${GAIN_RANGE.min}" max="${GAIN_RANGE.max}" step="${SOUND_PANEL.gainStep}" />
        <output id="sp-gain-out-${i}"></output></div>`,
    ).join('');

  root.innerHTML = `
    <div id="sound-panel" class="sound-panel" data-keeps-space>
      <div class="sp-row">
        <label for="sp-kit">${copy.kitLabel}</label>
        <select id="sp-kit">${KIT_IDS.map((k) => `<option value="${k}">${copy.kitNames[k] ?? k}</option>`).join('')}</select>
      </div>
      <p class="sp-note">${copy.soundBallCountNote}</p>
      <div class="sp-row">
        <label for="sp-preset">${copy.presetLabel}</label>
        <select id="sp-preset">
          ${PRESET_NAMES.map((n) => `<option value="${n}">${copy.presetNames[n]}</option>`).join('')}
          <option value="custom" disabled>${copy.presetNames.custom}</option>
        </select>
      </div>
      <fieldset>
        <legend>${copy.perHeightHeading}</legend>
        ${heights
          .map(
            (h) => `<div class="sp-row"><label for="sp-height-${h}">${copy.heightLabel(h)}</label>
              <select id="sp-height-${h}" data-height="${h}">${sampleOptions(allSamples)}</select></div>`,
          )
          .join('')}
      </fieldset>
      <fieldset id="sp-parts">
        <legend>${copy.partsHeading}</legend>
      </fieldset>
      <fieldset>
        <legend>${copy.catchesHeading}</legend>
        <div class="sp-row"><label><input id="sp-catches-on" type="checkbox" /> ${copy.catchesOn}</label></div>
        <div class="sp-row"><label for="sp-catch-sample">${copy.catchSoundLabel}</label>
          <select id="sp-catch-sample">${sampleOptions(allSamples)}</select></div>
      </fieldset>
      <fieldset>
        <legend>${copy.accentHeading}</legend>
        <div class="sp-row"><label for="sp-accent">${copy.accentLabel}</label>
          <input id="sp-accent" type="range" min="${CROSS_BOOST_RANGE.min}" max="${CROSS_BOOST_RANGE.max}" step="${SOUND_PANEL.accentStep}" />
          <output id="sp-accent-out"></output></div>
        <div class="sp-row"><label for="sp-downbeat">${copy.downbeatLabel}</label>
          <select id="sp-downbeat"></select></div>
      </fieldset>
      <fieldset>
        <legend>${copy.filterHeading}</legend>
        <div class="sp-row"><label><input id="sp-filter-on" type="checkbox" /> ${copy.filterOn}</label></div>
        <div class="sp-row"><label for="sp-filter-low">${copy.filterLowLabel}</label>
          <input id="sp-filter-low" type="number" min="${FILTER_HZ_RANGE.min}" max="${FILTER_HZ_RANGE.max}" step="${SOUND_PANEL.hzStep}" /></div>
        <div class="sp-row"><label for="sp-filter-high">${copy.filterHighLabel}</label>
          <input id="sp-filter-high" type="number" min="${FILTER_HZ_RANGE.min}" max="${FILTER_HZ_RANGE.max}" step="${SOUND_PANEL.hzStep}" /></div>
      </fieldset>
      <fieldset>
        <legend>${copy.padHeading}</legend>
        <div class="sp-row"><label><input id="sp-pad-on" type="checkbox" /> ${copy.padOn}</label></div>
        <div class="sp-row"><label for="sp-pad-instrument">${copy.padInstrumentLabel}</label>
          <select id="sp-pad-instrument">${PAD_INSTRUMENT_IDS.map((i) => `<option value="${i}">${copy.padInstrumentNames[i]}</option>`).join('')}</select></div>
        <div class="sp-row"><label for="sp-pad-chord">${copy.padChordLabel}</label>
          <select id="sp-pad-chord">${PAD_CHORD_IDS.map((c) => `<option value="${c}">${copy.padChordNames[c]}</option>`).join('')}</select></div>
      </fieldset>
      <div class="sp-row sp-actions">
        <button type="button" id="sp-reset">${copy.resetToPreset}</button>
        <button type="button" id="sp-copy">${copy.copyLink}</button>
      </div>
      <p id="sp-confirm" class="sp-confirm" role="status" aria-live="polite"></p>
    </div>
  `;

  const $ = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const kit = $<HTMLSelectElement>('#sp-kit');
  const preset = $<HTMLSelectElement>('#sp-preset');
  const heightSelects = heights.map((h) => $<HTMLSelectElement>(`#sp-height-${h}`));
  const partsBox = $<HTMLFieldSetElement>('#sp-parts');
  const catchesOn = $<HTMLInputElement>('#sp-catches-on');
  const catchSample = $<HTMLSelectElement>('#sp-catch-sample');
  const accent = $<HTMLInputElement>('#sp-accent');
  const downbeat = $<HTMLSelectElement>('#sp-downbeat');
  const filterOn = $<HTMLInputElement>('#sp-filter-on');
  const filterLow = $<HTMLInputElement>('#sp-filter-low');
  const filterHigh = $<HTMLInputElement>('#sp-filter-high');
  const padOn = $<HTMLInputElement>('#sp-pad-on');
  const padInstrument = $<HTMLSelectElement>('#sp-pad-instrument');
  const padChord = $<HTMLSelectElement>('#sp-pad-chord');
  const confirm = $<HTMLParagraphElement>('#sp-confirm');

  /** The only write to the Mapping. */
  const edit = (e: MappingEdit) => store.set({ mapping: applyEdit(store.get().mapping, e) });

  let lastPreset: PresetName = 'height-drum';
  let partCount = -1;
  let offeredDownbeat = '';

  // Controls are filled from the store; a control being typed in is left alone.
  const setIfIdle = (input: HTMLInputElement, value: string) => {
    if (document.activeElement !== input) input.value = value;
  };

  function sync(state = store.get()) {
    const m = state.mapping;
    const name = presetOf(m);
    if (name !== 'custom') lastPreset = name;
    preset.value = name;
    kit.value = m.parts[0]?.kit ?? KIT_IDS[0] ?? '';
    heights.forEach((h, i) => ((heightSelects[i] as HTMLSelectElement).value = sampleValue(m.perHeight[h] ?? null)));
    if (m.parts.length !== partCount) {
      partCount = m.parts.length;
      partsBox.innerHTML = renderParts(partCount);
    }
    m.parts.forEach((v, i) => {
      $<HTMLSelectElement>(`#sp-part-sample-${i}`).value = sampleValue(v.sample);
      setIfIdle($<HTMLInputElement>(`#sp-pan-${i}`), String(v.pan));
      setIfIdle($<HTMLInputElement>(`#sp-gain-${i}`), String(v.gain));
      $<HTMLOutputElement>(`#sp-pan-out-${i}`).value = String(v.pan);
      $<HTMLOutputElement>(`#sp-gain-out-${i}`).value = String(v.gain);
    });
    catchesOn.checked = m.catches.on;
    catchSample.value = sampleValue(m.catches.sample);
    setIfIdle(accent, String(m.crossAccent.velocity));
    $<HTMLOutputElement>('#sp-accent-out').value = String(m.crossAccent.velocity);
    const choices = downbeatChoices(m.crossAccent.downbeat);
    const key = choices.map(sampleValue).join('|');
    if (key !== offeredDownbeat) {
      offeredDownbeat = key;
      downbeat.innerHTML = sampleOptions(choices);
    }
    downbeat.value = sampleValue(m.crossAccent.downbeat);
    filterOn.checked = m.filter.on;
    setIfIdle(filterLow, String(m.filter.low));
    setIfIdle(filterHigh, String(m.filter.high));
    padOn.checked = m.pad.on;
    padInstrument.value = m.pad.instrument;
    padChord.value = m.pad.chord;
  }

  // Controls -> edits.
  kit.addEventListener('change', () => edit({ kind: 'kit', kit: kit.value }));
  preset.addEventListener('change', () => edit({ kind: 'preset', name: preset.value as PresetName }));
  heightSelects.forEach((select, i) =>
    select.addEventListener('change', () =>
      edit({ kind: 'height', height: i + 1, sample: sampleFromValue(select.value) }),
    ),
  );
  // Pan and gain move the part's nodes (nothing reloads), but commit when the slider is let go or a
  // key steps it, not on every pixel of a drag; the number follows the drag. One listener for every
  // part's rows: the rows are made again when the number of parts changes.
  const partOf = (target: EventTarget | null) => {
    const el = target as HTMLElement;
    return { part: Number(el.dataset.part), field: el.dataset.field };
  };
  partsBox.addEventListener('input', (e) => {
    const { part, field } = partOf(e.target);
    if (field === 'pan' || field === 'gain') {
      $<HTMLOutputElement>(`#sp-${field}-out-${part}`).value = (e.target as HTMLInputElement).value;
    }
  });
  partsBox.addEventListener('change', (e) => {
    const { part, field } = partOf(e.target);
    const value = (e.target as HTMLInputElement).value;
    if (field === 'sample') edit({ kind: 'partSample', part, sample: sampleFromValue(value) });
    else if (field === 'pan' || field === 'gain') edit({ kind: field, part, value: Number(value) });
  });
  catchesOn.addEventListener('change', () => edit({ kind: 'catchesOn', on: catchesOn.checked }));
  catchSample.addEventListener('change', () => edit({ kind: 'catchSample', sample: sampleFromValue(catchSample.value) }));
  accent.addEventListener('input', () => edit({ kind: 'accent', velocity: Number(accent.value) }));
  downbeat.addEventListener('change', () => edit({ kind: 'downbeat', sample: sampleFromValue(downbeat.value) }));
  filterOn.addEventListener('change', () => edit({ kind: 'filterOn', on: filterOn.checked }));
  // Numbers apply on every valid keystroke; a blur or Enter puts the clamped value back.
  filterLow.addEventListener('input', () => edit({ kind: 'filterLow', hz: filterLow.valueAsNumber }));
  filterHigh.addEventListener('input', () => edit({ kind: 'filterHigh', hz: filterHigh.valueAsNumber }));
  for (const input of [filterLow, filterHigh]) input.addEventListener('change', () => sync());
  padOn.addEventListener('change', () => edit({ kind: 'padOn', on: padOn.checked }));
  padInstrument.addEventListener('change', () =>
    edit({ kind: 'padInstrument', instrument: padInstrument.value as Mapping['pad']['instrument'] }),
  );
  padChord.addEventListener('change', () => edit({ kind: 'padChord', chord: padChord.value as Mapping['pad']['chord'] }));
  $<HTMLButtonElement>('#sp-reset').addEventListener('click', () =>
    edit({ kind: 'preset', name: resetTarget(store.get().mapping, lastPreset) }),
  );

  // Copy share link: the address with the live state, not whatever the debounce last wrote.
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  const say = (text: string) => {
    confirm.textContent = text;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => (confirm.textContent = ''), SOUND_PANEL.confirmMs);
  };
  $<HTMLButtonElement>('#sp-copy').addEventListener('click', () => {
    const url = shareUrl(location.href, store.get());
    navigator.clipboard.writeText(url).then(
      () => say(copy.linkCopied),
      () => say(copy.linkNotCopied),
    );
  });

  // A pattern with more parts than the mapping has voices (a link, a preset) gets the rotation's next voices.
  const growVoices = (state = store.get()) => {
    const mapping = ensureVoices(state.mapping, state.parts.length);
    if (mapping !== state.mapping) store.set({ mapping });
  };

  store.subscribe((state, previous) => {
    if (state.mapping !== previous.mapping) player.setMapping(state.mapping);
    sync(state);
    growVoices(state);
  });
  growVoices();
  sync();

  return {};
};
