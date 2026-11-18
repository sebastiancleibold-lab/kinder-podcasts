/* Hörhaus – einfache Podcast-App für Kinder.
 * Alles läuft im Browser. Daten (Kinder, Fotos, Favoriten, Hörstand) liegen nur
 * im localStorage dieses Geräts. Podcasts und Folgen kommen aus dem öffentlichen
 * Apple-Podcast-Verzeichnis (itunes.apple.com), das Browser-Abrufe erlaubt.
 */
'use strict';

const STORE_KEY = 'hoerhaus.v1';
const EP_KEY = id => `hoerhaus.eps.${id}`;
const EP_MAX_AGE = 6 * 60 * 60 * 1000; // 6 Stunden
const MAX_TILES = 6;
const COLORS = ['#E8743B', '#3E8E9E', '#8A63B8', '#D9536F', '#4F9A5B', '#D9A21B'];

const app = document.getElementById('app');
const audio = document.getElementById('audio');

/* ---------------- Daten ---------------- */

const SEED = {
  kids: [
    {
      id: 'k1', name: 'Große', color: COLORS[0], photo: null, allowEpisodes: true,
      podcasts: [
        { id: 857588352, title: 'Ohrenbär Podcast', artist: 'ARD' },
        { id: 739795079, title: 'Kakadu – Der Kinderpodcast', artist: 'Deutschlandfunk Kultur' },
        { id: 1489934613, title: 'Die Maus zum Hören', artist: 'WDR' },
        { id: 1499814714, title: 'Pumuckl – Der Hörspiel-Klassiker', artist: 'BR' },
        { id: 1535654872, title: 'Gute Nacht mit der Maus', artist: 'WDR' },
      ],
    },
    {
      id: 'k2', name: 'Kleine', color: COLORS[1], photo: null, allowEpisodes: false,
      podcasts: [
        { id: 703350888, title: 'Unser Sandmännchen', artist: 'rbb' },
        { id: 1535654872, title: 'Gute Nacht mit der Maus', artist: 'WDR' },
      ],
    },
  ],
  settings: { sleepMinutes: 0, autoplayNext: false },
  progress: {}, // episodeUrl -> { t, done }
  lastEp: {},   // podcastId -> episodeUrl
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.settings = Object.assign({}, SEED.settings, s.settings || {});
      s.progress = s.progress || {};
      s.lastEp = s.lastEp || {};
      s.kids = s.kids || [];
      return s;
    }
  } catch (e) { /* ignore */ }
  return JSON.parse(JSON.stringify(SEED));
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    alertSoft('Speichern fehlgeschlagen. Vielleicht ist der Speicher voll (zu große Fotos?).');
  }
}

function kidById(id) { return state.kids.find(k => k.id === id); }

/* ---------------- Apple-Podcast-Verzeichnis ---------------- */

