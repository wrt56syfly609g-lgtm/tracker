// База продуктов: встроенная таблица + свои продукты и блюда (коллекция prod, синхронизируется).
// Правка встроенного продукта сохраняется как запись prod с тем же id и перекрывает исходные значения.
import { S, rev, all, get, put, remove } from './store.js';
import { DATA } from './foods-data.js';

export const NUTR = ['kcal', 'p', 'f', 'c', 'fb'];
export const MY_CAT = 'Мои продукты';
export const CATS = [...Object.keys(DATA), MY_CAT];

export const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const r1 = v => Math.round(v * 10) / 10;
const n0 = v => (v == null || Number.isNaN(+v) ? 0 : +v);

export const BASE = [];
for (const [cat, rows] of Object.entries(DATA)) {
  for (const [name, kcal, p, f, c, fb, x = {}] of rows) {
    BASE.push({ id: 'b:' + norm(name), name, kcal, p, f, c, fb, cat, pc: x.pc ?? null, u: x.u ?? null, a: x.a ?? '' });
  }
}
const BASE_BY_ID = new Map(BASE.map(b => [b.id, b]));
export const baseOf = id => BASE_BY_ID.get(id) || null;

// Слова для поиска: название + синонимы + раздел (чтобы «сыр» находил качотту, а «рыба» — минтай).
function indexed(x) {
  const nw = norm(x.name).split(' ').filter(Boolean);
  const aw = norm(x.a + ' ' + (x.cat || '')).split(' ').filter(w => w.length > 1);
  return { ...x, nw, w: [...nw, ...aw] };
}

let cache = { rev: -1, list: [], byId: new Map(), use: {} };
function build() {
  if (cache.rev === rev && cache.S === S) return cache;
  const list = [], byId = new Map();
  for (const b of BASE) {
    const o = get('prod', b.id);
    list.push(indexed(o ? { ...b, ...o, id: b.id, edited: true } : b));
  }
  for (const r of all('prod')) {
    if (BASE_BY_ID.has(r.id)) continue;
    list.push(indexed({ cat: MY_CAT, ...r, user: true }));
  }
  for (const x of list) byId.set(x.id, x);
  // Частота использования: чем чаще продукт записывали, тем выше он в подсказках.
  const use = {};
  for (const e of all('food')) if (e.pid) use[e.pid] = (use[e.pid] || 0) + 1;
  cache = { rev, S, list, byId, use };
  return cache;
}
export const products = () => build().list;
export const product = id => (id ? build().byId.get(id) || null : null);
export const useCount = id => build().use[id] || 0;

// Укорачиваем слово запроса, чтобы «гречки», «крыльев», «яйца» находили «гречка», «крылья», «яйцо».
export function stem(t) {
  if (t.length >= 6) return t.slice(0, -2);
  if (t.length >= 4) return t.slice(0, -1);
  return t;
}

export function search(q, limit = 8, list = products()) {
  const qt = norm(q).split(' ').filter(Boolean);
  if (!qt.length) return [];
  const { use } = build();
  const out = [];
  for (const x of list) {
    let score = 0, ok = true;
    for (const t of qt) {
      const st = stem(t);
      let s = 0;
      for (const w of x.w) {
        if (w === t) { s = 3; break; }
        if (w.startsWith(t)) s = Math.max(s, 2);
        // по основе слова: «гречки» ближе к «гречка», чем к «греческий»
        else if (/[a-zа-я]/.test(t) && st.length >= 3 && w.startsWith(st)) s = Math.max(s, Math.abs(w.length - t.length) <= 1 ? 1.5 : 1);
      }
      if (!s) { ok = false; break; }
      score += s;
    }
    if (!ok) continue;
    if (x.nw[0] && (x.nw[0].startsWith(qt[0]) || x.nw[0].startsWith(stem(qt[0])))) score += 2;
    if (x.user) score += 1.5;
    score += Math.min(3, (use[x.id] || 0) * 0.5);
    score -= x.nw.length * 0.08;
    out.push([score, x]);
  }
  return out.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name, 'ru', { numeric: true })).slice(0, limit).map(r => r[1]);
}

// Точное совпадение по названию (без учёта регистра и ё).
export function byName(name) {
  const n = norm(name);
  return n ? products().find(x => norm(x.name) === n) || null : null;
}

