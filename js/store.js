// Данные приложения: состояние в памяти + IndexedDB на устройстве.
// Каждая запись имеет id и u (время последнего изменения). Удаление = пометка deleted.
// Так две копии (телефон и ПК) сливаются по записям: побеждает более свежая правка.

const DB = 'podhod', ST = 'kv';
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = (mode, fn) => db().then(d => new Promise((res, rej) => {
  const t = d.transaction(ST, mode); const q = fn(t.objectStore(ST));
  t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
}));
export const kvGet = k => tx('readonly', s => s.get(k));
export const kvSet = (k, v) => tx('readwrite', s => s.put(v, k));
export const kvDel = k => tx('readwrite', s => s.delete(k));

export const COLS = ['habits', 'hlog', 'food', 'days', 'ex', 'tpl', 'wo'];
export const OBJS = ['profile', 'settings'];
export const MUSCLES = ['Грудь', 'Спина', 'Ноги', 'Плечи', 'Руки', 'Предплечья', 'Кор'];

export let S = null;   // текущее состояние
export let rev = 0;    // номер версии в памяти (для кэша расчётов)
const subs = new Set();
export const onChange = fn => subs.add(fn);
let saveT = null, syncHook = null;
export const setSyncHook = fn => { syncHook = fn; };

function changed(local = true) {
  rev++;
  clearTimeout(saveT);
  saveT = setTimeout(() => kvSet('state', S).catch(console.error), 200);
  subs.forEach(f => f());
  if (local && syncHook) syncHook();
}
export async function flush() { clearTimeout(saveT); await kvSet('state', S); }

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const all = (col, fn) => Object.values(S[col]).filter(r => !r.deleted && (!fn || fn(r)));
export const get = (col, id) => { const r = S[col][id]; return r && !r.deleted ? r : null; };
export function put(col, rec) {
  if (!rec.id) rec.id = uid();
  rec.u = Date.now();
  S[col][rec.id] = rec;
  changed();
  return rec;
}
export const patch = (col, id, p) => put(col, Object.assign(S[col][id], p));
// Возвращает функцию «вернуть».
export function remove(col, id) {
  const r = S[col][id]; if (!r) return () => {};
  r.deleted = true; r.u = Date.now(); changed();
  return () => { r.deleted = false; r.u = Date.now(); changed(); };
}
export function setObj(name, p) { Object.assign(S[name], p, { u: Date.now() }); changed(); }

export function merge(a, b) {
  const out = { v: 1 };
  for (const k of OBJS) out[k] = (b[k]?.u || 0) > (a[k]?.u || 0) ? b[k] : a[k];
  for (const c of COLS) {
    const m = { ...(a[c] || {}) };
    for (const [id, r] of Object.entries(b[c] || {})) if (!m[id] || (r.u || 0) > (m[id].u || 0)) m[id] = r;
    out[c] = m;
  }
  return out;
}
export function same(a, b) {
  for (const k of OBJS) if ((a[k]?.u || 0) !== (b[k]?.u || 0)) return false;
  for (const c of COLS) {
    const x = a[c] || {}, y = b[c] || {}, kx = Object.keys(x);
    if (kx.length !== Object.keys(y).length) return false;
    for (const id of kx) if (!y[id] || y[id].u !== x[id].u) return false;
  }
  return true;
}
export function replace(next, local = false) { S = next; normalize(); changed(local); }

export async function load() {
  let s = null;
  try { s = await kvGet('state'); } catch (e) { console.error(e); }
  S = s || seed();
  normalize();
  if (!s) { try { await flush(); } catch (e) { console.error(e); } }
  try { navigator.storage?.persist?.(); } catch { /* не критично */ }
}

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function defaults() {
  return {
    profile: {
      u: 0, height: 170, weight: 75.5, bodyFat: 21, weightDate: todayIso(), autoWeight: true,
      activity: 1.2, passiveOverride: null, goal: 'maintain',
      kcalOverride: null, pOverride: null, fOverride: null, cOverride: null, met: 5,
    },
    settings: { u: 0, rest: 120, sound: true, vibrate: true, wakeLock: true, step: 2.5, theme: 'auto' },
  };
}
function normalize() {
  const d = defaults();
  for (const k of OBJS) S[k] = { ...d[k], ...(S[k] || {}) };
  for (const c of COLS) S[c] ||= {};
  S.v = 1;
}