async function itunes(path, params) {
  const q = new URLSearchParams(Object.assign({ country: 'de' }, params));
  const res = await fetch(`https://itunes.apple.com/${path}?${q}`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function readEpCache(id) {
  try { return JSON.parse(localStorage.getItem(EP_KEY(id)) || 'null'); } catch (e) { return null; }
}

function writeEpCache(id, data) {
  try { localStorage.setItem(EP_KEY(id), JSON.stringify(data)); } catch (e) { /* voll: egal */ }
}

const inflight = {};
async function loadEpisodes(pod, force = false) {
  const cached = readEpCache(pod.id);
  if (cached && !force && Date.now() - cached.at < EP_MAX_AGE) return cached.eps;
  if (inflight[pod.id]) return inflight[pod.id];
  inflight[pod.id] = (async () => {
    try {
      const data = await itunes('lookup', { id: pod.id, entity: 'podcastEpisode', limit: 60 });
      const eps = [];
      for (const r of data.results) {
        if (r.kind === 'podcast') { // der Podcast selbst, keine Folge
          const img = r.artworkUrl600 || r.artworkUrl100;
          if (img) updatePodImage(pod.id, img);
          continue;
        }
        if (!r.episodeUrl) continue;
        eps.push({
          url: r.episodeUrl,
          title: r.trackName || '',
          date: r.releaseDate || '',
          ms: r.trackTimeMillis || 0,
          art: r.artworkUrl600 || r.artworkUrl160 || '',
        });
      }
      eps.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      writeEpCache(pod.id, { at: Date.now(), eps });
      return eps;
    } catch (e) {
      return cached ? cached.eps : [];
    } finally {
      delete inflight[pod.id];
    }
  })();
  return inflight[pod.id];
}

function updatePodImage(podId, img) {
  let changed = false;
  for (const k of state.kids) {
    for (const p of k.podcasts) {
      if (p.id === podId && p.image !== img) { p.image = img; changed = true; }
    }
  }
  if (changed) { save(); refreshTileImages(); }
}

function podImage(pod) { return pod.customImage || pod.image || ''; }

/* ---------------- DOM-Helfer ---------------- */

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICON = {
  house: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.2v13.6a.8.8 0 0 0 1.24.67L16 13v5.5a1 1 0 0 0 2 0v-13a1 1 0 0 0-2 0V11L6.24 4.53A.8.8 0 0 0 5 5.2z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/><circle cx="17" cy="5" r="1"/><circle cx="20" cy="8.5" r=".7"/></svg>',
};
const icon = name => h('span', { html: ICON[name], style: 'display:contents' });

function avatar(kid) {
  const el = h('div', { class: 'avatar', style: `background:${kid.color}` });
  if (kid.photo) el.append(h('img', { src: kid.photo, alt: '' }));
  else el.append((kid.name || '?').trim().charAt(0).toUpperCase());
  return el;
}

function setKidColor(kid) {
  document.documentElement.style.setProperty('--kid', kid ? kid.color : 'var(--accent)');
}

function alertSoft(msg) {
  const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) back.remove(); } },
    h('div', { class: 'modal' }, h('p', {}, msg), h('button', { class: 'btn', onclick: () => back.remove() }, 'OK')));
  document.body.append(back);
}

/* ---------------- Navigation ---------------- */

let view = { name: 'home' };

function go(name, params = {}) {
  view = Object.assign({ name }, params);
  render();
}

function render() {
  app.innerHTML = '';
  window.scrollTo(0, 0);
  if (view.name === 'home') return renderHome();
  if (view.name === 'kid') return renderKid();
  if (view.name === 'player') return renderPlayer();
  if (view.name === 'parent') return renderParent();
  if (view.name === 'editKid') return renderEditKid();
  if (view.name === 'search') return renderSearch();
}

/* ---------------- Startbildschirm ---------------- */

function renderHome() {
  setKidColor(null);
  if (!state.kids.length) {
    app.append(h('div', { class: 'empty-home' },
      h('div', {}, 'Noch keine Kinder angelegt.', h('br'), 'Zahnrad unten rechts 3 Sekunden halten oder 5-mal tippen.')));
  } else {
    const wrap = h('div', { class: 'home' });
    for (const kid of state.kids) {
      wrap.append(h('button', {
        class: 'kid-pick', style: `--kid:${kid.color}`,
        onclick: () => { go('kid', { kidId: kid.id }); },
      }, avatar(kid), h('div', { class: 'name' }, kid.name)));
    }
    app.append(wrap);
  }
  app.append(parentGate());
}

