// Обмен упражнениями и шаблонами: выгрузка текстом, JSON или ссылкой и разбор того, что вставили при импорте.
//
// Текстовый формат (его же понимает импорт, подробно в README):
//   Шаблон: Д1 Верх-сила
//   Подтягивания | Спина | 3×5–6 | отдых 2:30 | шаг 8
//   Отжимания от пола | Грудь | 3×8–12
//   Упражнения:
//   Вис на перекладине | Предплечья
// После названия всё необязательно и в любом порядке. Разделители: | ; или табуляция.
// Упражнения сопоставляются по названию (без учёта регистра и ё/е), поэтому не задваиваются.
import { all, get, put, remove, MUSCLES } from './store.js';

export const FORMAT = 'podhod/exercises';
export const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim();
const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- группы мышц ---------- */
const SYN = {
  'Грудь': ['грудь', 'грудные', 'грудные мышцы'],
  'Спина': ['спина', 'широчайшие', 'трапеции', 'трапеция', 'поясница', 'ромбовидные'],
  'Ноги': ['ноги', 'нога', 'квадрицепс', 'квадрицепсы', 'бицепс бедра', 'ягодицы', 'ягодичные', 'икры', 'бедра', 'голень'],
  'Плечи': ['плечи', 'плечо', 'дельты', 'дельта', 'дельтовидные'],
  'Руки': ['руки', 'рука', 'бицепс', 'трицепс'],
  'Предплечья': ['предплечья', 'предплечье', 'хват', 'кисти', 'кисть', 'запястья', 'пальцы'],
  'Кор': ['кор', 'пресс', 'корпус', 'абс'],
};
const MUSCLE_OF = new Map(Object.entries(SYN).flatMap(([m, l]) => [[norm(m), m], ...l.map(x => [norm(x), m])]));
export const muscleOf = t => {
  const s = norm(t).replace(/^(группа|мышцы)\s*[:—–-]?\s*/, '');
  const m = MUSCLE_OF.get(s);
  return m && MUSCLES.includes(m) ? m : null;
};
// Если группа не указана, угадываем по названию. Порядок важен: «подъём ног» — пресс, «румынская тяга» — ноги.
const GUESS = [
  ['Кор', /подъ[её]м\S* ног|скруч|планк|пресс|уголок|паллоф|вакуум/],
  ['Спина', /передн\S* вис|задн\S* вис|выход сил|подтяг/],
  ['Ноги', /румынск|станов|присед|выпад|пистолет|ягод|икр|носк|зашагив|бедр|хип|сплит|мах\S* гир|свинг/],
  ['Руки', /бицепс|трицепс|молот|французск|сгибани\S* рук|разгибани\S* рук/],
  ['Предплечья', /запяст|пронац|супинац|кист|пальц|эспандер|бублик|полотенц|хват|вис|щип|каппинг|подворот/],
  ['Спина', /тяг|гребл|гиперэкст|лодочк/],
  ['Грудь', /отжим|жим\S* л[её]ж|развед|груд/],
  ['Плечи', /жим|мах|плеч|армейск/],
];
export const guessMuscle = name => { const s = norm(name); return (GUESS.find(([, re]) => re.test(s)) || ['Спина'])[0]; };

/* ---------- параметры строки ---------- */
const tidy = s => String(s).replace(/(\d)\s*[–—-]\s*(\d)/g, '$1–$2').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();

export function parseSets(t) {
  const s = String(t).trim();
  let m = s.match(/^(\d{1,2})\s*(?:подх\S*|круг\S*|сер\S*)?\s*[×xхXХ*]\s*((?:\d|макс|max|до |amrap|отказ)\S*.*)$/iu);
  if (m) return { sets: +m[1], goal: tidy(m[2]) };
  m = s.match(/^(\d{1,2})\s*(?:подх\S*|круг\S*)(?:\s+по\s+(\S.*))?$/iu);
  if (m) return { sets: +m[1], goal: m[2] ? tidy(m[2]) : null };
  return null;
}

// Отдых: «отдых 2:30», «отдых 90», «отдых 2 мин», «2–3 мин», «90 с», «1:30». Возвращает секунды.
export function parseRest(t) {
  const s0 = norm(t), labeled = /^отдых/.test(s0);
  const s = s0.replace(/^отдых\S*\s*[:—–-]?\s*/, '');
  let m = s.match(/^(\d{1,2}):(\d{2})$/), v = null;
  if (m) v = +m[1] * 60 + +m[2];
  else if ((m = s.match(/^(\d+(?:[.,]\d+)?)(?:\s*[–—-]\s*(\d+(?:[.,]\d+)?))?\s*(мин|м|сек|с|min|s)?\.?$/))) {
    const a = parseFloat(m[1].replace(',', '.')), b = m[2] ? parseFloat(m[2].replace(',', '.')) : a;
    if (!m[3] && !labeled) return null; // голое число без «отдых» — не отдых
    v = (a + b) / 2;
    if (/^m/.test(m[3] || '') || /^мин|^м$/.test(m[3] || '') || (!m[3] && v <= 10)) v *= 60;
  }
  if (v == null || !(v > 0)) return null;
  return clamp(Math.round(v / 5) * 5, 15, 900);
}

