// Раздел «Еда»: строка «продукт + вес» с автоподсчётом КБЖУ и клетчатки, таблица продуктов и блюд,
// свои продукты и блюда из ингредиентов, недавние записи, итоги дня, калькулятор ккал ↔ кДж.
import { all, put, get, remove } from '../store.js';
import { h, icon, ibtn, btn, sheet, field, input, toast, macroRow, card, confirmSheet } from '../ui.js';
import { num, signed, parseNum, totals, foodOn, energy, targets, KJ, kcalFromMacros, nowHHMM } from '../calc.js';
import {
  NUTR, CATS, MY_CAT, products, product, search, portion, perOf, dish, parseQty, saveProduct, removeProduct, byName, baseOf, norm,
} from '../foods.js';

const LBL = { kcal: 'Ккал', p: 'Белки, г', f: 'Жиры, г', c: 'Углев., г', fb: 'Клетч., г' };
const fmt = v => (v == null || v === '' || Number.isNaN(+v) ? '' : String(Math.round(v * 10) / 10).replace('.', ','));
const short = x => `${num(x.kcal)} ккал · Б ${num(x.p, 1)} · Ж ${num(x.f, 1)} · У ${num(x.c, 1)} · Кл ${num(x.fb, 1)}`;
const fine = () => matchMedia('(pointer: fine)').matches;

const emptyDraft = () => ({ name: '', g: '', pid: null, per: null, kcal: '', p: '', f: '', c: '', fb: '' });
let draft = emptyDraft();
const calc = { kcal: '', kj: '' };

/* ---------- поле с подсказками из базы ---------- */
function acInput({ value = '', placeholder, id, onInput, onPick, onNew }) {
  const inp = input({ value, placeholder, id, autocomplete: 'off', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false' });
  const box = h('div', { class: 'ac-list', role: 'listbox', hidden: true });
  let items = [], hi = -1;
  const close = () => { box.hidden = true; inp.setAttribute('aria-expanded', 'false'); hi = -1; };
  const pick = x => { close(); onPick(x, parseQty(inp.value)); };
  const keep = e => e.preventDefault(); // не терять фокус поля при нажатии на подсказку
  function show() {
    const q = parseQty(inp.value).q.trim();
    items = q ? search(q, 8) : [];
    box.replaceChildren(
      ...items.map((x, i) => h('button', { type: 'button', class: 'ac-it' + (i === hi ? ' on' : ''), role: 'option', onmousedown: keep, onclick: () => pick(x) },
        h('span', { class: 'nm' }, x.name, x.user ? h('span', { class: 'tag acc' }, 'моё') : x.edited ? h('span', { class: 'tag' }, 'изменено') : null),
        h('span', { class: 'mt num' }, `${short(x)} на 100 г`))),
      onNew && q ? h('button', { type: 'button', class: 'ac-it new', onmousedown: keep, onclick: () => { close(); onNew(q); } },
        h('span', { class: 'nm' }, icon('plus', 'sm'), items.length ? `Новый продукт «${q}»` : `Нет в базе. Добавить «${q}»`)) : null);
    box.hidden = !q || !box.childNodes.length;
    inp.setAttribute('aria-expanded', String(!box.hidden));
  }
  inp.addEventListener('input', () => { hi = -1; onInput && onInput(inp.value); show(); });
  inp.addEventListener('focus', () => { if (inp.value.trim()) show(); });
  inp.addEventListener('blur', () => setTimeout(close, 150));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !box.hidden) { e.stopPropagation(); close(); return; }
    if (box.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hi = e.key === 'ArrowDown' ? (hi + 1) % items.length : (hi <= 0 ? items.length - 1 : hi - 1);
      [...box.children].forEach((b, i) => b.classList.toggle('on', i === hi));
      box.children[hi]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(items[Math.max(0, hi)]);
    }
  });
  const wrap = h('div', { class: 'ac' }, inp, box);
  wrap.inp = inp;
  return wrap;
}

/* ---------- строка: продукт + вес → КБЖУ ---------- */
function readEntry(src) {
  const v = {};
  for (const k of NUTR) v[k] = parseNum(src[k]);
  if (v.kcal == null && (v.p || v.f || v.c)) v.kcal = Math.round(kcalFromMacros(v.p, v.f, v.c));
  const g = parseNum(src.g);
  return {
    name: (src.name || '').trim(), g: g > 0 ? g : null, pid: src.pid || null,
    per: src.per && g > 0 ? { ...src.per } : null,
    kcal: v.kcal, p: v.p, f: v.f, c: v.c, fb: v.fb,
  };
}