function parentGate() {
  // Zwei Wege: 3 Sekunden gedrückt halten ODER 5-mal schnell tippen.
  // Touch- und Maus-Events getrennt, weil iOS Pointer-Events bei langem Drücken abbricht.
  const ring = '<svg class="ring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20"/></svg>';
  const btn = h('div', { class: 'gear', role: 'button', 'aria-label': 'Elternbereich (gedrückt halten)', html: ICON.gear + ring });
  let timer = null;
  let taps = [];
  const open = () => { stop(); taps = []; askParent(); };
  const start = e => {
    if (e.cancelable) e.preventDefault();
    clearTimeout(timer);
    btn.classList.add('holding');
    timer = setTimeout(open, 3000);
    const now = Date.now();
    taps = taps.filter(t => now - t < 2500);
    taps.push(now);
    if (taps.length >= 5) open();
  };
  const stop = () => { btn.classList.remove('holding'); clearTimeout(timer); };
  btn.addEventListener('touchstart', start, { passive: false });
  btn.addEventListener('touchend', stop);
  btn.addEventListener('touchcancel', stop);
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', stop);
  btn.addEventListener('mouseleave', stop);
  btn.addEventListener('contextmenu', e => e.preventDefault());
  return btn;
}

function askParent() {
  const a = 6 + Math.floor(Math.random() * 9);
  const b = 5 + Math.floor(Math.random() * 9);
  const input = h('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off' });
  const close = () => back.remove();
  const check = () => {
    if (Number(input.value) === a + b) { close(); go('parent'); }
    else { input.value = ''; input.style.borderColor = '#C0392B'; input.focus(); }
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
  const back = h('div', { class: 'modal-back' },
    h('div', { class: 'modal' },
      h('h2', {}, 'Elternbereich'),
      h('p', {}, 'Bitte die Aufgabe lösen.'),
      h('div', { class: 'task' }, `${a} + ${b} = ?`),
      input,
      h('div', { class: 'row' },
        h('button', { class: 'btn secondary', onclick: close }, 'Abbrechen'),
        h('button', { class: 'btn', onclick: check }, 'Weiter'))));
  document.body.append(back);
  setTimeout(() => input.focus(), 50);
}

/* ---------------- Favoriten eines Kindes ---------------- */

function renderKid() {
  const kid = kidById(view.kidId);
  if (!kid) return go('home');
  setKidColor(kid);
  app.append(h('div', { class: 'topbar' },
    h('button', { class: 'round-btn', 'aria-label': 'Zurück zum Start', onclick: () => go('home') }, icon('house')),
    avatar(kid)));

  if (!kid.podcasts.length) {
    app.append(h('div', { class: 'no-tiles' }, 'Noch keine Podcasts. Eltern können im Elternbereich welche hinzufügen.'));
    return;
  }
  const grid = h('div', { class: 'tiles' });
  for (const pod of kid.podcasts.slice(0, MAX_TILES)) {
    const img = podImage(pod);
    const isCurrent = player.pod && player.pod.id === pod.id && player.kidId === kid.id;
    const tile = h('button', {
      class: 'tile' + (isCurrent ? ' playing' : ''), 'data-pod': pod.id, 'aria-label': pod.title,
      onclick: () => openPodcast(kid, pod),
    }, h('div', { class: 'fallback' }, (pod.title || '?').charAt(0)));
    if (img) tile.append(h('img', { src: img, alt: '', onerror: e => e.target.remove() }));
    grid.append(tile);
    loadEpisodes(pod); // vorladen, damit der Tipp sofort abspielen kann
  }
  app.append(grid);
}

function refreshTileImages() {
  if (view.name !== 'kid') return;
  const kid = kidById(view.kidId);
  if (!kid) return;
  for (const pod of kid.podcasts) {
    const tile = app.querySelector(`.tile[data-pod="${pod.id}"]`);
    if (tile && !tile.querySelector('img') && podImage(pod)) {
      tile.append(h('img', { src: podImage(pod), alt: '', onerror: e => e.target.remove() }));
    }
  }
}

/* ---------------- Player ---------------- */

const player = {
  kidId: null, pod: null, eps: [], index: -1,
  loading: false, sleepAt: null, lastSave: 0,
};

function epProgress(url) { return state.progress[url] || null; }

function pickEpisodeIndex(pod, eps) {
  const last = state.lastEp[pod.id];
  if (last) {
    const i = eps.findIndex(e => e.url === last);
    if (i >= 0 && !(epProgress(last) || {}).done) return i;
  }
  const i = eps.findIndex(e => !(epProgress(e.url) || {}).done);
  return i >= 0 ? i : 0;
}

