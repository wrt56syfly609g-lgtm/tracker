// Расчёты: даты, калории, модель веса и % жира, серии привычек, силовые показатели.
import { S, rev, all } from './store.js';

export const KJ = 4.184;          // 1 ккал = 4,184 кДж
export const KCAL_PER_KG = 7700;  // средняя модель: ~7700 ккал на 1 кг массы тела
export const FAT_SHARE_LOSS = 0.75, FAT_SHARE_GAIN = 0.5;

/* ---------- даты (строки ГГГГ-ММ-ДД, местное время) ---------- */
const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const weekStart = s => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
export const monthStart = s => s.slice(0, 8) + '01';
export const monthEnd = s => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return iso(d); };
export const addMonths = (s, n) => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + n); return iso(d); };
export function range(a, b) { const r = []; for (let s = a; s <= b; s = addDays(s, 1)) r.push(s); return r; }
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export const fmtDate = s => { const d = parse(s); return `${d.getDate()} ${MON[d.getMonth()]}`; };
export const weekday = s => WD[parse(s).getDay()];
export const fmtShort = s => { const d = parse(s); return `${d.getDate()}.${pad(d.getMonth() + 1)}`; };
export const hhmm = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const nowHHMM = () => hhmm(Date.now());

/* ---------- числа ---------- */
export const num = (v, d = 0) => v == null || Number.isNaN(+v) ? '—'
  : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const signed = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), d);
export const parseNum = s => {
  if (s == null || s === '') return null;
  const v = parseFloat(String(s).replace(',', '.').replace(/\s/g, ''));
  return Number.isNaN(v) ? null : v;
};
export const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const kcalFromMacros = (p, f, c) => (p || 0) * 4 + (f || 0) * 9 + (c || 0) * 4;

/* ---------- индексы по датам (пересчитываются при изменении данных) ---------- */
let ix = { rev: -1 };
export function idx() {
  if (ix.rev === rev) return ix;
  const food = {}, wo = {};
  for (const f of all('food')) (food[f.date] ||= []).push(f);
  for (const w of all('wo', w => !w.active)) (wo[w.date] ||= []).push(w);
  ix = { rev, food, wo, model: null };
  return ix;
}
export const foodOn = d => (idx().food[d] || []).slice().sort((a, b) => (a.t || '').localeCompare(b.t || ''));
export const workoutsOn = d => idx().wo[d] || [];
export function totals(d) {
  const t = { kcal: 0, p: 0, f: 0, c: 0, n: 0 };
  for (const x of idx().food[d] || []) { t.kcal += +x.kcal || 0; t.p += +x.p || 0; t.f += +x.f || 0; t.c += +x.c || 0; t.n++; }
  return t;
}

/* ---------- энергия ---------- */
// Базовый обмен по Кэтчу–МакАрдлу: 370 + 21,6 × масса без жира.
export const bmr = (w, bf) => 370 + 21.6 * w * (1 - bf / 100);
export const passiveFor = (w, bf) => S.profile.passiveOverride ?? Math.round(bmr(w, bf) * S.profile.activity);
export function woMinutes(w) {
  const end = w.end || Date.now();
  return Math.max(0, Math.min(240, Math.round((end - w.start) / 60000)));
}
export const woKcalAuto = (w, kg) => Math.round(S.profile.met * kg * woMinutes(w) / 60);
export const woKcal = (w, kg) => w.kcal ?? woKcalAuto(w, kg);

function calcDay(d, w, bf) {
  const t = totals(d);
  const p = S.profile, useW = p.autoWeight ? w : p.weight, useBf = p.autoWeight ? bf : p.bodyFat;
  const train = workoutsOn(d).reduce((s, x) => s + woKcal(x, useW), 0);
  const passive = passiveFor(useW, useBf);
  return { d, w, bf, passive, train, burned: passive + train, eaten: t.kcal, bal: t.kcal - passive - train, logged: t.n > 0, t };
}

// Модель веса: от последнего ввода веса идём по дням и прибавляем баланс / 7700.
// Учитываются только дни, где записана еда, и только завершённые (до сегодня).
export function model() {
  const I = idx();
  if (I.model) return I.model;
  const p = S.profile, end = today(), days = {};
  let w = p.weight, bf = p.bodyFat, fm = w * bf / 100;
  if (p.weightDate <= end) {
    for (const d of range(p.weightDate, end)) {
      const e = calcDay(d, w, bf);
      days[d] = e;
      if (e.logged && d < end) {
        const dw = e.bal / KCAL_PER_KG;
        fm += dw * (dw < 0 ? FAT_SHARE_LOSS : FAT_SHARE_GAIN);
        w += dw; bf = Math.max(3, fm / w * 100);
      }
    }
  }
  I.model = { days, w, bf };
  return I.model;
}
export const energy = d => model().days[d] || calcDay(d, S.profile.weight, S.profile.bodyFat);
export const currentWeight = () => model().w;
export const currentBf = () => model().bf;