export function parseStep(t) {
  const m = norm(t).match(/^шаг\S*\s*[:—–-]?\s*(\d+(?:[.,]\d+)?)\s*(кг)?$/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return v > 0 ? clamp(v, 0.5, 50) : null;
}

const isParam = t => !!(parseSets(t) || muscleOf(t) || parseRest(t) != null || parseStep(t) != null);
const CODE = /^(?:[A-ZА-ЯЁ]\d{0,2}|\d{1,2}[.)]?|№)$/u; // «A1», «S2», «B», «3.» в первой колонке таблицы
const clean = s => String(s).replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').replace(/[\s:]+$/, '').trim();
const plainOk = s => s.length <= 60 && /^[\p{L}\d«"(]/u.test(s) && !/[:.!?]$/.test(s) && !s.includes(': ') && s.split(' ').length <= 9;

// Одна строка-упражнение. null — строку не поняли, 'skip' — служебная (шапка таблицы).
export function parseLine(line) {
  let s = line.replace(/\*\*|__/g, '').trim(), cells;
  if (s.startsWith('|')) cells = s.replace(/^\||\|$/g, '').split('|');
  else {
    s = s.replace(/^(?:[-•*·–—]|\d{1,2}[.)])\s+/, '');
    cells = s.split(/\s*[|;\t]\s*/);
  }
  cells = cells.map(c => c.trim()).filter(Boolean);
  if (!cells.length) return 'skip';
  if (cells.some(c => /^(упражнение|название|упражнения)$/i.test(c))) return 'skip';
  if (cells.length > 1 && CODE.test(cells[0])) cells.shift();
  let name = cells.shift();
  const tail = [];
  // Хвост в самом названии: «Подтягивания — 3×5–6», «Подтягивания 3×5–6, отдых 2:00»
  for (;;) {
    let m = name.match(/^(.*\S)\s+[—–-]\s+(\S.*)$/);
    if (m && m[2].split(/\s*,\s*/).every(isParam)) { tail.unshift(...m[2].split(/\s*,\s*/)); name = m[1]; continue; }
    m = name.match(/^(.*\S)\s+(\d{1,2}\s*(?:подх\S*\s*)?[×xхXХ*]\s*\S.*)$/u);
    if (m && parseSets(m[2].split(/\s*,\s*/)[0])) { tail.unshift(...m[2].split(/\s*,\s*(?=отдых|шаг)/i)); name = m[1]; continue; }
    break;
  }
  const params = [...tail, ...cells];
  const r = { name: clean(name), muscle: null, rest: null, step: null, sets: null, goal: null };
  if (!r.name || r.name.length > 80) return null;
  if (!params.length && !plainOk(r.name)) return null;
  const extra = [];
  for (const p of params) {
    let v;
    if (r.sets == null && (v = parseSets(p))) { r.sets = v.sets; r.goal = v.goal; }
    else if (!r.muscle && (v = muscleOf(p))) r.muscle = v;
    else if (r.rest == null && (v = parseRest(p)) != null) r.rest = v;
    else if (r.step == null && (v = parseStep(p)) != null) r.step = v;
    else extra.push(clean(p));
  }
  if (extra.length) r.goal = [r.goal, ...extra].filter(Boolean).join(' · ');
  return r;
}

const empty = () => ({ exercises: [], templates: [], skipped: [], error: null });