async function openPodcast(kid, pod) {
  // Gleicher Podcast wie gerade: nur zum Player wechseln
  if (player.pod && player.pod.id === pod.id && player.kidId === kid.id && audio.src) {
    go('player');
    return;
  }
  player.kidId = kid.id;
  player.pod = pod;
  const cached = readEpCache(pod.id);
  if (cached && cached.eps.length) {
    player.eps = cached.eps;
    loadEpisode(pickEpisodeIndex(pod, cached.eps), true); // direkt im Tipp starten (iOS)
    go('player');
    loadEpisodes(pod).then(eps => { if (player.pod === pod && eps.length) { mergeEpisodes(eps); } });
  } else {
    player.eps = [];
    player.index = -1;
    player.loading = true;
    audio.removeAttribute('src');
    go('player');
    const eps = await loadEpisodes(pod, true);
    if (player.pod !== pod) return;
    player.loading = false;
    player.eps = eps;
    if (eps.length) loadEpisode(pickEpisodeIndex(pod, eps), true);
    renderPlayerIfVisible();
  }
}

function mergeEpisodes(eps) {
  const cur = player.eps[player.index];
  player.eps = eps;
  player.index = cur ? Math.max(0, eps.findIndex(e => e.url === cur.url)) : player.index;
  renderPlayerIfVisible();
}

function loadEpisode(i, autoplay) {
  const ep = player.eps[i];
  if (!ep) return;
  saveProgress(true);
  player.index = i;
  state.lastEp[player.pod.id] = ep.url;
  save();
  const prog = epProgress(ep.url);
  const resumeAt = prog && !prog.done && prog.t > 5 ? prog.t - 3 : 0;
  audio.src = ep.url;
  if (resumeAt) {
    audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = resumeAt; } catch (e) {} }, { once: true });
  }
  updateMediaSession();
  if (autoplay) playAudio();
}

function playAudio() {
  const p = audio.play();
  if (p && p.catch) p.catch(() => updatePlayerUi());
}

function togglePlay() {
  if (!audio.src) {
    if (player.eps.length) loadEpisode(pickEpisodeIndex(player.pod, player.eps), true);
    return;
  }
  if (audio.paused) playAudio(); else audio.pause();
}

function nextEpisode() {
  if (!player.eps.length) return;
  let i = player.eps.findIndex((e, j) => j > player.index && !(epProgress(e.url) || {}).done);
  if (i < 0) i = (player.index + 1) % player.eps.length;
  loadEpisode(i, true);
  renderPlayerIfVisible();
}

function saveProgress(force) {
  const ep = player.eps[player.index];
  if (!ep || !audio.src || !isFinite(audio.currentTime)) return;
  const now = Date.now();
  if (!force && now - player.lastSave < 5000) return;
  player.lastSave = now;
  const prev = state.progress[ep.url] || {};
  const dur = audio.duration;
  const done = prev.done || (isFinite(dur) && dur > 0 && audio.currentTime > dur - 15);
  state.progress[ep.url] = { t: Math.floor(audio.currentTime), done: !!done };
  save();
}

function renderPlayerIfVisible() {
  if (view.name === 'player') render();
}

