// The sound panel (SPEC §4.3): the sheet's Sound tab (docs/plans/phone-sheet.md). mount-sheet.ts
// shows and hides the tab; this fills it. One control per Mapping field, in
// SPEC order; every edit goes through `applyEdit` and is written to `store.mapping`, and this
// panel is the only thing that writes it. The logic is in sound-panel-model.ts.
//
// This mount also hands every Mapping change to the player (`player.setMapping`, which
// preloads what the new mapping needs and is read on the next look-ahead tick), so a
// Mapping restored from a share link reaches the sound the same way a panel edit does.
//
// Tempo is the panel's first group (docs/plans/v4-deck.md, ruling 4): the readout, the slider and
// each hand's beat, as the Rhythm tab had them. It writes `store.bpm`; mount-knobs.ts hands a new
// tempo to the player with the rest of the edit.
//
// A select hands focus to Play after `change`, so Space plays and pauses again at once (a
// focused select keeps Space; see keepsSpace in sheet-model.ts).
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
  BPM_RANGE,
  CROSS_BOOST_RANGE,
  FILTER_HZ_RANGE,
  GAIN_RANGE,
  KIT_IDS,
  KIT_SAMPLES,
  MAX_HEIGHT,
  PAN_RANGE,
  PASS_BOOST_RANGE,
  SOUND_PANEL,
} from '../tunables';
import { copy } from '../ui/copy';
import { inputPerPart } from './actions';
import { clampBpm, hand2Bpm } from './knobs-model';
import type { Mount } from './mount';
import { fillPercent, tempoLines } from './sheet-model';
import {
  applyEdit,
  downbeatChoices,
  ensureVoices,
  jugglerKits,
  kitRows,
  resetTarget,
  sampleFromValue,
  sampleValue,
  type MappingEdit,
} from './sound-panel-model';
import './sound-panel.css';

const label = (sample: Sample) => (sample === null ? copy.noSample : (copy.sampleNames[sample] ?? sample));

export const mountSoundPanel: Mount = (root, { store, player }) => {
  const heights = Array.from({ length: MAX_HEIGHT }, (_, i) => i + 1);
  const sampleOptions = (samples: readonly Sample[], none: string = copy.noSample) =>
    samples.map((s) => `<option value="${sampleValue(s)}">${s === null ? none : label(s)}</option>`).join('');
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

  const kitOptions = KIT_IDS.map((k) => `<option value="${k}">${copy.kitNames[k] ?? k}</option>`).join('');
  /** The Kit row: one select with one or two parts, one per juggler (a pair of parts) from three. */
  const renderKits = (jugglers: number) =>
    jugglers === 0
      ? `<div class="sp-row"><label for="sp-kit">${copy.kitLabel}</label><select id="sp-kit">${kitOptions}</select></div>`
      : Array.from(
          { length: jugglers },
          (_, j) => `<div class="sp-row"><label for="sp-kit-${j}">${copy.jugglerKitLabel(j)}</label>
            <select id="sp-kit-${j}" data-juggler="${j}">${kitOptions}</select></div>`,
        ).join('');
  /** The Passes section: only where a pass can happen, from three parts. */
  const renderPasses = (jugglers: number) =>
    jugglers === 0
      ? ''
      : `<fieldset id="sp-passes-box">
          <legend>${copy.passesHeading}</legend>
          <div class="sp-row"><label for="sp-pass-accent">${copy.passAccentLabel}</label>
            <input id="sp-pass-accent" type="range" min="${PASS_BOOST_RANGE.min}" max="${PASS_BOOST_RANGE.max}" step="${SOUND_PANEL.accentStep}" />
            <output id="sp-pass-accent-out"></output></div>
          <div class="sp-row"><label for="sp-pass-sample">${copy.passSampleLabel}</label>
            <select id="sp-pass-sample">${sampleOptions(allSamples, copy.passSampleOwn)}</select></div>
        </fieldset>`;

  root.innerHTML = `
    <div id="sound-panel" class="sound-panel">
      <div class="group tempo">
        <div class="tempo-head">
          <label class="section-label" for="bpm">${copy.tempoLabel}</label>
          <span class="bpm-readout"><input id="bpm" type="number" inputmode="numeric" min="${BPM_RANGE.min}" max="${BPM_RANGE.max}" step="1" /><span class="unit">${copy.bpmUnit}</span></span>
        </div>
        <input id="tempo" class="slider" type="range" min="${BPM_RANGE.min}" max="${BPM_RANGE.max}" step="1" aria-label="${copy.tempoLabel}" />
        <div class="tempo-hands" aria-hidden="true"><span></span><span></span></div>
        <p class="sr-only tempo-both"></p>
      </div>
      <div id="sp-kits"></div>
      <div id="sp-passes"></div>
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
      </div>
    </div>
  `;

  const $ = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const kitsBox = $<HTMLElement>('#sp-kits');
  const passesBox = $<HTMLElement>('#sp-passes');
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

  /** The only write to the Mapping. */
  const edit = (e: MappingEdit) => store.set({ mapping: applyEdit(store.get().mapping, e) });

  let lastPreset: PresetName = 'height-drum';
  let partCount = -1;
  let kitRowCount = -1;
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
    const rows = kitRows(state.parts.length);
    if (rows !== kitRowCount) {
      kitRowCount = rows;
      kitsBox.innerHTML = renderKits(rows);
      passesBox.innerHTML = renderPasses(rows);
    }
    if (rows === 0) $<HTMLSelectElement>('#sp-kit').value = m.parts[0]?.kit ?? KIT_IDS[0] ?? '';
    else {
      jugglerKits(m, rows).forEach((k, j) => ($<HTMLSelectElement>(`#sp-kit-${j}`).value = k));
      $<HTMLSelectElement>('#sp-pass-sample').value = sampleValue(m.pass.sample);
      setIfIdle($<HTMLInputElement>('#sp-pass-accent'), String(m.pass.velocity));
      $<HTMLOutputElement>('#sp-pass-accent-out').value = String(m.pass.velocity);
    }
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

  // A select hands focus to Play once a choice is made, so Space plays and pauses again at once.
  // (On Windows and Linux an Arrow key on a closed select fires `change`, so it moves focus too; accepted.)
  root.addEventListener('change', (e) => {
    if (e.target instanceof HTMLSelectElement) document.getElementById('play')?.focus();
  });

  // Controls -> edits.
  // The Kit row and the Passes section are made again when the part count crosses 2 (or the jugglers
  // change), so their listeners sit on the boxes that stay.
  kitsBox.addEventListener('change', (e) => {
    const select = e.target as HTMLSelectElement;
    if (select.dataset.juggler === undefined) edit({ kind: 'kit', kit: select.value });
    else edit({ kind: 'jugglerKit', juggler: Number(select.dataset.juggler), kit: select.value });
  });
  passesBox.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.id === 'sp-pass-accent') edit({ kind: 'passAccent', velocity: Number(target.value) });
  });
  passesBox.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    if (target.id === 'sp-pass-sample') edit({ kind: 'passSample', sample: sampleFromValue(target.value) });
  });
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

  // A pattern with more parts than the mapping has voices (a link, a preset) gets the rotation's next voices.
  const growVoices = (state = store.get()) => {
    const mapping = ensureVoices(state.mapping, state.parts.length);
    if (mapping !== state.mapping) store.set({ mapping });
  };

  store.subscribe((state, previous) => {
    if (state.mapping !== previous.mapping) player.setMapping(state.mapping);
    sync(state);
    syncTempo(state);
    growVoices(state);
  });
  growVoices();
  sync();
  syncTempo();

  return {};
};