export const GOALS = { maintain: { l: 'Держать вес', k: 1 }, cut: { l: 'Сушка', k: 0.85 }, bulk: { l: 'Набор', k: 1.1 } };
export function targetsAuto(d = today()) {
  const e = energy(d), p = S.profile, w = p.autoWeight ? e.w : p.weight;
  const kcal = Math.round(e.passive * (GOALS[p.goal]?.k || 1) / 10) * 10;
  const pr = Math.round(1.8 * w), f = Math.round(0.9 * w);
  return { kcal, p: pr, f, c: Math.max(0, Math.round((kcal - pr * 4 - f * 9) / 4)) };
}
export function targets(d = today()) {
  const a = targetsAuto(d), p = S.profile;
  const kcal = p.kcalOverride ?? a.kcal, pr = p.pOverride ?? a.p, f = p.fOverride ?? a.f;
  const c = p.cOverride ?? (p.kcalOverride != null || p.pOverride != null || p.fOverride != null
    ? Math.max(0, Math.round((kcal - pr * 4 - f * 9) / 4)) : a.c);
  return { kcal, p: pr, f, c };
}

/* ---------- привычки ---------- */
export const habitsSorted = () => all('habits').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const hval = (hid, d) => { const r = S.hlog[d + '|' + hid]; return r && !r.deleted ? r.val || 0 : 0; };
export const dayRec = d => { const x = S.days[d]; return x && !x.deleted ? x : null; };
export function isDone(h, d) {
  if (h.auto === 'workout' && workoutsOn(d).length) return true;
  const v = hval(h.id, d);
  return h.measure === 'qty' ? (h.target ? v >= h.target : v > 0) : v > 0;
}
export function streak(h, d = today()) {
  if (h.perWeek) {
    const cnt = ws => range(ws, addDays(ws, 6)).filter(x => x <= d && isDone(h, x)).length;
    let ws = weekStart(d), n = cnt(ws) >= h.perWeek ? 1 : 0;
    ws = addDays(ws, -7);
    while (n < 520 && cnt(ws) >= h.perWeek) { n++; ws = addDays(ws, -7); }
    return { n, unit: 'нед.', week: cnt(weekStart(d)) };
  }
  let x = isDone(h, d) ? d : addDays(d, -1), n = 0;
  while (n < 3650 && isDone(h, x)) { n++; x = addDays(x, -1); }
  return { n, unit: 'дн.' };
}
// Доля выполненных ежедневных привычек за день (привычки «N раз в неделю» не входят).
export function dayRatio(d) {
  const hs = all('habits', h => !h.perWeek && (!h.c || h.c <= d));
  if (!hs.length) return null;
  return hs.filter(h => isDone(h, d)).length / hs.length;
}

/* ---------- сон, самочувствие, готовность ---------- */
export function readiness(d) {
  const x = dayRec(d);
  if (!x) return null;
  const parts = [];
  if (x.sleep != null) parts.push([Math.min(x.sleep / 8, 1), 0.4]);
  if (x.sq != null) parts.push([(x.sq - 1) / 4, 0.3]);
  if (x.well != null) parts.push([(x.well - 1) / 4, 0.3]);
  if (!parts.length) return null;
  const W = parts.reduce((a, p) => a + p[1], 0);
  return Math.round(parts.reduce((a, p) => a + p[0] * p[1], 0) / W * 100);
}
export function fatigueWarning() {
  const ws = all('wo', w => !w.active && w.srpe != null).sort((a, b) => b.start - a.start).slice(0, 3);
  return ws.length === 3 && ws.every(w => w.srpe >= 8);
}

/* ---------- силовые ---------- */
// Расчётный максимум на 1 повтор (Эпли) с учётом запаса: вес × (1 + (повторы + запас) / 30).
export const e1rm = (w, r, rir) => (w > 0 && r > 0 ? w * (1 + (r + (rir || 0)) / 30) : 0);
export const rpe = rir => (rir == null ? null : 10 - rir);
export const workSets = it => it.sets.filter(s => s.done && !s.warm && s.w > 0 && s.r > 0);
export const exName = id => S.ex[id]?.name || 'Упражнение';
const exStep = id => S.ex[id]?.step || S.settings.step;
export { exStep };

// Все завершённые подходы по упражнению, от старых к новым.
export function sessions(exId) {
  return all('wo', w => !w.active).sort((a, b) => a.start - b.start).flatMap(w => {
    const it = w.items.find(i => i.ex === exId);
    if (!it) return [];
    const ws = workSets(it);
    if (!ws.length) return [];
    const rpes = ws.filter(s => s.rir != null).map(s => 10 - s.rir);
    return [{
      date: w.date, wo: w.id, start: w.start, sets: it.sets, tech: it.tech,
      best: Math.max(...ws.map(s => e1rm(s.w, s.r, s.rir))), maxW: Math.max(...ws.map(s => s.w)),
      reps: ws.reduce((a, s) => a + s.r, 0), vol: ws.reduce((a, s) => a + s.w * s.r, 0), rpe: avg(rpes),
      allEasy: ws.length > 0 && ws.every(s => s.rir != null && s.rir >= 2),
    }];
  });
}
export const lastSession = (exId, notWo) => sessions(exId).filter(s => s.wo !== notWo).pop() || null;
export function bestBefore(exId, wo) {
  const w = S.wo[wo]; const list = sessions(exId).filter(s => s.wo !== wo && (!w || s.start < w.start));
  return { best: Math.max(0, ...list.map(s => s.best)), maxW: Math.max(0, ...list.map(s => s.maxW)), n: list.length };
}
export const pct = (a, b) => (b > 0 ? (a / b - 1) * 100 : null);
export const setsText = sets => sets.filter(s => !s.warm && s.w != null && s.r).map(s => `${num(s.w, 2)}×${s.r}`).join(' · ');