function renderPlayer() {
  const kid = kidById(player.kidId);
  if (!kid || !player.pod) return go('home');
  setKidColor(kid);
  const pod = player.pod;
  const ep = player.eps[player.index];

  app.append(h('div', { class: 'topbar' },
    h('button', { class: 'round-btn', 'aria-label': 'Zurück zu den Podcasts', onclick: () => go('kid', { kidId: kid.id }) }, icon('grid')),
    avatar(kid)));

  const coverImg = (ep && ep.art) || podImage(pod);
  const cover = h('div', { class: 'cover' + (player.loading ? ' loading' : '') });
  if (coverImg) cover.append(h('img', { src: coverImg, alt: '', onerror: e => { if (e.target.src !== podImage(pod) && podImage(pod)) e.target.src = podImage(pod); } }));

  const bar = h('div', { id: 'bar' });
  const playBtn = h('button', { class: 'play', id: 'playBtn', 'aria-label': 'Abspielen oder Pause', onclick: togglePlay });
  const ctr = h('div', { class: 'controls' }, playBtn);
  if (player.eps.length > 1) {
    ctr.append(h('button', { class: 'next', 'aria-label': 'Nächste Folge', onclick: nextEpisode }, icon('next')));
  }

  const withEps = kid.allowEpisodes && player.eps.length > 1;
  const wrap = h('div', { class: 'player' + (withEps ? ' with-eps' : '') },
    cover,
    h('div', { class: 'progress' }, bar),
    ctr,
    h('div', { class: 'ep-title' }, ep ? ep.title : (player.loading ? '' : 'Gerade keine Folgen gefunden.')));

  if (withEps) {
    const list = h('div', { class: 'episodes' });
    player.eps.slice(0, 20).forEach((e, i) => {
      const thumb = h('div', { class: 'thumb' });
      const src = e.art || podImage(pod);
      if (src) thumb.append(h('img', { src, alt: '', loading: 'lazy' }));
      if ((epProgress(e.url) || {}).done) thumb.append(h('span', { class: 'done', html: ICON.check }));
      list.append(h('button', {
        class: 'ep' + (i === player.index ? ' current' : ''),
        onclick: () => { loadEpisode(i, true); render(); },
      }, thumb, h('span', { class: 't' }, e.title)));
    });
    wrap.append(list);
    requestAnimationFrame(() => {
      const cur = list.querySelector('.ep.current');
      if (cur) list.scrollLeft = Math.max(0, cur.offsetLeft - 20);
    });
  }
  app.append(wrap);
  updatePlayerUi();
}

function updatePlayerUi() {
  const btn = document.getElementById('playBtn');
  if (btn) btn.innerHTML = audio.paused ? ICON.play : ICON.pause;
  const bar = document.getElementById('bar');
  if (bar) {
    const d = audio.duration;
    bar.style.width = isFinite(d) && d > 0 ? `${Math.min(100, (audio.currentTime / d) * 100)}%` : '0%';
  }
}

audio.addEventListener('play', () => {
  updatePlayerUi();
  const mins = Number(state.settings.sleepMinutes) || 0;
  if (mins && !player.sleepAt) player.sleepAt = Date.now() + mins * 60000;
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});
audio.addEventListener('pause', () => {
  updatePlayerUi();
  saveProgress(true);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});
audio.addEventListener('timeupdate', () => {
  updatePlayerUi();
  saveProgress(false);
  if (player.sleepAt && Date.now() > player.sleepAt) {
    player.sleepAt = null;
    audio.pause();
    showSleep();
  }
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && isFinite(audio.duration)) {
    try {
      navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: 1 });
    } catch (e) {}
  }
});
audio.addEventListener('ended', () => {
  const ep = player.eps[player.index];
  if (ep) { state.progress[ep.url] = { t: 0, done: true }; save(); }
  const nextI = player.eps.findIndex((e, j) => j > player.index && !(epProgress(e.url) || {}).done);
  if (nextI >= 0) {
    loadEpisode(nextI, !!state.settings.autoplayNext);
  }
  renderPlayerIfVisible();
});
audio.addEventListener('loadedmetadata', updatePlayerUi);

function showSleep() {
  const ov = h('div', { class: 'sleep-overlay', onclick: () => ov.remove(), html: ICON.moon });
  document.body.append(ov);
}

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const ep = player.eps[player.index];
  const pod = player.pod;
  if (!ep || !pod) return;
  const art = ep.art || pod.image;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: ep.title,
    artist: pod.title,
    artwork: art ? [{ src: art, sizes: '600x600', type: 'image/jpeg' }] : [],
  });
  const ms = navigator.mediaSession;
  try {
    ms.setActionHandler('play', () => playAudio());
    ms.setActionHandler('pause', () => audio.pause());
    ms.setActionHandler('nexttrack', () => nextEpisode());
    ms.setActionHandler('previoustrack', null);
    ms.setActionHandler('seekbackward', null);
    ms.setActionHandler('seekforward', null);
  } catch (e) {}
}

