// Таймер отдыха между подходами + удержание экрана во время тренировки.
import { S } from './store.js';
import { h } from './ui.js';

let endsAt = 0, total = 0, iv = null, beeped = false, actx = null, lock = null;
const el = () => document.getElementById('rest');
const fmt = s => { const a = Math.abs(s); return (s < 0 ? '+' : '') + Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0'); };

export function unlockAudio() {
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { actx = null; }
}
function beep() {
  if (S.settings.vibrate && navigator.vibrate) navigator.vibrate([250, 120, 250]);
  if (!S.settings.sound || !actx) return;
  [0, 0.25].forEach(t => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.0001, actx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.3, actx.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + t + 0.18);
    o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.2);
  });
}

// Таймер хранится и на устройстве: если Android выгрузит приложение во время отдыха, после открытия он продолжится.
const KEY = 'podhod-rest';
const remember = () => { try { localStorage.setItem(KEY, JSON.stringify({ endsAt, total })); } catch { /* не критично */ } };
const forget = () => { try { localStorage.removeItem(KEY); } catch { /* не критично */ } };

export function startRest(sec) {
  unlockAudio();
  total = sec; endsAt = Date.now() + sec * 1000; beeped = false;
  remember();
  clearInterval(iv); iv = setInterval(tick, 250); tick();
}
export const addRest = s => { endsAt += s * 1000; total = Math.max(total + s, 1); if (endsAt > Date.now()) beeped = false; remember(); tick(); };
export function stopRest() { clearInterval(iv); iv = null; forget(); const e = el(); if (e) e.hidden = true; document.body.classList.remove('resting'); }

// Продолжить таймер после перезапуска приложения (только если идёт тренировка).
export function resumeRest(active) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; }
  if (!saved) return;
  if (!active || !(saved.endsAt > Date.now() - 120000)) { forget(); return; }
  endsAt = saved.endsAt; total = Math.max(1, saved.total || 1);
  beeped = endsAt <= Date.now(); // время вышло, пока приложение было закрыто: без запоздалого сигнала
  clearInterval(iv); iv = setInterval(tick, 250); tick();
}

function tick() {
  const e = el(); if (!e) return;
  const left = Math.round((endsAt - Date.now()) / 1000);
  if (left <= 0 && !beeped) { beeped = true; beep(); }
  if (left < -120) { stopRest(); return; }
  if (!e.firstChild) e.append(
    h('span', { class: 'time' }),
    h('div', { class: 'bar' }, h('i')),
    h('button', { type: 'button', onclick: () => addRest(-15), 'aria-label': 'Минус 15 секунд' }, '−15'),
    h('button', { type: 'button', onclick: () => addRest(15), 'aria-label': 'Плюс 15 секунд' }, '+15'),
    h('button', { type: 'button', onclick: stopRest, 'aria-label': 'Закрыть таймер' }, '✕'),
  );
  e.hidden = false;
  document.body.classList.add('resting');
  e.classList.toggle('over', left <= 0);
  e.querySelector('.time').textContent = left > 0 ? fmt(left) : 'Пора!';
  e.querySelector('.bar > i').style.width = Math.max(0, Math.min(100, (left / total) * 100)) + '%';
}

export async function keepAwake(on) {
  try {
    if (on && !lock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}
