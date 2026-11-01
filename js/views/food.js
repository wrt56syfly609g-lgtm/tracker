// Раздел «Еда»: ручной ввод ккал и БЖУ, недавние записи, итоги дня, калькулятор ккал ↔ кДж.
import { all, put, get, remove } from '../store.js';
import { h, icon, ibtn, btn, sheet, field, input, toast, macroRow, card, stat } from '../ui.js';
import { num, signed, parseNum, totals, foodOn, energy, targets, KJ, kcalFromMacros, nowHHMM } from '../calc.js';

const draft = { name: '', kcal: '', p: '', f: '', c: '' };
const calc = { kcal: '', kj: '' };

function readEntry(src) {
  const p = parseNum(src.p), f = parseNum(src.f), c = parseNum(src.c);
  let kcal = parseNum(src.kcal);
  if (kcal == null && (p || f || c)) kcal = Math.round(kcalFromMacros(p, f, c));
  return { name: (src.name || '').trim(), kcal, p, f, c };
}

function form(src, onSubmit, submitText) {
  const kjHint = h('div', { class: 'hint num' });
  const upd = () => {
    const e = readEntry(src), k = parseNum(src.kcal);
    kjHint.textContent = k != null ? `= ${num(k * KJ)} кДж`
      : e.kcal ? `по БЖУ ≈ ${num(e.kcal)} ккал (${num(e.kcal * KJ)} кДж)` : 'Можно ввести только БЖУ, калории посчитаются сами.';
  };
  const mk = (k, ph, mode = 'decimal') => {
    const i = input({ value: src[k], placeholder: ph, inputmode: mode, id: 'food-' + k + (submitText === 'Сохранить' ? '-e' : '') });
    i.addEventListener('input', () => { src[k] = i.value; upd(); });
    return i;
  };
  const nameI = mk('name', 'Например, овсянка с бананом', 'text');
  const submit = () => {
    const e = readEntry(src);
    if (!e.kcal) { toast('Укажи калории или БЖУ.'); return; }
    onSubmit(e);
  };
  upd();
  const f = h('form', { class: 'stack', onsubmit: ev => { ev.preventDefault(); submit(); } },
    field('Что съел', nameI),
    h('div', { class: 'grid4' },
      field('Ккал', mk('kcal', '0')), field('Белки, г', mk('p', '0')), field('Жиры, г', mk('f', '0')), field('Углев., г', mk('c', '0'))),
    kjHint,
    h('button', { class: 'btn primary block', type: 'submit' }, icon(submitText === 'Сохранить' ? 'check' : 'plus'), submitText));
  return f;
}

const addEntry = (date, e) => put('food', { date, t: nowHHMM(), ...e });

export function render(ctx) {
  const d = ctx.date, t = totals(d), tg = targets(d), en = energy(d);
  const out = [];

  out.push(h('section', { class: 'card' },
    h('div', { class: 'row between', style: 'align-items:flex-end' },
      h('div', null, h('div', { class: 'sec-label' }, 'Съедено'), h('div', { class: 'big' }, num(t.kcal), h('span', { class: 'muted', style: 'font-size:14px;font-family:var(--font)' }, ` / ${num(tg.kcal)} ккал`))),
      h('div', { class: 'muted small num', style: 'text-align:right' }, `${num(t.kcal * KJ)} кДж`, h('br'), `баланс ${signed(Math.round(en.bal))} ккал`)),
    macroRow('Белки', 'c-p', t.p, tg.p), macroRow('Жиры', 'c-f', t.f, tg.f), macroRow('Углеводы', 'c-c', t.c, tg.c)));

  out.push(card('Добавить', 'plus', form(draft, e => {
    addEntry(d, e);
    Object.assign(draft, { name: '', kcal: '', p: '', f: '', c: '' });
    toast(`Добавлено: ${e.name || 'запись'}, ${num(e.kcal)} ккал`);
  }, 'Добавить')));

  // Недавние
  const seen = new Set(), recent = [];
  for (const x of all('food').sort((a, b) => b.u - a.u)) {
    const k = [x.name, x.kcal, x.p, x.f, x.c].join('|');
    if (!x.name || seen.has(k)) continue;
    seen.add(k); recent.push(x);
    if (recent.length >= 10) break;
  }
  if (recent.length) out.push(card('Недавние', 'history',
    h('div', { class: 'chips' }, recent.map(x => h('button', {
      type: 'button', class: 'chip', title: `Б ${num(x.p, 1)} · Ж ${num(x.f, 1)} · У ${num(x.c, 1)}`,
      onclick: () => { addEntry(d, { name: x.name, kcal: x.kcal, p: x.p, f: x.f, c: x.c }); toast(`Добавлено: ${x.name}`); },
    }, icon('plus', 'sm'), `${x.name} · ${num(x.kcal)}`))),
    h('div', { class: 'hint' }, 'Нажми, чтобы добавить ещё раз в выбранный день.')));

  // Записи дня
  const list = foodOn(d);
  out.push(card(`Записи за день · ${list.length}`, 'notes',
    list.length ? h('div', { class: 'list' }, list.map(x => h('div', { class: 'item' },
      h('button', { type: 'button', class: 't', style: 'text-align:left;background:none;border:0;padding:0', onclick: () => editEntry(x) },
        h('b', null, x.name || 'Без названия'),
        h('span', { class: 'num' }, `${x.t || ''} · Б ${num(x.p, 1)} · Ж ${num(x.f, 1)} · У ${num(x.c, 1)}`)),
      h('div', { class: 'num', style: 'text-align:right' }, h('b', null, num(x.kcal)), h('div', { class: 'small muted' }, num(x.kcal * KJ) + ' кДж')),
      ibtn('trash', () => { const undo = remove('food', x.id); toast('Запись удалена', 'Вернуть', undo); }, 'Удалить'))))
      : h('div', { class: 'empty' }, 'Пока ничего не записано. Добавь первую еду выше.')));

  // Калькулятор
  const kI = input({ value: calc.kcal, inputmode: 'decimal', placeholder: 'ккал', id: 'calc-kcal' });
  const jI = input({ value: calc.kj, inputmode: 'decimal', placeholder: 'кДж', id: 'calc-kj' });
  kI.addEventListener('input', () => { calc.kcal = kI.value; const v = parseNum(kI.value); calc.kj = jI.value = v == null ? '' : String(Math.round(v * KJ * 10) / 10).replace('.', ','); });
  jI.addEventListener('input', () => { calc.kj = jI.value; const v = parseNum(jI.value); calc.kcal = kI.value = v == null ? '' : String(Math.round(v / KJ * 10) / 10).replace('.', ','); });
  out.push(card('Калькулятор ккал ↔ кДж', 'calculator',
    h('div', { class: 'grid2' }, field('Килокалории', kI), field('Килоджоули (СИ)', jI)),
    h('div', { class: 'hint' }, '1 ккал = 4,184 кДж. Джоуль — единица энергии в системе СИ.')));

  return h('div', { class: 'stack', style: 'gap:14px' }, out);
}

function editEntry(x) {
  const src = { name: x.name || '', kcal: x.kcal ?? '', p: x.p ?? '', f: x.f ?? '', c: x.c ?? '' };
  for (const k of ['kcal', 'p', 'f', 'c']) src[k] = src[k] === '' || src[k] == null ? '' : String(src[k]).replace('.', ',');
  sheet('Изменить запись', close => form(src, e => { put('food', Object.assign(get('food', x.id) || x, e)); close(); }, 'Сохранить'));
}