document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(true); });
window.addEventListener('pagehide', () => saveProgress(true));

/* ---------------- Elternbereich ---------------- */

function renderParent() {
  setKidColor(null);
  const root = h('div', { class: 'parent' });
  root.append(h('div', { class: 'p-head' },
    h('h1', {}, 'Elternbereich'),
    h('button', { class: 'btn', onclick: () => go('home') }, 'Fertig')));

  root.append(h('h2', {}, 'Kinder'));
  for (const kid of state.kids) {
    root.append(h('div', { class: 'card kid-row' },
      avatar(kid),
      h('div', { class: 'grow' }, h('b', {}, kid.name), h('span', {}, `${kid.podcasts.length} von ${MAX_TILES} Podcasts`)),
      h('button', { class: 'btn secondary small', onclick: () => go('editKid', { kidId: kid.id }) }, 'Bearbeiten')));
  }
  root.append(h('button', {
    class: 'btn secondary', onclick: () => {
      const kid = { id: 'k' + Date.now(), name: 'Neues Kind', color: COLORS[state.kids.length % COLORS.length], photo: null, allowEpisodes: false, podcasts: [] };
      state.kids.push(kid); save(); go('editKid', { kidId: kid.id });
    },
  }, '+ Kind hinzufügen'));

  root.append(h('h2', {}, 'Wiedergabe'));
  const sleepSel = h('select', { onchange: e => { state.settings.sleepMinutes = Number(e.target.value); player.sleepAt = null; save(); } },
    ...[0, 10, 15, 20, 30, 45, 60].map(m => h('option', { value: m, selected: Number(state.settings.sleepMinutes) === m }, m ? `nach ${m} Minuten` : 'aus')));
  root.append(h('div', { class: 'card' },
    h('label', { class: 'field' }, h('span', {}, 'Schlaf-Timer: Wiedergabe stoppt automatisch'), sleepSel),
    h('label', { class: 'switch' },
      h('span', {}, 'Nach einer Folge automatisch die nächste spielen'),
      h('input', { type: 'checkbox', checked: !!state.settings.autoplayNext, onchange: e => { state.settings.autoplayNext = e.target.checked; save(); } }))));

  root.append(h('h2', {}, 'Am iPhone einrichten'));
  root.append(h('div', { class: 'card hint', html:
    '<b>Auf den Home-Bildschirm:</b> In Safari auf „Teilen“ tippen, dann „Zum Home-Bildschirm“. Danach startet die App im Vollbild.<br><br>' +
    '<b>Kind sperren mit „Geführter Zugriff“:</b> Einstellungen › Bedienungshilfen › Geführter Zugriff einschalten und einen Code festlegen. In der App dreimal die Seitentaste drücken, um zu starten oder zu beenden. Dort kann man auch die Lautstärketasten sperren und ein Zeitlimit setzen.<br><br>' +
    '<b>Lautstärke begrenzen:</b> Das geht bei Web-Apps nicht in der App selbst. Für Kopfhörer: Einstellungen › Töne & Haptik › Kopfhörersicherheit › Laute Töne reduzieren.' }));

  root.append(h('h2', {}, 'Sicherung'));
  const importInput = h('input', { type: 'file', style: 'display:none', onchange: e => importBackup(e.target.files[0]) });
  root.append(h('div', { class: 'card' },
    h('p', { class: 'sub' }, 'Alle Einstellungen, Fotos und der Hörstand liegen nur auf diesem Gerät. Mit einer Sicherung kannst du sie auf ein anderes Gerät mitnehmen.'),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      h('button', { class: 'btn secondary small', onclick: exportBackup }, 'Sicherung speichern'),
      h('button', { class: 'btn secondary small', onclick: () => importInput.click() }, 'Sicherung laden'),
      h('button', { class: 'btn danger small', onclick: resetAll }, 'Alles zurücksetzen')),
    importInput));
  app.append(root);
}

