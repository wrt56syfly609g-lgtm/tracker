// Раздел «Тренировка»: шаблоны, активная тренировка с таблицей подходов, история, библиотека упражнений.
import { S, all, get, put, remove, MUSCLES } from '../store.js';
import { h, icon, ibtn, btn, chips, stepper, sheet, field, input, toast, card, sw, confirmSheet } from '../ui.js';
import {
  num, today, fmtDate, fmtShort, hhmm, woMinutes, woKcal, woKcalAuto, workSets, rpe, exName, exStep,
  lastSession, bestBefore, isRecord, setsText, fatigueWarning, currentWeight, KINDS, kindOf, isUni,
} from '../calc.js';
import { startRest, stopRest, unlockAudio } from '../timer.js';
import { exportSheet, importSheet, reportSheet } from './exchange.js';

let viewWo = null; // id прошлой тренировки, открытой для просмотра/правки
let upNext = null; // { wo, idx, i } — подход, к которому перешли после галочки в суперсете или круге

const restOf = exId => S.ex[exId]?.rest || S.settings.rest;
const fmtRest = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const save = w => put('wo', w);
const kindL = exId => (kindOf(exId) === 'w' ? null : KINDS[kindOf(exId)].l.toLowerCase());
const row = (label, control, hint) => h('div', { class: 'row between', style: 'gap:12px' },
  h('div', { class: 'grow' }, h('div', null, label), hint && h('div', { class: 'hint' }, hint)), control);

// Новый подход. У упражнений на каждую сторону есть r2 (правая), one: 'L' — подход только левой.
const blank = (uni, one) => ({ w: null, r: null, ...(uni ? { r2: null } : {}), ...(one ? { one: 'L' } : {}), rir: null, warm: false, done: false });

// Подходы новой тренировки: вес и повторы как в прошлый раз, но рабочих не меньше, чем в шаблоне.
// У упражнений на каждую сторону подходы только левой (extra в шаблоне) идут в конце.
function prefill(exId, count = 3, extra = 0) {
  const uni = isUni(exId), last = lastSession(exId);
  const copy = s => ({ w: s.w ?? null, r: s.r ?? null, ...(uni ? { r2: s.one ? null : s.r2 ?? null } : {}), ...(uni && s.one ? { one: 'L' } : {}), rir: null, warm: !!s.warm, done: false });
  const src = (last?.sets || []).filter(s => s.w != null || s.r != null || s.r2 != null).filter(s => uni || !s.one);
  const warm = src.filter(s => s.warm).map(copy);
  const pairs = src.filter(s => !s.warm && !s.one).map(copy);
  const ones = src.filter(s => !s.warm && s.one).map(copy);
  while (pairs.length < count) pairs.push(pairs.length ? { ...pairs[pairs.length - 1] } : blank(uni));
  while (uni && ones.length < extra) ones.push(ones.length ? { ...ones[ones.length - 1] } : { ...(pairs[pairs.length - 1] || blank(uni)), r2: null, one: 'L' });
  return [...warm, ...pairs, ...ones];
}

function startWorkout(tplId) {
  unlockAudio();
  const tpl = tplId && get('tpl', tplId);
  const items = (tpl?.items || []).filter(i => get('ex', i.ex)).map(i => {
    const extra = isUni(i.ex) ? i.extra || 0 : 0;
    return {
      ex: i.ex, goal: i.goal ? `${i.sets || 3}×${i.goal}${extra ? ` +${extra} Л` : ''}` : null, tech: null, note: '',
      sets: prefill(i.ex, i.sets || 3, extra), ...(i.link ? { link: true } : {}),
    };
  });
  if (items.length) delete items[items.length - 1].link;
  upNext = null;
  save({ date: today(), start: Date.now(), end: null, active: true, tpl: tplId || null, name: tpl?.name || 'Свободная тренировка', items, srpe: null, kcal: null, note: '' });
}

/* ---------- суперсеты и круги ---------- */
// Группа — подряд идущие упражнения, где у каждого, кроме последнего, стоит «сразу следующее» (link).
function groupOf(items, idx) {
  let from = idx, to = idx;
  while (from > 0 && items[from - 1].link) from--;
  while (to < items.length - 1 && items[to].link) to++;
  return { from, to };
}
const firstOpen = it => it.sets.findIndex(s => !s.done);