export function parseText(text) {
  const raw = { lib: [], templates: [], skipped: [] };
  let cur = null;
  const startTpl = name => { cur = { name: clean(name), items: [] }; raw.templates.push(cur); };
  for (const src of String(text).split(/\r?\n/)) {
    const line = src.replace(/ /g, ' ').trim();
    if (!line || line.startsWith('//')) continue;
    if (/^\|?[\s:|-]+\|?$/.test(line) && line.includes('-')) continue; // разделитель таблицы Markdown
    let m;
    if ((m = line.match(/^#{1,6}\s+(.+)$/)) || (m = line.match(/^(?:шаблон|тренировка)\s*[:—–-]\s*(.+)$/iu))) { startTpl(m[1]); continue; }
    if (/^день\s*\d+/iu.test(line) && !/[|;\t]/.test(line)) { startTpl(line); continue; }
    if (/^(упражнения|библиотека)\s*:?$/iu.test(line)) { cur = null; continue; }
    const r = parseLine(line);
    if (r === 'skip') continue;
    if (!r) { raw.skipped.push(line); continue; }
    if (cur) cur.items.push(r); else raw.lib.push(r);
  }
  return finish(raw);
}

// Приводит разобранное к единому виду: список упражнений без повторов + шаблоны со ссылками по названию.
function finish({ lib = [], templates = [], skipped = [] }) {
  const out = { ...empty(), skipped };
  const map = new Map();
  const addEx = e => {
    const name = clean(e.name ?? '');
    if (!name) return null;
    const k = norm(name);
    let x = map.get(k);
    if (!x) { x = { name, muscle: null, rest: null, step: null }; map.set(k, x); out.exercises.push(x); }
    const mu = e.muscle && (MUSCLES.includes(e.muscle) ? e.muscle : muscleOf(e.muscle));
    const rest = typeof e.rest === 'number' ? clamp(Math.round(e.rest), 15, 900) : e.rest ? parseRest('отдых ' + e.rest) : null;
    const step = typeof e.step === 'number' ? (e.step > 0 ? clamp(e.step, 0.5, 50) : null) : e.step ? parseStep('шаг ' + e.step) : null;
    if (!x.muscle && mu) x.muscle = mu;
    if (x.rest == null && rest) x.rest = rest;
    if (x.step == null && step) x.step = step;
    return x;
  };
  lib.forEach(addEx);
  const seen = new Map();
  for (const t of templates) {
    const items = [];
    for (const it of t.items || []) {
      const x = addEx(it); if (!x) continue;
      const sets = clamp(Math.round(+it.sets || 3), 1, 12);
      let goal = it.goal != null && String(it.goal).trim() ? tidy(it.goal) : null;
      if (goal && goal.length > 80) goal = goal.slice(0, 79) + '…';
      items.push({ ex: x.name, sets, goal });
    }
    if (!items.length) continue;
    let name = clean(t.name || '') || 'Шаблон';
    const k = norm(name), n = (seen.get(k) || 0) + 1; seen.set(k, n);
    if (n > 1) name += ` (${n})`;
    out.templates.push({ name, items });
  }
  for (const x of out.exercises) if (!x.muscle) { x.muscle = guessMuscle(x.name); x.guessed = true; }
  return out;
}

export function parseJSON(d) {
  if (!d || typeof d !== 'object') return { ...empty(), error: 'В файле нет упражнений.' };
  // Полная резервная копия «Подхода»: { ex: {id: …}, tpl: {id: …} }
  if (d.ex && typeof d.ex === 'object' && !Array.isArray(d.ex)) {
    const exs = Object.values(d.ex).filter(e => e && !e.deleted && e.name);
    const nameOf = new Map(exs.map(e => [e.id, e.name]));
    return finish({
      lib: exs,
      templates: Object.values(d.tpl || {}).filter(t => t && !t.deleted).map(t => ({
        name: t.name, items: (t.items || []).filter(i => nameOf.has(i.ex)).map(i => ({ ...i, name: nameOf.get(i.ex) })),
      })),
    });
  }
  const list = Array.isArray(d) ? d : d.exercises || [];
  const item = i => (typeof i === 'string' ? { name: i } : { ...i, name: i.name ?? i.ex, goal: i.goal ?? i.reps });
  return finish({
    lib: list.map(item),
    templates: (d.templates || []).map(t => ({ name: t.name, items: (t.items || t.exercises || []).map(item) })),
  });
}

export function parseImport(text) {
  const t = String(text ?? '').replace(/^﻿/, '').trim();
  if (!t) return empty();
  if (t[0] === '{' || t[0] === '[') {
    let d;
    try { d = JSON.parse(t); } catch { return { ...empty(), error: 'Похоже на JSON, но в нём ошибка. Скопируй файл целиком.' }; }
    return parseJSON(d);
  }
  return parseText(t);
}

/* ---------- что изменится и применение ---------- */
const FIELDS = ['muscle', 'rest', 'step'];
export function planImport(p) {
  const exBy = new Map(all('ex').map(e => [norm(e.name), e]));
  const tplBy = new Map(all('tpl').map(t => [norm(t.name), t]));
  const ex = p.exercises.map(e => {
    const cur = exBy.get(norm(e.name)) || null;
    const diff = cur ? FIELDS.filter(f => e[f] != null && !(f === 'muscle' && e.guessed) && e[f] !== cur[f]) : [];
    return { ...e, cur, diff };
  });
  const tpl = p.templates.map(t => ({ ...t, cur: tplBy.get(norm(t.name)) || null }));
  return {
    ex, tpl,
    newEx: ex.filter(e => !e.cur), changedEx: ex.filter(e => e.diff.length), sameEx: ex.filter(e => e.cur),
    newTpl: tpl.filter(t => !t.cur), updTpl: tpl.filter(t => t.cur),
    guessed: ex.filter(e => !e.cur && e.guessed),
  };
}

// Применяет импорт. Возвращает функцию «вернуть как было».
export function applyImport(plan, { overwrite = true } = {}) {
  const undo = [], ids = new Map();
  for (const e of plan.ex) {
    if (!e.cur) {
      const rec = put('ex', { name: e.name, muscle: e.muscle, rest: e.rest ?? null, step: e.step ?? null });
      ids.set(norm(e.name), rec.id);
      undo.push(() => remove('ex', rec.id));
      continue;
    }
    const id = e.cur.id;
    ids.set(norm(e.name), id);
    if (overwrite && e.diff.length) {
      const before = Object.fromEntries(e.diff.map(f => [f, e.cur[f] ?? null]));
      put('ex', Object.assign(get('ex', id), Object.fromEntries(e.diff.map(f => [f, e[f]]))));
      undo.push(() => { const r = get('ex', id); if (r) put('ex', Object.assign(r, before)); });
    }
  }
  for (const t of plan.tpl) {
    const items = t.items.map(i => {
      const o = { ex: ids.get(norm(i.ex)), sets: i.sets };
      if (i.goal) o.goal = i.goal;
      return o;
    }).filter(i => i.ex);
    if (t.cur) {
      const id = t.cur.id, before = JSON.parse(JSON.stringify(t.cur.items || []));
      put('tpl', Object.assign(get('tpl', id), { items }));
      undo.push(() => { const r = get('tpl', id); if (r) put('tpl', Object.assign(r, { items: before })); });
    } else {
      const rec = put('tpl', { name: t.name, items });
      undo.push(() => remove('tpl', rec.id));
    }
  }
  return () => undo.reverse().forEach(f => f());
}

/* ---------- экспорт ---------- */
// Что выгружать: шаблоны целиком (tplIds) и отдельные упражнения (exIds). Упражнения из шаблонов попадают сами.
export function collect({ tplIds = [], exIds = [] } = {}) {
  const tpls = [...tplIds].map(id => get('tpl', id)).filter(Boolean);
  const ids = new Set([...tpls.flatMap(t => (t.items || []).map(i => i.ex)), ...exIds]);
  const exs = [...ids].map(id => get('ex', id)).filter(Boolean).sort(byName);
  return { tpls, exs };
}

const safe = s => String(s ?? '').replace(/\s*[|;\t\r\n]+\s*/g, ', ').trim();
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fnum = v => String(v).replace('.', ',');
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function toText(sel) {
  const { tpls, exs } = collect(sel);
  const line = (e, extra = []) => [safe(e.name), e.muscle, ...extra, e.rest ? 'отдых ' + mmss(e.rest) : null, e.step ? 'шаг ' + fnum(e.step) : null].filter(Boolean).join(' | ');
  const out = [`// Подход: упражнения и шаблоны, ${isoToday()}`], done = new Set();
  for (const t of tpls) {
    out.push('', 'Шаблон: ' + safe(t.name));
    for (const i of t.items || []) {
      const e = get('ex', i.ex); if (!e) continue;
      out.push(line(e, [i.goal ? `${i.sets}×${safe(i.goal)}` : `${i.sets} подх.`]));
      done.add(e.id);
    }
  }
  const rest = exs.filter(e => !done.has(e.id));
  if (rest.length) { out.push('', 'Упражнения:'); rest.forEach(e => out.push(line(e))); }
  return out.join('\n') + '\n';
}

export function toJSON(sel) {
  const { tpls, exs: list } = collect(sel);
  const compact = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
  return JSON.stringify({
    format: FORMAT, version: 1, date: isoToday(),
    exercises: list.map(e => compact({ name: e.name, muscle: e.muscle, rest: e.rest, step: e.step })),
    templates: tpls.map(t => ({ name: t.name, items: (t.items || []).filter(i => get('ex', i.ex)).map(i => compact({ ex: get('ex', i.ex).name, sets: i.sets, goal: i.goal })) })),
  }, null, 2) + '\n';
}

/* ---------- ссылка: текст сжимается и кладётся после #import= (на сервер не уходит) ---------- */
const te = new TextEncoder();
const b64url = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')), c => c.charCodeAt(0));
const pipe = (data, stream) => new Response(new Blob([data]).stream().pipeThrough(stream));

export async function toLink(text, base) {
  const z = new Uint8Array(await pipe(te.encode(text), new CompressionStream('deflate-raw')).arrayBuffer());
  return `${base}#import=${b64url(z)}`;
}
export async function fromLink(code) {
  return pipe(unb64url(decodeURIComponent(code)), new DecompressionStream('deflate-raw')).text();
}