function renderEditKid() {
  const kid = kidById(view.kidId);
  if (!kid) return go('parent');
  setKidColor(kid);
  const root = h('div', { class: 'parent' });
  root.append(h('div', { class: 'p-head' },
    h('h1', {}, kid.name || 'Kind'),
    h('button', { class: 'btn', onclick: () => go('parent') }, 'Zurück')));

  const photoInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    kid.photo = await resizeImage(f, 360); save(); render();
  } });
  root.append(h('div', { class: 'card' },
    h('div', { class: 'photo-edit' }, avatar(kid),
      h('div', { style: 'display:flex;flex-direction:column;gap:8px' },
        h('button', { class: 'btn secondary small', onclick: () => photoInput.click() }, kid.photo ? 'Foto ändern' : 'Foto wählen'),
        kid.photo ? h('button', { class: 'btn secondary small', onclick: () => { kid.photo = null; save(); render(); } }, 'Foto entfernen') : null),
      photoInput),
    h('label', { class: 'field' }, h('span', {}, 'Name'),
      h('input', { type: 'text', value: kid.name, maxlength: 20, onchange: e => { kid.name = e.target.value.trim() || 'Kind'; save(); render(); } })),
    h('div', { class: 'field' }, h('span', {}, 'Farbe'),
      h('div', { class: 'swatches' }, ...COLORS.map(c => h('button', {
        class: 'swatch' + (kid.color === c ? ' on' : ''), style: `background:${c}`, 'aria-label': 'Farbe ' + c,
        onclick: () => { kid.color = c; save(); render(); },
      })))),
    h('label', { class: 'switch' },
      h('span', {}, 'Darf Folgen selbst auswählen (Folgenleiste im Player)'),
      h('input', { type: 'checkbox', checked: !!kid.allowEpisodes, onchange: e => { kid.allowEpisodes = e.target.checked; save(); } }))));

  root.append(h('div', { class: 'p-head' },
    h('h2', {}, `Podcasts (${kid.podcasts.length}/${MAX_TILES})`),
    h('button', { class: 'btn small', disabled: kid.podcasts.length >= MAX_TILES, onclick: () => go('search', { kidId: kid.id }) }, '+ Hinzufügen')));

  const list = h('div', { class: 'card' });
  if (!kid.podcasts.length) list.append(h('p', { class: 'sub' }, 'Noch keine Podcasts.'));
  kid.podcasts.forEach((pod, i) => {
    const imgInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      pod.customImage = await resizeImage(f, 480); save(); render();
    } });
    const img = podImage(pod);
    list.append(h('div', { class: 'pod-row' },
      img ? h('img', { src: img, alt: '' }) : h('div', { class: 'ph' }),
      h('div', { class: 'grow' }, h('b', {}, pod.title), h('span', {}, pod.artist || ''),
        pod.customImage ? h('span', {}, 'eigenes Bild') : null),
      h('div', { class: 'pod-actions' },
        h('button', { class: 'btn secondary small', disabled: i === 0, 'aria-label': 'Nach vorne', onclick: () => { move(kid.podcasts, i, -1); save(); render(); } }, '↑'),
        h('button', { class: 'btn secondary small', disabled: i === kid.podcasts.length - 1, 'aria-label': 'Nach hinten', onclick: () => { move(kid.podcasts, i, 1); save(); render(); } }, '↓'),
        h('button', { class: 'btn secondary small', onclick: () => imgInput.click() }, 'Bild'),
        pod.customImage ? h('button', { class: 'btn secondary small', onclick: () => { pod.customImage = null; save(); render(); } }, 'Original') : null,
        h('button', { class: 'btn danger small', onclick: () => { kid.podcasts.splice(i, 1); save(); render(); } }, 'Entfernen')),
      imgInput));
    if (!pod.image) loadEpisodes(pod);
  });
  root.append(list);

  root.append(h('div', { style: 'margin-top:28px' },
    h('button', { class: 'btn danger', onclick: () => {
      if (!confirm(`${kid.name} wirklich löschen?`)) return;
      state.kids = state.kids.filter(k => k !== kid); save(); go('parent');
    } }, 'Kind löschen')));
  app.append(root);
}