// После галочки: внутри круга — сразу к следующему упражнению без отдыха; после последнего — отдых и снова первое.
// У обычного упражнения — отдых, а когда подходы кончились, экран переходит к следующему упражнению.
function afterSet(w, idx) {
  const { from, to } = groupOf(w.items, idx);
  const find = (a, b) => { for (let j = a; j <= b; j++) { const i = firstOpen(w.items[j]); if (i >= 0) return { idx: j, i }; } return null; };
  let next = find(idx + 1, to);
  if (!next) {
    startRest(restOf(w.items[to].ex));
    next = find(from, to);
    if (next && from === to) next = null;
    else if (!next) next = find(to + 1, w.items.length - 1);
  }
  upNext = next && { wo: w.id, ...next };
  if (next) requestAnimationFrame(() => requestAnimationFrame(() =>
    document.getElementById(`set-${next.idx}-${next.i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
}

export function render(ctx) {
  const active = all('wo', w => w.active)[0];
  if (active) return editor(ctx, active);
  if (viewWo && get('wo', viewWo)) return editor(ctx, get('wo', viewWo));
  viewWo = null;
  return home(ctx);
}

/* ---------- главный экран раздела ---------- */
function home(ctx) {
  const out = [];
  if (fatigueWarning()) out.push(h('div', { class: 'banner' }, icon('alert-triangle'),
    h('div', null, 'Последние три тренировки были тяжёлыми (усталость 8+). Сегодня можно снизить вес примерно на 10 % или сделать на подход меньше.')));
  const tpls = all('tpl').sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  out.push(card('Начать тренировку', 'player-play',
    tpls.length ? h('div', { class: 'list' }, tpls.map(t => h('div', { class: 'item' },
      h('div', { class: 't' }, h('b', null, t.name), h('span', null, t.items.map(i => exName(i.ex)).slice(0, 4).join(', ') + (t.items.length > 4 ? '…' : ''))),
      ibtn('pencil', () => editTemplate(t), 'Изменить шаблон'),
      h('button', { type: 'button', class: 'btn primary sm', onclick: () => startWorkout(t.id) }, icon('player-play', 'sm'), 'Старт'))))
      : h('div', { class: 'empty' }, 'Шаблонов пока нет.'),
    h('div', { class: 'grid2' },
      btn('Пустая тренировка', () => startWorkout(null), 'soft', 'plus'),
      btn('Новый шаблон', () => editTemplate({ name: '', items: [] }), '', 'plus'))));

  const hist = all('wo', w => !w.active).sort((a, b) => b.start - a.start).slice(0, 30);
  out.push(card('История', 'history',
    hist.length ? h('div', { class: 'list' }, hist.map(w => {
      const sets = w.items.reduce((a, it) => a + workSets(it).length, 0);
      return h('button', { type: 'button', class: 'item', style: 'background:none;border-left:0;border-right:0;border-bottom:0;width:100%;text-align:left', onclick: () => { viewWo = w.id; ctx.render(); window.scrollTo(0, 0); } },
        h('div', { class: 't' }, h('b', null, w.name || 'Тренировка'), h('span', null, `${fmtDate(w.date)} · ${woMinutes(w)} мин · ${sets} подх.`)),
        w.srpe != null ? h('span', { class: 'tag' }, 'усталость ' + w.srpe) : null, icon('chevron-right', 'sm'));
    })) : h('div', { class: 'empty' }, 'Здесь появятся завершённые тренировки.')));

  out.push(card('Упражнения', 'stretching',
    h('div', { class: 'muted small' }, `В библиотеке ${all('ex').length}. Можно добавить свои, задать отдых и шаг веса для каждого.`),
    btn('Открыть библиотеку', () => library(), '', 'list-check'),
    h('div', { class: 'muted small' }, 'Программы и пачки упражнений можно отправить текстом, файлом или ссылкой и загрузить обратно.'),
    h('div', { class: 'grid2' },
      btn('Экспорт', () => exportSheet(), '', 'share'),
      btn('Импорт', () => importSheet(), '', 'download')),
    btn('Отчёт для Claude', () => reportSheet(), 'ghost', 'notes')));
  return h('div', { class: 'stack', style: 'gap:14px' }, out);
}

/* ---------- тренировка (активная или прошлая) ---------- */
function editor(ctx, w) {
  const out = [];
  const kg = currentWeight();
  out.push(h('section', { class: 'card' },
    h('div', { class: 'row between' },
      h('div', { class: 'grow' }, h('div', { class: 'sec-label' }, w.active ? 'Идёт тренировка' : fmtDate(w.date)), h('h2', { class: 'disp', style: 'font-size:18px;margin-top:2px' }, w.name || 'Тренировка')),
      w.active ? h('span', { class: 'tag acc num', 'data-since': w.start }, woMinutes(w) + ' мин') : ibtn('x', () => { viewWo = null; ctx.render(); }, 'Закрыть')),
    h('div', { class: 'muted small' }, w.active ? `Начата в ${hhmm(w.start)}. Отметь подход галочкой, и запустится таймер отдыха.` : `${hhmm(w.start)}–${w.end ? hhmm(w.end) : '…'}, ${woMinutes(w)} мин`)));

  w.items.forEach((it, idx) => {
    out.push(exCard(w, it, idx, groupOf(w.items, idx)));
    if (it.link && idx < w.items.length - 1) out.push(h('div', { class: 'grp-link' }, icon('link', 'sm'), 'сразу следующее, без отдыха'));
  });
  out.push(btn('Добавить упражнение', () => pickExercise(exId => { w.items.push({ ex: exId, tech: null, note: '', sets: prefill(exId, 3) }); save(w); }), 'soft block', 'plus'));

  // Завершение
  const note = h('textarea', { class: 'inp', id: 'wo-note-' + w.id, placeholder: 'Как прошла тренировка', value: w.note || '' });
  note.addEventListener('change', () => { w.note = note.value; save(w); });
  out.push(card(w.active ? 'Завершение' : 'Итоги', 'circle-check',
    field('Общая усталость за тренировку (sRPE), 1–10', chips({ opts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], value: w.srpe, cls: 'sm', onChange: v => { w.srpe = v; save(w); } }),
      '1 — очень легко, 10 — предел.'),
    field('Потрачено, ккал', stepper({ value: woKcal(w, kg), step: 10, min: 0, max: 3000, onChange: v => { w.kcal = v; save(w); } }),
      w.kcal == null ? `Считается по времени: MET ${num(S.profile.met, 1)} × ${num(kg, 1)} кг × часы. Можно поправить.` : h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { w.kcal = null; save(w); } }, `Вернуть расчёт (${woKcalAuto(w, kg)} ккал)`)),
    field('Заметка', note),
    w.active
      ? h('div', { class: 'grid2' },
        btn('Отменить', () => confirmSheet('Отменить тренировку?', 'Все подходы этой тренировки будут удалены.', 'Удалить', () => { stopRest(); remove('wo', w.id); })),
        btn('Завершить', () => finish(w), 'primary', 'check'))
      : h('div', { class: 'grid2' },
        btn('Удалить', () => confirmSheet('Удалить тренировку?', `${w.name}, ${fmtDate(w.date)}.`, 'Удалить', () => { const undo = remove('wo', w.id); viewWo = null; toast('Тренировка удалена', 'Вернуть', undo); }), 'danger', 'trash'),
        btn('Готово', () => { viewWo = null; ctx.render(); }, 'primary', 'check'))));
  return h('div', { class: 'stack', style: 'gap:14px' }, out);
}

function finish(w) {
  w.active = false; w.end = Date.now();
  w.items = w.items.map(it => ({ ...it, sets: it.sets.filter(s => s.done || s.w != null || s.r != null || s.r2 != null) })).filter(it => it.sets.length);
  const prs = w.items.filter(it => { const b = bestBefore(it.ex, w.id); return it.sets.some(s => isRecord(it.ex, s, b, w.date)); });
  upNext = null;
  save(w); stopRest();
  toast(prs.length ? `Тренировка сохранена. Рекорды: ${prs.map(i => exName(i.ex)).join(', ')}` : 'Тренировка сохранена.', null, null, 6000);
}

function tipText(k, last, step) {
  const easy = 'Прошлый раз всё с запасом 2+. ';
  if (k === 'w') return easy + `Попробуй ${num(last.maxW + step, 2)} кг.`;
  if (k === 'bwx') return easy + `Добавь 1–2 повтора или попробуй +${num(last.maxW + step, 2)} кг.`;
  if (k === 'time') return easy + 'Добавь 5–10 секунд.';
  return easy + 'Добавь 1–2 повтора в подходе.';
}

function exCard(w, it, idx, grp) {
  const exId = it.ex, k = kindOf(exId), K = KINDS[k], uni = isUni(exId), step = exStep(exId);
  const last = lastSession(exId, w.id), best = bestBefore(exId, w.id);
  const inGrp = grp.to > grp.from, size = grp.to - grp.from + 1;
  const swapUp = () => {
    const a = w.items[idx - 1], b = w.items[idx], la = !!a.link, lb = !!b.link;
    [w.items[idx - 1], w.items[idx]] = [b, a];
    // «Сразу следующее» остаётся на своих местах, иначе круг развалится.
    if (la) b.link = true; else delete b.link;
    if (lb) a.link = true; else delete a.link;
    save(w);
  };
  const head = h('div', { class: 'card-h' },
    h('div', { class: 'grow' },
      inGrp ? h('div', { class: 'grp-l' }, icon('link', 'sm'), `${size === 2 ? 'Суперсет' : 'Круг'} · ${idx - grp.from + 1} из ${size}`) : null,
      h('h2', null, exName(exId)),
      h('div', { class: 'row', style: 'gap:6px;margin-top:4px;flex-wrap:wrap' },
        h('span', { class: 'tag' }, S.ex[exId]?.muscle || '—'),
        kindL(exId) ? h('span', { class: 'tag' }, kindL(exId)) : null,
        uni ? h('span', { class: 'tag' }, 'Л и П') : null,
        it.goal ? h('span', { class: 'tag acc goal', title: 'Цель из шаблона' }, icon('target', 'sm'), it.goal) : null,
        it.link && idx < w.items.length - 1
          ? h('span', { class: 'tag' }, icon('link', 'sm'), 'без отдыха')
          : h('button', { type: 'button', class: 'tag', style: 'border:0', onclick: () => editExercise(S.ex[exId]) }, icon('clock', 'sm'), 'отдых ' + fmtRest(restOf(exId))))),
    idx > 0 ? ibtn('chevron-down', swapUp, 'Поднять выше', { style: 'transform:rotate(180deg)' }) : null,
    idx < w.items.length - 1 ? ibtn('link', () => { if (it.link) delete it.link; else it.link = true; save(w); },
      it.link ? 'Не связывать со следующим' : 'Сразу следующее упражнение, без отдыха (суперсет или круг)', { class: 'ibtn' + (it.link ? ' on' : ''), 'aria-pressed': String(!!it.link) }) : null,
    ibtn('trash', () => { const copy = JSON.parse(JSON.stringify(it)); w.items.splice(idx, 1); save(w); toast(`${exName(exId)} убрано`, 'Вернуть', () => { w.items.splice(idx, 0, copy); save(w); }); }, 'Убрать упражнение'));

  const info = [];
  if (last) {
    const lr = last.lr != null ? ` · левая ${Math.round(last.lr * 100)} % от правой` : '';
    info.push(h('div', { class: 'prev num' }, `Прошлый раз ${fmtShort(last.date)}: ${setsText(last.sets, exId)}${last.rpe ? ` · RPE ${num(last.rpe, 1)}` : ''}${lr}`));
    if (last.allEasy) info.push(h('div', { class: 'tip' }, icon('target', 'sm'), tipText(k, last, step)));
  }

  // Колонки: # | вес (если есть) | повторы или Л и П | ✓. Необязательный вес (груз, резина) и вес рядом с Л и П — узкое поле без кнопок.
  const bareA = uni || k !== 'w';
  const cols = ((K.a ? 1 : 0) + (uni ? 2 : 1)) + (K.a && bareA && !uni ? 'b' : '');
  const sec = k === 'time';
  const aPh = k === 'w' ? 'кг' : k === 'band' ? 'рез.' : '+0';
  const rIn = (s, key, label, ph) => stepper({ value: s[key], step: sec ? 5 : 1, min: 0, max: sec ? 3600 : 200, sm: true, label, placeholder: ph, onChange: v => { s[key] = v; save(w); } });
  const rows = it.sets.map((s, i) => {
    const workIdx = it.sets.slice(0, i + 1).filter(x => !x.warm).length;
    const isRec = isRecord(exId, s, best, w.date);
    const isNext = upNext && upNext.wo === w.id && upNext.idx === idx && upNext.i === i && !s.done;
    const reps = uni
      ? [rIn(s, 'r', sec ? 'Левая, секунды' : 'Левая, повторы', 'Л'),
        s.one ? h('button', { type: 'button', class: 'one-l', title: 'Подход только левой. Нажми, чтобы записать и правую.', onclick: () => { delete s.one; s.r2 = null; save(w); } }, 'только Л')
          : rIn(s, 'r2', sec ? 'Правая, секунды' : 'Правая, повторы', 'П')]
      : [rIn(s, 'r', K.r, sec ? 'сек' : 'повт')];
    return h('div', { class: 'set-wrap' + (s.done ? ' done' : '') + (isNext ? ' up-next' : ''), id: `set-${idx}-${i}` },
      h('div', { class: 'set c' + cols },
        h('button', { type: 'button', class: 'n' + (s.warm ? ' warm' : ''), title: s.warm ? 'Разминочный (нажми, чтобы сделать рабочим)' : 'Рабочий (нажми, чтобы сделать разминочным)', onclick: () => { s.warm = !s.warm; save(w); } }, s.warm ? 'Р' : workIdx),
        K.a ? stepper({ value: s.w, step, min: 0, max: 1000, dec: 2, sm: true, bare: bareA, label: K.a, placeholder: aPh, onChange: v => { s.w = v; save(w); } }) : null,
        reps,
        h('button', {
          type: 'button', class: 'check' + (s.done ? ' on' : ''), 'aria-label': 'Подход выполнен', 'aria-pressed': String(!!s.done),
          onclick: () => {
            s.done = !s.done;
            if (s.done) {
              const pv = it.sets[i - 1];
              if (s.r == null && pv?.r != null) s.r = pv.r;
              if (uni && !s.one && s.r2 == null && pv && !pv.one && pv.r2 != null) s.r2 = pv.r2;
              const nx = it.sets[i + 1];
              if (nx && !nx.done && nx.w == null && nx.r == null) { nx.w = s.w; nx.r = s.r; if (uni && !nx.one && !s.one) nx.r2 = s.r2 ?? null; }
            }
            save(w);
            if (s.done && w.active) afterSet(w, idx);
          },
        }, icon('check'))),
      !s.warm && h('div', { class: 'set-sub' },
        h('span', { class: 'lbl' }, 'Запас'),
        chips({ opts: [0, 1, 2, 3, 4, { v: 5, l: '5+' }], value: s.rir ?? null, cls: 'sm', onChange: v => { s.rir = v; save(w); } }),
        s.rir != null && h('span', { class: 'lbl num' }, 'RPE ' + rpe(s.rir)),
        isRec && h('span', { class: 'tag gold' }, icon('trophy', 'sm'), 'рекорд')));
  });

  const head2 = [h('span', null, '#'), K.a ? h('span', null, uni ? K.a.replace(', кг', '') : K.a) : null,
    ...(uni ? [h('span', null, 'Левая'), h('span', null, 'Правая')] : [h('span', null, K.r)]), h('span', null, '✓')];
  // Новый подход на обе стороны встаёт перед подходами только левой.
  const addPair = () => {
    let at = it.sets.length; while (uni && at > 0 && it.sets[at - 1].one) at--;
    const l = it.sets[at - 1];
    it.sets.splice(at, 0, { ...blank(uni), w: l?.w ?? null, r: l?.r ?? null, ...(uni ? { r2: l?.r2 ?? null } : {}) });
    save(w);
  };
  const addLeft = () => { const l = it.sets[it.sets.length - 1]; it.sets.push({ ...blank(uni, true), w: l?.w ?? null, r: l?.r ?? null }); save(w); };
  const techNote = input({ value: it.note || '', placeholder: 'Заметка по технике', id: `tn-${w.id}-${idx}` });
  techNote.addEventListener('change', () => { it.note = techNote.value; save(w); });
  return h('section', { class: 'card ex-card' + (inGrp ? ' grp' : '') }, head, info,
    h('div', { class: 'set-head c' + cols }, head2),
    h('div', { class: 'sets' }, rows),
    h('div', { class: uni ? 'grid3 set-btns' : 'grid2' },
      btn('Подход', addPair, 'sm', 'plus'),
      uni && Object.assign(btn('Левой', addLeft, 'sm', 'plus'), { title: 'Подход только левой' }),
      btn('Убрать', () => { if (it.sets.length) { it.sets.pop(); save(w); } }, 'sm ghost', 'minus')),
    field('Техника, 1–5', chips({ opts: [1, 2, 3, 4, 5].map(v => ({ v, l: String(v), title: ['плохо', 'слабо', 'нормально', 'хорошо', 'идеально'][v - 1] })), value: it.tech ?? null, cls: 'sm', onChange: v => { it.tech = v; save(w); } })),
    techNote);
}

/* ---------- выбор упражнения, библиотека, редакторы ---------- */
function exList(q, muscle, onPick) {
  const ql = q.trim().toLowerCase();
  const list = all('ex', e => (!muscle || e.muscle === muscle) && (!ql || e.name.toLowerCase().includes(ql))).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return list.length ? h('div', { class: 'list' }, list.map(e => h('button', {
    type: 'button', class: 'item', style: 'background:none;border-left:0;border-right:0;border-bottom:0;width:100%;text-align:left', onclick: () => onPick(e),
  }, h('div', { class: 't' }, h('b', null, e.name), h('span', null, [e.muscle, kindL(e.id), e.uni && 'Л и П', 'отдых ' + fmtRest(restOf(e.id))].filter(Boolean).join(' · '))), icon('chevron-right', 'sm'))))
    : h('div', { class: 'empty' }, 'Ничего не нашлось.');
}

function browser(title, onPick, allowCreate = true) {
  let q = '', muscle = null;
  sheet(title, close => {
    const body = h('div', { class: 'stack' });
    const res = h('div');
    const search = input({ placeholder: 'Поиск', id: 'ex-search', type: 'search' });
    const drawList = () => res.replaceChildren(exList(q, muscle, e => onPick(e, close)));
    search.addEventListener('input', () => { q = search.value; drawList(); });
    const drawChips = () => chips({ opts: MUSCLES, value: muscle, cls: 'sm', onChange: v => { muscle = v; mc.replaceWith(mc = drawChips()); drawList(); } });
    let mc = drawChips();
    body.append(search, mc, res,
      allowCreate && btn('Новое упражнение', () => { close(); editExercise({ name: q, muscle: muscle || MUSCLES[0] }, e => onPick(e, () => {})); }, 'soft', 'plus'));
    drawList();
    return body;
  });
}
const pickExercise = cb => browser('Добавить упражнение', (e, close) => { close(); cb(e.id); });
const library = () => browser('Библиотека упражнений', (e, close) => { close(); editExercise(e); });

const KIND_HINT = {
  w: 'Вес и повторы. Прогресс — по расчётному максимуму.',
  bw: 'Только повторы, без поля веса. Прогресс и рекорды — по лучшему подходу.',
  bwx: 'Добавочный вес (можно оставить пустым) и повторы. Расчётный максимум считается вместе с весом тела.',
  band: 'Повторы и, если хочешь, сила резины. Прогресс — по повторам.',
  time: 'Секунды вместо повторов и добавочный вес, если есть. Прогресс — по лучшему времени.',
};

function editExercise(src, onSaved) {
  const x = { ...src }, isNew = !x.id;
  sheet(isNew ? 'Новое упражнение' : 'Упражнение', close => {
    const body = h('div', { class: 'stack' });
    const draw = () => {
      const name = input({ value: x.name || '', placeholder: 'Название', id: 'ex-name' });
      name.addEventListener('input', () => { x.name = name.value; });
      body.replaceChildren(
        field('Название', name),
        field('Группа мышц', chips({ opts: MUSCLES, value: x.muscle, allowNone: false, onChange: v => { x.muscle = v; draw(); } })),
        field('Тип', chips({ opts: Object.entries(KINDS).map(([v, o]) => ({ v, l: o.l })), value: KINDS[x.kind] ? x.kind : 'w', allowNone: false, onChange: v => { x.kind = v; draw(); } }),
          KIND_HINT[KINDS[x.kind] ? x.kind : 'w']),
        row('На каждую сторону', sw(!!x.uni, v => { x.uni = v; draw(); }, 'На каждую сторону'),
          'Левая и правая записываются отдельно, левая первой. В шаблоне можно добавить подходы только левой.'),
        h('div', { class: 'grid2' },
          field('Отдых, сек', stepper({ value: x.rest ?? null, step: 15, min: 15, max: 900, placeholder: String(S.settings.rest), onChange: v => { x.rest = v; draw(); } }), 'Пусто — как в настройках'),
          x.kind === 'bw' ? null : x.kind === 'band'
            ? field('Шаг резины', stepper({ value: x.step ?? null, step: 1, min: 0.5, max: 50, dec: 2, placeholder: '1', onChange: v => { x.step = v; draw(); } }), 'Пусто — 1')
            : field('Шаг веса, кг', stepper({ value: x.step ?? null, step: 0.5, min: 0.5, max: 50, dec: 2, placeholder: String(S.settings.step).replace('.', ','), onChange: v => { x.step = v; draw(); } }), 'Пусто — как в настройках')),
        h('div', { class: 'grid2' },
          isNew ? btn('Отмена', close) : btn('Удалить', () => { close(); const undo = remove('ex', x.id); toast('Упражнение удалено', 'Вернуть', undo); }, 'danger', 'trash'),
          btn('Сохранить', () => {
            if (!(x.name || '').trim()) { name.focus(); return; }
            x.name = x.name.trim();
            const rec = put('ex', isNew ? x : Object.assign(get('ex', x.id) || {}, x));
            close(); onSaved && onSaved(rec);
          }, 'primary', 'check')));
    };
    draw();
    return body;
  });
}

// Цель по повторам в шаблоне: «8–12», «6–10/р», «20–30 с». Показывается во время тренировки.
function goalInput(it) {
  const el = input({ value: it.goal || '', placeholder: 'повторы, напр. 8–12', class: 'inp sm', 'aria-label': 'Цель по повторам', maxlength: 80 });
  el.addEventListener('input', () => { const v = el.value.trim(); if (v) it.goal = v; else delete it.goal; });
  return el;
}

function editTemplate(src) {
  const x = JSON.parse(JSON.stringify(src)), isNew = !x.id;
  sheet(isNew ? 'Новый шаблон' : 'Шаблон', close => {
    const body = h('div', { class: 'stack' });
    const draw = () => {
      const name = input({ value: x.name || '', placeholder: 'Например, Грудь и спина', id: 'tpl-name' });
      name.addEventListener('input', () => { x.name = name.value; });
      body.replaceChildren(
        field('Название', name),
        x.items.length ? h('div', { class: 'list' }, x.items.map((it, i) => h('div', { class: 'item tpl-it' + (it.link && i < x.items.length - 1 ? ' linked' : '') },
          h('div', { class: 't' }, h('b', null, exName(it.ex)),
            h('span', null, [S.ex[it.ex]?.muscle, kindL(it.ex), isUni(it.ex) && 'Л и П'].filter(Boolean).join(' · ')), goalInput(it)),
          h('div', { style: 'width:120px' }, stepper({ value: it.sets, step: 1, min: 1, max: 12, sm: true, label: isUni(it.ex) ? 'Подходов на каждую сторону' : 'Подходов', onChange: v => { it.sets = v || 1; draw(); } })),
          ibtn('trash', () => { x.items.splice(i, 1); draw(); }, 'Убрать'),
          (isUni(it.ex) || i < x.items.length - 1) && h('div', { class: 'tpl-opts' },
            isUni(it.ex) ? chips({ opts: [{ v: 1, l: '+1 левой' }, { v: 2, l: '+2 левой' }], value: it.extra || null, cls: 'sm', onChange: v => { if (v) it.extra = v; else delete it.extra; draw(); } }) : null,
            i < x.items.length - 1 ? chips({ opts: [{ v: true, l: 'сразу следующее', ic: 'link', title: 'Без отдыха к следующему упражнению: суперсет или круг' }], value: it.link ? true : null, cls: 'sm', onChange: v => { if (v) it.link = true; else delete it.link; draw(); } }) : null)))) : h('div', { class: 'empty' }, 'Добавь упражнения в шаблон.'),
        btn('Добавить упражнение', () => browser('Добавить в шаблон', (e, c) => { c(); x.items.push({ ex: e.id, sets: 3 }); draw(); }, false), 'soft', 'plus'),
        !isNew && btn('Экспорт шаблона', () => { close(); exportSheet({ tplIds: [x.id] }); }, 'ghost sm', 'share'),
        h('div', { class: 'grid2' },
          isNew ? btn('Отмена', close) : btn('Удалить', () => { close(); const undo = remove('tpl', x.id); toast('Шаблон удалён', 'Вернуть', undo); }, 'danger', 'trash'),
          btn('Сохранить', () => {
            if (!(x.name || '').trim()) { name.focus(); return; }
            x.name = x.name.trim();
            if (x.items.length) delete x.items[x.items.length - 1].link;
            put('tpl', isNew ? x : Object.assign(get('tpl', x.id) || {}, x)); close();
          }, 'primary', 'check')));
    };
    draw();
    return body;
  });
}