// Стартовые данные. id фиксированные, чтобы на втором устройстве они не задвоились при слиянии.
function seed() {
  const c = todayIso(), s = { v: 1 };
  for (const k of COLS) s[k] = {};
  const hb = (id, name, group, icon, o, extra = {}) => { s.habits[id] = { id, u: 1, name, group, icon, order: o, measure: 'check', c, ...extra }; };
  hb('h-train', 'Тренировка', 'routine', 'barbell', 0, { perWeek: 3, auto: 'workout' });
  hb('h-draw', 'Рисование', 'routine', 'brush', 1, { measure: 'qty', unit: 'мин', target: 30, qstep: 10 });
  hb('h-teeth', 'Почистить зубы', 'daily', 'dental', 10);
  hb('h-wash', 'Умыться', 'daily', 'droplet', 11);
  hb('h-shower', 'Помыться', 'daily', 'bath', 12);
  hb('h-clean', 'Убраться', 'daily', 'vacuum-cleaner', 13);
  hb('h-creatine', 'Креатин', 'supp', 'pill', 20);
  hb('h-vitd', 'Витамин D', 'supp', 'sun', 21);
  const ex = (id, name, muscle, rest = null) => { s.ex[id] = { id, u: 1, name, muscle, rest, step: null }; };
  ex('ex-bench', 'Жим штанги лёжа', 'Грудь', 180); ex('ex-incline', 'Жим гантелей на наклонной', 'Грудь');
  ex('ex-dips', 'Отжимания на брусьях', 'Грудь'); ex('ex-fly', 'Разведения гантелей', 'Грудь');
  ex('ex-deadlift', 'Становая тяга', 'Спина', 180); ex('ex-row', 'Тяга штанги в наклоне', 'Спина', 150);
  ex('ex-pullup', 'Подтягивания', 'Спина', 150); ex('ex-latpull', 'Тяга верхнего блока', 'Спина');
  ex('ex-cablerow', 'Тяга горизонтального блока', 'Спина');
  ex('ex-squat', 'Приседания со штангой', 'Ноги', 180); ex('ex-legpress', 'Жим ногами', 'Ноги');
  ex('ex-rdl', 'Румынская тяга', 'Ноги', 150); ex('ex-lunge', 'Выпады с гантелями', 'Ноги');
  ex('ex-legcurl', 'Сгибания ног в тренажёре', 'Ноги'); ex('ex-calf', 'Подъёмы на носки', 'Ноги', 90);
  ex('ex-ohp', 'Жим штанги стоя', 'Плечи', 150); ex('ex-lateral', 'Махи гантелями в стороны', 'Плечи', 90);
  ex('ex-facepull', 'Тяга к лицу', 'Плечи', 90);
  ex('ex-curl', 'Подъём штанги на бицепс', 'Руки', 90); ex('ex-hammer', 'Молотки с гантелями', 'Руки', 90);
  ex('ex-triceps', 'Разгибания на блоке', 'Руки', 90); ex('ex-french', 'Французский жим', 'Руки', 90);
  ex('ex-crunch', 'Скручивания', 'Кор', 60); ex('ex-legraise', 'Подъёмы ног в висе', 'Кор', 60);
  const tp = (id, name, list) => { s.tpl[id] = { id, u: 1, name, items: list.map(e => ({ ex: e, sets: 3 })) }; };
  tp('tpl-upper', 'Верх тела (пример)', ['ex-bench', 'ex-row', 'ex-ohp', 'ex-latpull', 'ex-curl', 'ex-triceps']);
  tp('tpl-lower', 'Низ тела (пример)', ['ex-squat', 'ex-rdl', 'ex-legpress', 'ex-legcurl', 'ex-calf', 'ex-crunch']);
  return s;
}