function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

function renderSearch() {
  const kid = kidById(view.kidId);
  if (!kid) return go('parent');
  const root = h('div', { class: 'parent' });
  const results = h('div', { class: 'card' }, h('p', { class: 'sub' }, 'Name eines Podcasts eingeben, z. B. „Ohrenbär“, „Kakadu“, „Sandmännchen“, „Pumuckl“.'));
  const status = h('div', { class: 'status' });
  let seq = 0;
  const run = async term => {
    term = term.trim();
    if (term.length < 2) return;
    const my = ++seq;
    status.textContent = 'Suche …';
    try {
      const data = await itunes('search', { media: 'podcast', limit: 25, term });
      if (my !== seq) return;
      status.textContent = data.results.length ? '' : 'Nichts gefunden.';
      results.innerHTML = '';
      for (const r of data.results) {
        const already = kid.podcasts.some(p => p.id === r.collectionId);
        const full = kid.podcasts.length >= MAX_TILES;
        results.append(h('div', { class: 'pod-row' },
          h('img', { src: r.artworkUrl100 || r.artworkUrl60, alt: '' }),
          h('div', { class: 'grow' }, h('b', {}, r.collectionName), h('span', {}, `${r.artistName || ''} · ${r.trackCount || '?'} Folgen`)),
          h('button', {
            class: 'btn small', disabled: already || full,
            onclick: () => {
              kid.podcasts.push({ id: r.collectionId, title: r.collectionName, artist: r.artistName || '', image: r.artworkUrl600 || r.artworkUrl100 });
              save();
              go('editKid', { kidId: kid.id });
            },
          }, already ? 'Schon da' : (full ? 'Voll' : 'Hinzufügen'))));
      }
    } catch (e) {
      if (my === seq) status.textContent = 'Suche hat nicht geklappt. Ist das iPhone online?';
    }
  };
  let t = null;
  const input = h('input', { type: 'search', placeholder: 'Podcast suchen', enterkeyhint: 'search',
    oninput: e => { clearTimeout(t); t = setTimeout(() => run(e.target.value), 400); },
    onkeydown: e => { if (e.key === 'Enter') { clearTimeout(t); run(e.target.value); e.target.blur(); } } });
  root.append(h('div', { class: 'p-head' },
    h('h1', {}, 'Podcast hinzufügen'),
    h('button', { class: 'btn secondary', onclick: () => go('editKid', { kidId: kid.id }) }, 'Abbrechen')));
  root.append(h('p', { class: 'sub' }, `für ${kid.name}`));
  root.append(h('label', { class: 'field' }, input), status, results);
  app.append(root);
  setTimeout(() => input.focus(), 50);
}

/* ---------------- Bilder, Sicherung ---------------- */

function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - s) / 2;
      const sy = (img.naturalHeight - s) / 2;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, sx, sy, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'hoerhaus-sicherung.json' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function importBackup(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (!Array.isArray(s.kids)) throw new Error();
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
      state = load();
      alertSoft('Sicherung geladen.');
      render();
    } catch (e) {
      alertSoft('Diese Datei ist keine gültige Sicherung.');
    }
  };
  r.readAsText(file);
}

function resetAll() {
  if (!confirm('Wirklich alles zurücksetzen? Fotos, Favoriten und Hörstand werden gelöscht.')) return;
  audio.pause();
  audio.removeAttribute('src');
  Object.keys(localStorage).filter(k => k.startsWith('hoerhaus.')).forEach(k => localStorage.removeItem(k));
  state = load();
  player.pod = null;
  go('home');
}

/* ---------------- Start ---------------- */

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
