// Точка входа: каркас, навигация, выбор даты, перерисовка, обновления приложения.
import { SPRITE } from './icons.js';
import { load, onChange, S, all } from './store.js';
import { h, icon, ibtn, toast } from './ui.js';
import { today, addDays, fmtDate, weekday } from './calc.js';
import * as sync from './sync.js';
import { keepAwake } from './timer.js';
import * as todayV from './views/today.js';
import * as habitsV from './views/habits.js';
import * as foodV from './views/food.js';
import * as workoutV from './views/workout.js';
import * as statsV from './views/stats.js';
import * as settingsV from './views/settings.js';

const ROUTES = {
  today: { v: todayV, t: 'Сегодня', ic: 'home', dated: true },
  habits: { v: habitsV, t: 'Рутина', ic: 'list-check', dated: true },
  food: { v: foodV, t: 'Еда', ic: 'salad', dated: true },
  workout: { v: workoutV, t: 'Тренировка', ic: 'barbell' },
  stats: { v: statsV, t: 'Статистика', ic: 'chart-line' },
  settings: { v: settingsV, t: 'Настройки', ic: 'settings', hidden: true },
};
const ctx = {
  date: today(), route: 'today',
  go(r) { location.hash = r; },
  setDate(d) { ctx.date = d > today() ? today() : d; render(); },
  render: () => render(),
};

function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function renderTabs() {
  const nav = document.getElementById('tabs');
  nav.replaceChildren(h('div', { class: 'brand' }, 'Подход'),
    ...Object.entries(ROUTES).filter(([, r]) => !r.hidden).map(([k, r]) =>
      h('a', { href: '#' + k, class: ctx.route === k ? 'on' : '', 'aria-current': ctx.route === k ? 'page' : null }, icon(r.ic), r.t)));
}

function syncIcon() {
  const s = sync.st;
  if (!s.on) return null;
  const map = { syncing: ['refresh', 'Синхронизация…'], error: ['cloud-off', s.msg], offline: ['cloud-off', s.msg], idle: ['cloud', 'Синхронизировано'] };
  const [ic, label] = map[s.state] || map.idle;
  return h('button', { class: 'ibtn', type: 'button', title: label, 'aria-label': label, onclick: () => (s.state === 'error' ? toast(s.msg) : sync.syncNow()), style: s.state === 'error' ? 'color:var(--red)' : 'color:var(--muted)' }, icon(ic));
}

function renderTop() {
  const r = ROUTES[ctx.route], top = document.getElementById('top');
  const isToday = ctx.date === today();
  const left = r.dated ? ibtn('chevron-left', () => ctx.setDate(addDays(ctx.date, -1)), 'Предыдущий день')
    : ctx.route === 'settings' ? ibtn('chevron-left', () => history.length > 1 ? history.back() : ctx.go('today'), 'Назад') : h('span', { style: 'width:40px' });
  const title = r.dated
    ? h('div', { class: 'title' }, h('b', null, isToday ? r.t === 'Сегодня' ? 'Сегодня' : r.t : fmtDate(ctx.date)),
      h('span', null, isToday ? `${fmtDate(ctx.date)}, ${weekday(ctx.date)}` : `${r.t} · ${weekday(ctx.date)}`))
    : h('div', { class: 'title' }, h('b', null, r.t));
  const right = r.dated
    ? (isToday ? ibtn('chevron-right', null, 'Следующий день', { disabled: true }) : ibtn('chevron-right', () => ctx.setDate(addDays(ctx.date, 1)), 'Следующий день'))
    : null;
  top.replaceChildren(...[left, title, right,
    !isToday && r.dated ? h('button', { class: 'btn sm soft', type: 'button', onclick: () => ctx.setDate(today()) }, 'Сегодня') : null,
    syncIcon(),
    ctx.route !== 'settings' ? ibtn('settings', () => ctx.go('settings'), 'Настройки') : null].filter(Boolean));
}

let pending = false, frame = 0;
function render() {
  const main = document.getElementById('main');
  const a = document.activeElement;
  if (a && main.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox') { pending = true; return; }
  pending = false;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    applyTheme(); renderTabs(); renderTop();
    const r = ROUTES[ctx.route];
    const frag = document.createDocumentFragment();
    try { frag.append(r.v.render(ctx)); }
    catch (e) { console.error(e); frag.append(h('div', { class: 'banner' }, icon('alert-triangle'), 'Ошибка отображения: ' + e.message)); }
    main.replaceChildren(frag);
    keepAwake(S.settings.wakeLock && all('wo', w => w.active).length > 0);
  });
}

function route() {
  const hsh = location.hash.slice(1);
  if (hsh.startsWith('join=')) {
    settingsV.setJoinCode(hsh.slice(5));
    history.replaceState(null, '', location.pathname + '#settings');
    ctx.route = 'settings';
  } else ctx.route = ROUTES[hsh] ? hsh : 'today';
  window.scrollTo(0, 0);
  render();
}

// Свайп влево/вправо по экрану меняет день (на экранах с датой).
function swipe() {
  let x0 = null, y0 = 0, t0 = 0;
  const main = document.getElementById('main');
  main.addEventListener('touchstart', e => {
    const t = e.target;
    if (!ROUTES[ctx.route].dated || t.closest('input,textarea,.heat,.stepper,.chips,.sheet')) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  main.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - t0 < 600) ctx.setDate(addDays(ctx.date, dx > 0 ? -1 : 1));
  }, { passive: true });
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (had) toast('Приложение обновлено.', 'Перезапустить', () => location.reload(), 15000);
  });
}

async function start() {
  document.body.insertAdjacentHTML('afterbegin', SPRITE);
  await load();
  onChange(() => render());
  sync.onStatus(() => renderTop());
  document.getElementById('main').addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { if (ctx.date > today()) ctx.date = today(); render(); }
  });
  addEventListener('hashchange', route);
  swipe();
  route();
  sync.init();
  registerSW();
  // Обновлять «прошло минут» во время тренировки
  setInterval(() => document.querySelectorAll('[data-since]').forEach(el => {
    el.textContent = Math.max(0, Math.round((Date.now() - +el.dataset.since) / 60000)) + ' мин';
  }), 20000);
}
start();
