import { fetchStreams, startResourcePolling, mountVideo } from './shared.js';

const tileTemplate = document.getElementById('tile-template');
const tileGrid = document.getElementById('tile-grid');
const tileCountSelect = document.getElementById('tile-count');
const assignmentSelect = document.getElementById('stream-assignment');
const fixedStreamLabel = document.getElementById('fixed-stream-label');
const fixedStreamSelect = document.getElementById('fixed-stream');
const tileModeSelect = document.getElementById('tile-mode');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const activeCountEl = document.getElementById('active-count');

let streamNames = [];
let activeTiles = []; // { holder } for each mounted tile, so Stop can disconnect cleanly

function stopAll() {
  for (const tile of activeTiles) {
    mountVideo(tile.holder, '', tileModeSelect.value, null);
  }
  activeTiles = [];
  tileGrid.innerHTML = '';
  activeCountEl.textContent = 'Active tiles: 0';
}

function start() {
  stopAll(); // always rebuild clean, avoids leaking previous tiles' connections

  const count = Number(tileCountSelect.value);
  const mode = tileModeSelect.value;
  const cycling = assignmentSelect.value === 'cycle';
  const fixedName = fixedStreamSelect.value;

  if (streamNames.length === 0) {
    activeCountEl.textContent = 'Active tiles: 0 (no streams configured in go2rtc.yaml)';
    return;
  }

  for (let i = 0; i < count; i++) {
    const name = cycling ? streamNames[i % streamNames.length] : fixedName;
    if (!name) continue;

    const tileEl = tileTemplate.content.cloneNode(true).querySelector('.tile');
    const labelEl = tileEl.querySelector('.tile-label');
    const holder = tileEl.querySelector('.tile-video');
    labelEl.textContent = `#${i + 1}: ${name} (${mode})`;
    tileGrid.appendChild(tileEl);

    mountVideo(holder, name, mode, null);
    activeTiles.push({ holder });
  }

  activeCountEl.textContent = `Active tiles: ${activeTiles.length}`;
}

function updateAssignmentVisibility() {
  fixedStreamLabel.classList.toggle('hidden', assignmentSelect.value !== 'fixed');
}

async function init() {
  const streams = await fetchStreams();
  streamNames = Object.keys(streams).sort();

  for (const name of streamNames) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    fixedStreamSelect.appendChild(opt);
  }

  assignmentSelect.addEventListener('change', updateAssignmentVisibility);
  updateAssignmentVisibility();

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stopAll);

  // Free every tile's connection if the user navigates away, so switching
  // back to the comparison page doesn't leave a pile of stale streams running.
  window.addEventListener('beforeunload', stopAll);
}

init();

startResourcePolling({
  cpuEl: document.getElementById('stat-cpu'),
  memEl: document.getElementById('stat-mem'),
  netEl: document.getElementById('stat-net'),
  errEl: document.getElementById('stat-error'),
});