// КБЖУ и клетчатка для порции в граммах по значениям на 100 г.
export function portion(per, g) {
  const k = n0(g) / 100;
  return { kcal: Math.round(n0(per.kcal) * k), p: r1(n0(per.p) * k), f: r1(n0(per.f) * k), c: r1(n0(per.c) * k), fb: r1(n0(per.fb) * k) };
}
export const perOf = x => ({ kcal: n0(x.kcal), p: n0(x.p), f: n0(x.f), c: n0(x.c), fb: n0(x.fb) });

// Блюдо из ингредиентов: суммы и значения на 100 г готового блюда.
// items: [{ per: {kcal,p,f,c,fb}, g }], cooked — вес готового блюда (если пусто, берётся сумма ингредиентов).
export function dish(items, cooked) {
  const tot = { kcal: 0, p: 0, f: 0, c: 0, fb: 0 };
  let raw = 0;
  for (const it of items) {
    const g = n0(it.g);
    if (!it.per || g <= 0) continue;
    raw += g;
    for (const k of NUTR) tot[k] += n0(it.per[k]) * g / 100;
  }
  const W = n0(cooked) > 0 ? n0(cooked) : raw;
  const per = { kcal: 0, p: 0, f: 0, c: 0, fb: 0 };
  if (W > 0) for (const k of NUTR) per[k] = k === 'kcal' ? Math.round(tot[k] * 100 / W) : r1(tot[k] * 100 / W);
  for (const k of NUTR) tot[k] = k === 'kcal' ? Math.round(tot[k]) : r1(tot[k]);
  return { tot, raw, weight: W, per };
}

// Количество в строке: «80 г», «0,5 кг», «200 мл», «2 шт», «1 пачка». Возвращает текст без количества.
const UNIT_G = /^(г|гр|грамм|грамма|граммов|g|мл|ml)$/;
const UNIT_KG = /^(кг|kg|л|l)$/;
const UNIT_PC = /^(шт|штук|штука|штуки|пачка|пачки|пачек|уп|упаковка|порция|порции|порций|ломтик|ломтика|ломтиков|стакан|стакана|чашка|банка|ст|ч)$/;
export function parseQty(text) {
  const s = String(text || '').trim();
  const rx = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*([a-zа-яё]+)\.?(?=\s|$)/gi;
  let m, found = null;
  while ((m = rx.exec(s))) {
    const u = m[2].toLowerCase().replace('ё', 'е');
    if (UNIT_G.test(u) || UNIT_KG.test(u) || UNIT_PC.test(u)) found = { m, u };
  }
  if (!found) return { q: s, g: null, n: null };
  const v = parseFloat(found.m[1].replace(',', '.'));
  const q = (s.slice(0, found.m.index) + ' ' + s.slice(found.m.index + found.m[0].length)).replace(/\s+/g, ' ').trim().replace(/(?:^|\s)л\.?$/i, '').trim();
  if (UNIT_G.test(found.u)) return { q, g: v, n: null };
  if (UNIT_KG.test(found.u)) return { q, g: v * 1000, n: null };
  return { q, g: null, n: v };
}

/* ---------- сохранение ---------- */
export function saveProduct(id, data) {
  const rec = {
    name: String(data.name || '').trim(), cat: data.cat || MY_CAT,
    kcal: n0(data.kcal), p: n0(data.p), f: n0(data.f), c: n0(data.c), fb: n0(data.fb),
    pc: n0(data.pc) > 0 ? n0(data.pc) : null, u: (data.u || '').trim() || null, a: (data.a || '').trim(),
    items: data.items?.length ? data.items : null, cooked: n0(data.cooked) > 0 ? n0(data.cooked) : null,
  };
  if (!rec.kcal && (rec.p || rec.f || rec.c)) rec.kcal = Math.round(rec.p * 4 + rec.f * 9 + rec.c * 4);
  const old = id ? S.prod[id] : null;
  return put('prod', old ? Object.assign(old, rec, { deleted: false }) : { ...(id ? { id } : {}), ...rec });
}
// Встроенный продукт: вернуть исходные значения. Свой: удалить. Возвращает функцию «вернуть».
export const removeProduct = id => remove('prod', id);
