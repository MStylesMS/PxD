import { fetchStreams, urlForMode, buildStreamUrls, copyText, startResourcePolling, mountVideo } from './shared.js';

const template = document.getElementById('panel-template');
const panelEls = ['panel-a', 'panel-b'].map((id) => document.getElementById(id));

function flashCopied(el, ok) {
  el.dataset.label = el.dataset.label || el.textContent;
  el.textContent = ok ? 'Copied!' : 'Copy failed';
  setTimeout(() => {
    el.textContent = el.dataset.label;
  }, 1500);
}

function buildPanel(panelEl, streamNames) {
  panelEl.appendChild(template.content.cloneNode(true));

  const streamSelect = panelEl.querySelector('.stream-select');
  const modeSelect = panelEl.querySelector('.mode-select');
  const holder = panelEl.querySelector('.video-holder');
  const dimsEl = panelEl.querySelector('.video-dims');
  const copyEmbedBtn = panelEl.querySelector('.copy-embed-btn');
  const copyRtspBtn = panelEl.querySelector('.copy-rtsp-btn');
  const urlLine = panelEl.querySelector('.url-line');

  for (const name of streamNames) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    streamSelect.appendChild(opt);
  }

  function update() {
    mountVideo(holder, streamSelect.value, modeSelect.value, dimsEl);
    urlLine.textContent = streamSelect.value ? urlForMode(streamSelect.value, modeSelect.value) : '';
  }

  streamSelect.addEventListener('change', update);
  modeSelect.addEventListener('change', update);

  copyEmbedBtn.addEventListener('click', async () => {
    if (!streamSelect.value) return;
    const url = urlForMode(streamSelect.value, modeSelect.value);
    flashCopied(copyEmbedBtn, await copyText(url));
  });

  copyRtspBtn.addEventListener('click', async () => {
    if (!streamSelect.value) return;
    flashCopied(copyRtspBtn, await copyText(buildStreamUrls(streamSelect.value).rtsp));
  });

  // Hooks used by the global 1/2-camera layout toggle below.
  panelEl._disconnect = () => mountVideo(holder, '', modeSelect.value, dimsEl);
  panelEl._reconnect = () => update();
}

function setupLayoutToggle() {
  const oneBtn = document.getElementById('layout-one');
  const twoBtn = document.getElementById('layout-two');
  const panelB = document.getElementById('panel-b');

  function setLayout(count) {
    oneBtn.classList.toggle('active', count === 1);
    twoBtn.classList.toggle('active', count === 2);
    if (count === 1) {
      panelB.classList.add('hidden');
      panelB._disconnect?.(); // free resources instead of just hiding
    } else {
      panelB.classList.remove('hidden');
      panelB._reconnect?.(); // restore whatever was previously selected
    }
  }

  oneBtn.addEventListener('click', () => setLayout(1));
  twoBtn.addEventListener('click', () => setLayout(2));
}

async function init() {
  const streams = await fetchStreams();
  const names = Object.keys(streams).sort();
  for (const panelEl of panelEls) {
    buildPanel(panelEl, names);
  }
  setupLayoutToggle();
}

init();

startResourcePolling({
  cpuEl: document.getElementById('stat-cpu'),
  memEl: document.getElementById('stat-mem'),
  netEl: document.getElementById('stat-net'),
  errEl: document.getElementById('stat-error'),
});