function foodForm(src, { submitText, onSubmit, idp = 'food' }) {
  const vals = {};
  const kjHint = h('div', { class: 'hint num' });
  const perLine = h('div', { class: 'per' });
  const pcRow = h('div', { class: 'row wrap pcs' });
  const keep = h('div');

  const gI = input({ value: src.g, placeholder: '0', inputmode: 'decimal', id: idp + '-g', class: 'inp num' });
  const fields = {};
  for (const k of NUTR) {
    const i = input({ value: src[k], placeholder: '0', inputmode: 'decimal', id: `${idp}-${k}`, class: 'inp num' });
    i.addEventListener('input', () => {
      src[k] = i.value;
      // Правка цифры вручную: пересчитываем «на 100 г», чтобы при смене веса пропорция сохранилась.
      const g = parseNum(src.g);
      if (g > 0) {
        if (src.per) src.per[k] = (parseNum(i.value) || 0) * 100 / g;
        else { src.per = {}; for (const kk of NUTR) src.per[kk] = (parseNum(src[kk]) || 0) * 100 / g; }
      }
      upd();
    });
    fields[k] = i;
  }

  const recalc = () => {
    const g = parseNum(src.g);
    if (!src.per || !(g > 0)) return;
    const v = portion(src.per, g);
    for (const k of NUTR) { src[k] = fmt(v[k]); fields[k].value = src[k]; }
  };

  function upd() {
    const e = readEntry(src), k = parseNum(src.kcal);
    kjHint.textContent = k != null ? `= ${num(k * KJ)} кДж`
      : e.kcal ? `по БЖУ ≈ ${num(e.kcal)} ккал (${num(e.kcal * KJ)} кДж)`
        : 'Начни вводить название и выбери из подсказок: КБЖУ посчитается по весу. Цифры можно поправить.';
    const x = product(src.pid);
    perLine.hidden = !src.per;
    if (src.per) {
      perLine.replaceChildren(
        h('span', { class: 'grow' }, h('b', null, 'На 100 г: '), short(src.per), x ? h('span', { class: 'src' }, ` · по базе: ${x.name}`) : null),
        x ? ibtn('pencil', () => productSheet(x, { onSaved: y => { if (y) { src.per = perOf(y); recalc(); } else src.pid = null; upd(); } }), 'Изменить продукт в базе') : null,
        ibtn('x', () => { src.per = null; src.pid = null; upd(); }, 'Не считать по базе'));
    }
    pcRow.hidden = !(x && x.pc);
    if (x && x.pc) {
      pcRow.replaceChildren(h('span', { class: 'hint' }, `1 ${x.u || 'шт'} = ${num(x.pc)} г:`),
        ...[0.5, 1, 2, 3, 4].map(n => h('button', {
          type: 'button', class: 'chip sm' + (parseNum(src.g) === n * x.pc ? ' on' : ''),
          onclick: () => { src.g = fmt(n * x.pc); gI.value = src.g; recalc(); upd(); },
        }, n === 0.5 ? '½' : String(n))));
    }
    const canKeep = e.name && !x && (src.per || e.kcal) && !byName(e.name);
    keep.replaceChildren(canKeep ? btn('Сохранить как мой продукт', () => {
      const g = parseNum(src.g);
      productSheet(null, {
        name: e.name, per: src.per ? roundPer(src.per) : null,
        hint: !src.per && !(g > 0) ? 'Впиши значения на 100 г (есть на этикетке).' : null,
        onSaved: y => setProduct(y),
      });
    }, 'ghost sm', 'plus') : '');
  }

  function setProduct(x, qty = {}) {
    src.pid = x.id; src.per = perOf(x); src.name = x.name; ac.inp.value = x.name;
    if (qty.g) src.g = fmt(qty.g);
    else if (qty.n && x.pc) src.g = fmt(qty.n * x.pc);
    else if (qty.n) src.g = '';
    gI.value = src.g;
    recalc(); upd();
    // После сохранения продукта экран перерисовывается, поэтому ищем поле веса заново.
    if (!(parseNum(src.g) > 0)) { gI.focus(); setTimeout(() => document.getElementById(idp + '-g')?.focus(), 60); }
  }

  const ac = acInput({
    value: src.name, placeholder: 'Например, гречка сухая', id: idp + '-name',
    onInput: v => {
      src.name = v;
      const x = product(src.pid);
      if (x && norm(v) !== norm(x.name)) src.pid = null; // название поменяли — связь с базой снимаем, пропорции остаются
      if (!v.trim()) { src.per = null; src.pid = null; }
      upd();
    },
    onPick: (x, qty) => setProduct(x, qty),
    onNew: q => productSheet(null, { name: q, onSaved: y => setProduct(y, parseQty(ac.inp.value)) }),
  });
  gI.addEventListener('input', () => { src.g = gI.value; recalc(); upd(); });

  const submit = () => {
    const e = readEntry(src);
    if (!e.kcal) { toast(src.per ? 'Укажи вес.' : 'Выбери продукт из подсказок или впиши калории.'); (src.per ? gI : ac.inp).focus(); return; }
    onSubmit(e);
  };
  upd();
  return h('form', { class: 'stack', onsubmit: ev => { ev.preventDefault(); submit(); } },
    h('div', { class: 'food-row' }, field('Продукт или блюдо', ac), field('Вес, г', gI)),
    perLine, pcRow,
    h('div', { class: 'grid5' }, NUTR.map(k => field(LBL[k], fields[k]))),
    kjHint,
    h('button', { class: 'btn primary block', type: 'submit' }, icon(submitText === 'Сохранить' ? 'check' : 'plus'), submitText),
    keep);
}
const roundPer = per => { const o = {}; for (const k of NUTR) o[k] = k === 'kcal' ? Math.round(per[k] || 0) : Math.round((per[k] || 0) * 10) / 10; return o; };

const addEntry = (date, e) => put('food', { date, t: nowHHMM(), ...e });

/* ---------- экран ---------- */
export function render(ctx) {
  const d = ctx.date, t = totals(d), tg = targets(d), en = energy(d);
  const out = [];

  out.push(h('section', { class: 'card' },
    h('div', { class: 'row between', style: 'align-items:flex-end' },
      h('div', null, h('div', { class: 'sec-label' }, 'Съедено'), h('div', { class: 'big' }, num(t.kcal), h('span', { class: 'muted', style: 'font-size:14px;font-family:var(--font)' }, ` / ${num(tg.kcal)} ккал`))),
      h('div', { class: 'muted small num', style: 'text-align:right' }, `${num(t.kcal * KJ)} кДж`, h('br'), `баланс ${signed(Math.round(en.bal))} ккал`)),
    macroRow('Белки', 'c-p', t.p, tg.p), macroRow('Жиры', 'c-f', t.f, tg.f), macroRow('Углеводы', 'c-c', t.c, tg.c),
    macroRow('Клетчатка', 'c-fb', t.fb, tg.fb)));

  out.push(card('Добавить', 'plus',
    foodForm(draft, {
      submitText: 'Добавить',
      onSubmit: e => {
        addEntry(d, e);
        draft = emptyDraft();
        toast(`Добавлено: ${e.name || 'запись'}${e.g ? `, ${num(e.g)} г` : ''}, ${num(e.kcal)} ккал`);
        if (fine()) setTimeout(() => document.getElementById('food-name')?.focus(), 80);
      },
    }),
    h('div', { class: 'row wrap' },
      btn('Таблица КБЖУ', () => baseSheet(), 'soft sm', 'database'),
      btn('Блюдо из ингредиентов', () => productSheet(null, { dish: true }), 'ghost sm', 'chef-hat'))));

  // Недавние
  const seen = new Set(), recent = [];
  for (const x of all('food').sort((a, b) => b.u - a.u)) {
    const k = [x.name, x.g, x.kcal].join('|');
    if (!x.name || seen.has(k)) continue;
    seen.add(k); recent.push(x);
    if (recent.length >= 12) break;
  }
  if (recent.length) out.push(card('Недавние', 'history',
    h('div', { class: 'chips' }, recent.map(x => h('button', {
      type: 'button', class: 'chip', title: `Б ${num(x.p, 1)} · Ж ${num(x.f, 1)} · У ${num(x.c, 1)} · Кл ${num(x.fb, 1)}`,
      onclick: () => {
        const { name, g, pid, per, kcal, p, f, c, fb } = x;
        addEntry(d, { name, g: g ?? null, pid: pid ?? null, per: per ?? null, kcal, p, f, c, fb: fb ?? null });
        toast(`Добавлено: ${x.name}`);
      },
    }, icon('plus', 'sm'), `${x.name}${x.g ? ` · ${num(x.g)} г` : ''} · ${num(x.kcal)}`))),
    h('div', { class: 'hint' }, 'Нажми, чтобы добавить ещё раз в выбранный день.')));

  // Записи дня
  const list = foodOn(d);
  out.push(card(`Записи за день · ${list.length}`, 'notes',
    list.length ? h('div', { class: 'list' }, list.map(x => h('div', { class: 'item' },
      h('button', { type: 'button', class: 't', style: 'text-align:left;background:none;border:0;padding:0', onclick: () => editEntry(x) },
        h('b', null, x.name || 'Без названия', x.g ? h('span', { class: 'muted', style: 'display:inline;font-weight:400' }, ` · ${num(x.g)} г`) : null),
        h('span', { class: 'num' }, `${x.t || ''} · Б ${num(x.p, 1)} · Ж ${num(x.f, 1)} · У ${num(x.c, 1)}${x.fb ? ` · Кл ${num(x.fb, 1)}` : ''}`)),
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
  const src = { name: x.name || '', g: fmt(x.g), pid: x.pid || null, per: x.per ? { ...x.per } : null };
  for (const k of NUTR) src[k] = fmt(x[k]);
  if (!src.per && x.g > 0 && x.kcal) { src.per = {}; for (const k of NUTR) src.per[k] = (+x[k] || 0) * 100 / x.g; }
  sheet('Изменить запись', close => foodForm(src, {
    submitText: 'Сохранить', idp: 'food-e',
    onSubmit: e => { put('food', Object.assign(get('food', x.id) || x, e)); close(); },
  }));
}

/* ---------- продукт или блюдо ---------- */
export function productSheet(x, opts = {}) {
  const isBase = !!(x && baseOf(x.id)), isNew = !x;
  const P = {
    name: x?.name ?? opts.name ?? '', cat: x?.cat ?? MY_CAT, pc: fmt(x?.pc), u: x?.u ?? '', a: x?.a ?? '',
    cooked: fmt(x?.cooked), items: (x?.items || []).map(i => ({ ...i, g: fmt(i.g) })),
  };
  const per = x || opts.per;
  for (const k of NUTR) P[k] = per ? fmt(per[k]) : '';
  const title = isNew ? (opts.dish ? 'Новое блюдо' : 'Новый продукт') : x.items?.length ? 'Блюдо' : 'Продукт';

  sheet(title, close => {
    const nameI = input({ value: P.name, placeholder: 'Например, творог 1 % (Савушкин)', id: 'prod-name' });
    nameI.addEventListener('input', () => { P.name = nameI.value; });
    const nf = {};
    for (const k of NUTR) {
      nf[k] = input({ value: P[k], placeholder: '0', inputmode: 'decimal', class: 'inp num', id: 'prod-' + k });
      nf[k].addEventListener('input', () => { P[k] = nf[k].value; });
    }
    const pcI = input({ value: P.pc, placeholder: 'нет', inputmode: 'decimal', class: 'inp num' });
    pcI.addEventListener('input', () => { P.pc = pcI.value; });
    const uI = input({ value: P.u, placeholder: 'шт, пачка, ст. л.' });
    uI.addEventListener('input', () => { P.u = uI.value; });
    const aI = input({ value: P.a, placeholder: 'через пробел' });
    aI.addEventListener('input', () => { P.a = aI.value; });
    const catS = h('select', { class: 'inp' }, CATS.map(c => h('option', { value: c, selected: c === P.cat }, c)));
    catS.addEventListener('change', () => { P.cat = catS.value; });

    // Блюдо из ингредиентов
    const ingBox = h('div', { class: 'stack', style: 'gap:8px' });
    const sum = h('div', { class: 'hint num' });
    const cookedI = input({ value: P.cooked, placeholder: 'сумма', inputmode: 'decimal', class: 'inp num' });
    const recount = () => {
      const r = dish(P.items.map(i => ({ per: i.per, g: parseNum(i.g) })), parseNum(P.cooked));
      if (!r.raw) { sum.textContent = 'Добавь ингредиенты с весом: значения на 100 г посчитаются сами.'; return; }
      sum.textContent = `Всего ${num(r.tot.kcal)} ккал · Б ${num(r.tot.p, 1)} · Ж ${num(r.tot.f, 1)} · У ${num(r.tot.c, 1)} · Кл ${num(r.tot.fb, 1)} `
        + `на ${num(r.weight)} г${parseNum(P.cooked) ? ` (сырые ингредиенты ${num(r.raw)} г)` : ''}. На 100 г — в полях выше.`;
      for (const k of NUTR) { P[k] = fmt(r.per[k]); nf[k].value = P[k]; }
    };
    cookedI.addEventListener('input', () => { P.cooked = cookedI.value; recount(); });
    const drawIng = () => {
      ingBox.replaceChildren(...P.items.map((it, n) => {
        const gI = input({ value: it.g, placeholder: 'г', inputmode: 'decimal', class: 'inp num', 'aria-label': 'Вес, г' });
        gI.addEventListener('input', () => { it.g = gI.value; recount(); });
        const ac = acInput({
          value: it.name, placeholder: 'Ингредиент',
          onInput: v => { it.name = v; },
          onPick: (y, qty) => {
            Object.assign(it, { pid: y.id, name: y.name, per: perOf(y) });
            ac.inp.value = y.name;
            if (qty.g) it.g = fmt(qty.g); else if (qty.n && y.pc) it.g = fmt(qty.n * y.pc);
            gI.value = it.g; recount();
            if (!(parseNum(it.g) > 0)) gI.focus();
          },
        });
        return h('div', { class: 'ing' + (it.per ? '' : ' bad') }, ac, gI,
          ibtn('trash', () => { P.items.splice(n, 1); drawIng(); recount(); }, 'Убрать ингредиент'));
      }));
    };
    drawIng(); if (P.items.length) recount(); else sum.textContent = 'Добавь ингредиенты с весом: значения на 100 г посчитаются сами.';
    const dishBlock = h('details', { class: 'more', open: !!(P.items.length || opts.dish) },
      h('summary', null, 'Посчитать из ингредиентов'),
      h('div', { class: 'stack', style: 'margin-top:10px' },
        ingBox,
        btn('Ингредиент', () => { P.items.push({ name: '', g: '', per: null }); drawIng(); ingBox.lastChild?.querySelector('input')?.focus(); }, 'soft sm', 'plus'),
        field('Вес готового блюда, г', cookedI, 'Крупа и макароны впитывают воду, мясо теряет её. Взвесь готовое блюдо без кастрюли. Пусто — сумма ингредиентов.'),
        sum));

    const save = () => {
      P.name = P.name.trim();
      if (!P.name) { toast('Впиши название.'); nameI.focus(); return; }
      const v = NUTR.map(k => parseNum(P[k]));
      if (!v.some(n => n)) { toast('Впиши калории или БЖУ на 100 г.'); nf.kcal.focus(); return; }
      const dup = byName(P.name);
      if (dup && dup.id !== x?.id) { toast('Продукт с таким названием уже есть. Найди его в таблице и поправь или назови иначе.'); return; }
      const items = P.items.filter(i => i.per && parseNum(i.g) > 0).map(i => ({ pid: i.pid || null, name: i.name, g: parseNum(i.g), per: roundPer(i.per) }));
      const data = { ...P, items, cooked: parseNum(P.cooked), pc: parseNum(P.pc) };
      for (const k of NUTR) data[k] = parseNum(P[k]);
      const rec = saveProduct(x?.id || null, data);
      close();
      toast(isNew ? `В базе: ${rec.name}` : 'Сохранено');
      opts.onSaved && opts.onSaved(product(rec.id));
    };

    const extra = [];
    if (isBase && x.edited) extra.push(btn('Вернуть исходные значения', () => {
      removeProduct(x.id); close(); toast('Значения из встроенной таблицы возвращены.');
      opts.onSaved && opts.onSaved(product(x.id));
    }, 'ghost'));
    if (!isNew && !isBase) extra.push(btn('Удалить', () => confirmSheet('Удалить продукт?', `«${x.name}» пропадёт из базы. Уже записанная еда останется.`, 'Удалить', () => {
      const undo = removeProduct(x.id); close(); toast('Продукт удалён', 'Вернуть', undo);
      opts.onSaved && opts.onSaved(null);
    }), 'danger'));

    setTimeout(() => (P.name ? nf.kcal : nameI).focus(), 50);
    return h('form', { class: 'stack', onsubmit: e => { e.preventDefault(); save(); } },
      opts.hint ? h('div', { class: 'banner info' }, icon('info-circle'), opts.hint) : null,
      isBase ? h('div', { class: 'hint' }, 'Это продукт из встроенной таблицы. Твои правки сохранятся и попадут на другие устройства.') : null,
      field('Название', nameI),
      h('div', { class: 'sec-label' }, 'На 100 г'),
      h('div', { class: 'grid5' }, NUTR.map(k => field(LBL[k], nf[k]))),
      h('div', { class: 'hint' }, 'Если калории не вписаны, они посчитаются по БЖУ.'),
      h('div', { class: 'grid2' }, field('Вес 1 штуки или порции, г', pcI), field('Как называть', uI)),
      dishBlock,
      field('Раздел', catS),
      field('Другие названия для поиска', aI),
      h('button', { class: 'btn primary block', type: 'submit' }, icon('check'), 'Сохранить'),
      extra.length ? h('div', { class: 'grid2' }, extra) : null);
  });
}

/* ---------- таблица КБЖУ ---------- */
export function baseSheet() {
  const st = { q: '', cat: '' };
  sheet('Таблица КБЖУ', () => {
    const table = h('div', { class: 'ptable' });
    const count = h('span', { class: 'hint' });
    const draw = () => {
      let list = st.q.trim() ? search(st.q, 200) : products();
      if (st.cat) list = list.filter(x => x.cat === st.cat);
      count.textContent = `${list.length} шт.`;
      const rows = [];
      let cat = null;
      for (const x of list) {
        if (!st.q.trim() && x.cat !== cat) { cat = x.cat; rows.push(h('div', { class: 'pgrp' }, cat)); }
        rows.push(h('button', { type: 'button', class: 'pr', onclick: () => productSheet(x, { onSaved: draw }) },
          h('span', { class: 'n' }, x.name, x.user ? h('span', { class: 'tag acc' }, 'моё') : x.edited ? h('span', { class: 'tag' }, 'изменено') : null,
            x.pc ? h('small', null, `1 ${x.u || 'шт'} = ${num(x.pc)} г`) : null),
          h('span', null, num(x.kcal)), h('span', null, num(x.p, 1)), h('span', null, num(x.f, 1)), h('span', null, num(x.c, 1)), h('span', null, num(x.fb, 1))));
      }
      table.replaceChildren(
        h('div', { class: 'pr ph' }, h('span', { class: 'n' }, 'на 100 г'), h('span', null, 'ккал'), h('span', null, 'Б'), h('span', null, 'Ж'), h('span', null, 'У'), h('span', null, 'Кл')),
        ...(rows.length ? rows : [h('div', { class: 'empty' }, 'Ничего не нашлось. Добавь свой продукт кнопкой выше.')]));
    };
    const q = input({ value: st.q, placeholder: 'Поиск: творог, крылья, сулугуни…', type: 'search' });
    q.addEventListener('input', () => { st.q = q.value; draw(); });
    const cs = h('select', { class: 'inp' }, h('option', { value: '' }, 'Все разделы'), CATS.map(c => h('option', { value: c }, c)));
    cs.addEventListener('change', () => { st.cat = cs.value; draw(); });
    draw();
    return h('div', { class: 'stack' },
      h('div', { class: 'grid2' },
        btn('Новый продукт', () => productSheet(null, { name: st.q.trim(), onSaved: draw }), 'primary sm', 'plus'),
        btn('Блюдо из ингредиентов', () => productSheet(null, { dish: true, onSaved: draw }), 'soft sm', 'chef-hat')),
      h('div', { class: 'grid2' }, q, cs),
      h('div', { class: 'row between' }, h('span', { class: 'hint' }, 'Нажми на строку, чтобы изменить.'), count),
      table,
      h('div', { class: 'hint' }, 'Значения на 100 г (напитки — на 100 мл). Источники: таблицы Скурихина, USDA, типичные этикетки; блюда — по домашней рецептуре. Цифры примерные: сверяй с этикеткой и правь под себя.'));
  });
}
