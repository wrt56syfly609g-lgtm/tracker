// Раздел «Тренировка»: шаблоны, активная тренировка с таблицей подходов, история, библиотека упражнений.
import { S, all, get, put, remove, MUSCLES } from '../store.js';
import { h, icon, ibtn, btn, chips, stepper, sheet, field, input, toast, card, stat, confirmSheet } from '../ui.js';
import {
  num, today, fmtDate, fmtShort, hhmm, woMinutes, woKcal, woKcalAuto, workSets, e1rm, rpe, exName, exStep,
  lastSession, bestBefore, setsText, fatigueWarning, currentWeight, energy,
} from '../calc.js';
import { startRest, stopRest, unlockAudio } from '../timer.js';
import { exportSheet, importSheet } from './exchange.js';

let viewWo = null; // id прошлой тренировки, открытой для просмотра/правки

const restOf = exId => S.ex[exId]?.rest || S.settings.rest;
const fmtRest = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const save = w => put('wo', w);

function prefill(exId, count = 3) {
  const last = lastSession(exId);
  if (!last) return Array.from({ length: count }, () => ({ w: null, r: null, rir: null, warm: false, done: false }));
  const sets = last.sets.filter(s => s.w != null || s.r != null).map(s => ({ w: s.w, r: s.r, rir: null, warm: !!s.warm, done: false }));
  const work = sets.filter(s => !s.warm);
  while (work.length && sets.filter(s => !s.warm).length < count) sets.push({ ...work[work.length - 1] });
  return sets.length ? sets : [{ w: null, r: null, rir: null, warm: false, done: false }];
}

function startWorkout(tplId) {
  unlockAudio();
  const tpl = tplId && get('tpl', tplId);
  const items = (tpl?.items || []).filter(i => get('ex', i.ex)).map(i => ({ ex: i.ex, goal: i.goal ? `${i.sets || 3}×${i.goal}` : null, tech: null, note: '', sets: prefill(i.ex, i.sets || 3) }));
  save({ date: today(), start: Date.now(), end: null, active: true, tpl: tplId || null, name: tpl?.name || 'Свободная тренировка', items, srpe: null, kcal: null, note: '' });
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
      btn('Импорт', () => importSheet(), '', 'download'))));
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

  w.items.forEach((it, idx) => out.push(exCard(w, it, idx)));
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
  w.items = w.items.map(it => ({ ...it, sets: it.sets.filter(s => s.done || s.w != null || s.r != null) })).filter(it => it.sets.length);
  const prs = w.items.filter(it => { const b = bestBefore(it.ex, w.id); const ws = workSets(it); return b.n && ws.some(s => e1rm(s.w, s.r, s.rir) > b.best + 0.01 || s.w > b.maxW); });
  save(w); stopRest();
  toast(prs.length ? `Тренировка сохранена. Рекорды: ${prs.map(i => exName(i.ex)).join(', ')}` : 'Тренировка сохранена.', null, null, 6000);
}

function exCard(w, it, idx) {
  const exId = it.ex, step = exStep(exId), last = lastSession(exId, w.id), best = bestBefore(exId, w.id);
  const head = h('div', { class: 'card-h' },
    h('div', { class: 'grow' }, h('h2', null, exName(exId)),
      h('div', { class: 'row', style: 'gap:6px;margin-top:4px;flex-wrap:wrap' },
        h('span', { class: 'tag' }, S.ex[exId]?.muscle || '—'),
        it.goal ? h('span', { class: 'tag acc goal', title: 'Цель из шаблона' }, icon('target', 'sm'), it.goal) : null,
        h('button', { type: 'button', class: 'tag', style: 'border:0', onclick: () => editExercise(S.ex[exId]) }, icon('clock', 'sm'), 'отдых ' + fmtRest(restOf(exId))))),
    idx > 0 ? ibtn('chevron-down', () => { [w.items[idx - 1], w.items[idx]] = [w.items[idx], w.items[idx - 1]]; save(w); }, 'Поднять выше', { style: 'transform:rotate(180deg)' }) : null,
    ibtn('trash', () => { const copy = JSON.parse(JSON.stringify(it)); w.items.splice(idx, 1); save(w); toast(`${exName(exId)} убрано`, 'Вернуть', () => { w.items.splice(idx, 0, copy); save(w); }); }, 'Убрать упражнение'));

  const info = [];
  if (last) {
    info.push(h('div', { class: 'prev num' }, `Прошлый раз ${fmtShort(last.date)}: ${setsText(last.sets)}${last.rpe ? ` · RPE ${num(last.rpe, 1)}` : ''}`));
    if (last.allEasy) info.push(h('div', { class: 'tip' }, icon('target', 'sm'), `Прошлый раз всё с запасом 2+. Попробуй ${num(last.maxW + step, 2)} кг.`));
  }

  const rows = it.sets.map((s, i) => {
    const workIdx = it.sets.slice(0, i + 1).filter(x => !x.warm).length;
    const isRec = !s.warm && s.done && best.n > 0 && (e1rm(s.w, s.r, s.rir) > best.best + 0.01 || s.w > best.maxW);
    return h('div', { class: 'set-wrap' + (s.done ? ' done' : '') },
      h('div', { class: 'set' },
        h('button', { type: 'button', class: 'n' + (s.warm ? ' warm' : ''), title: s.warm ? 'Разминочный (нажми, чтобы сделать рабочим)' : 'Рабочий (нажми, чтобы сделать разминочным)', onclick: () => { s.warm = !s.warm; save(w); } }, s.warm ? 'Р' : workIdx),
        stepper({ value: s.w, step, min: 0, max: 1000, dec: 2, sm: true, label: 'Вес, кг', placeholder: 'кг', onChange: v => { s.w = v; save(w); } }),
        stepper({ value: s.r, step: 1, min: 0, max: 200, sm: true, label: 'Повторы', placeholder: 'повт', onChange: v => { s.r = v; save(w); } }),
        h('button', {
          type: 'button', class: 'check' + (s.done ? ' on' : ''), 'aria-label': 'Подход выполнен', 'aria-pressed': String(!!s.done),
          onclick: () => {
            s.done = !s.done;
            if (s.done) {
              if (s.r == null && it.sets[i - 1]?.r != null) s.r = it.sets[i - 1].r;
              const nx = it.sets[i + 1];
              if (nx && !nx.done && nx.w == null && nx.r == null) { nx.w = s.w; nx.r = s.r; }
              if (w.active) startRest(restOf(exId));
            }
            save(w);
          },
        }, icon('check'))),
      !s.warm && h('div', { class: 'set-sub' },
        h('span', { class: 'lbl' }, 'Запас'),
        chips({ opts: [0, 1, 2, 3, 4, { v: 5, l: '5+' }], value: s.rir ?? null, cls: 'sm', onChange: v => { s.rir = v; save(w); } }),
        s.rir != null && h('span', { class: 'lbl num' }, 'RPE ' + rpe(s.rir)),
        isRec && h('span', { class: 'tag gold' }, icon('trophy', 'sm'), 'рекорд')));
  });

  const techNote = input({ value: it.note || '', placeholder: 'Заметка по технике', id: `tn-${w.id}-${idx}` });
  techNote.addEventListener('change', () => { it.note = techNote.value; save(w); });
  return h('section', { class: 'card ex-card' }, head, info,
    h('div', { class: 'set-head' }, h('span', null, '#'), h('span', null, 'Вес, кг'), h('span', null, 'Повторы'), h('span', null, '✓')),
    h('div', { class: 'sets' }, rows),
    h('div', { class: 'grid2' },
      btn('Подход', () => { const l = it.sets[it.sets.length - 1]; it.sets.push({ w: l?.w ?? null, r: l?.r ?? null, rir: null, warm: false, done: false }); save(w); }, 'sm', 'plus'),
      btn('Убрать подход', () => { if (it.sets.length) { it.sets.pop(); save(w); } }, 'sm ghost', 'minus')),
    field('Техника, 1–5', chips({ opts: [1, 2, 3, 4, 5].map(v => ({ v, l: String(v), title: ['плохо', 'слабо', 'нормально', 'хорошо', 'идеально'][v - 1] })), value: it.tech ?? null, cls: 'sm', onChange: v => { it.tech = v; save(w); } })),
    techNote);
}

/* ---------- выбор упражнения, библиотека, редакторы ---------- */
function exList(q, muscle, onPick) {
  const ql = q.trim().toLowerCase();
  const list = all('ex', e => (!muscle || e.muscle === muscle) && (!ql || e.name.toLowerCase().includes(ql))).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return list.length ? h('div', { class: 'list' }, list.map(e => h('button', {
    type: 'button', class: 'item', style: 'background:none;border-left:0;border-right:0;border-bottom:0;width:100%;text-align:left', onclick: () => onPick(e),
  }, h('div', { class: 't' }, h('b', null, e.name), h('span', null, `${e.muscle} · отдых ${fmtRest(restOf(e.id))}`)), icon('chevron-right', 'sm'))))
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
        h('div', { class: 'grid2' },
          field('Отдых, сек', stepper({ value: x.rest ?? null, step: 15, min: 15, max: 900, placeholder: String(S.settings.rest), onChange: v => { x.rest = v; draw(); } }), 'Пусто — как в настройках'),
          field('Шаг веса, кг', stepper({ value: x.step ?? null, step: 0.5, min: 0.5, max: 50, dec: 2, placeholder: String(S.settings.step).replace('.', ','), onChange: v => { x.step = v; draw(); } }), 'Пусто — как в настройках')),
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
        x.items.length ? h('div', { class: 'list' }, x.items.map((it, i) => h('div', { class: 'item' },
          h('div', { class: 't' }, h('b', null, exName(it.ex)), h('span', null, S.ex[it.ex]?.muscle || ''), goalInput(it)),
          h('div', { style: 'width:120px' }, stepper({ value: it.sets, step: 1, min: 1, max: 12, sm: true, label: 'Подходов', onChange: v => { it.sets = v || 1; draw(); } })),
          ibtn('trash', () => { x.items.splice(i, 1); draw(); }, 'Убрать')))) : h('div', { class: 'empty' }, 'Добавь упражнения в шаблон.'),
        btn('Добавить упражнение', () => browser('Добавить в шаблон', (e, c) => { c(); x.items.push({ ex: e.id, sets: 3 }); draw(); }, false), 'soft', 'plus'),
        !isNew && btn('Экспорт шаблона', () => { close(); exportSheet({ tplIds: [x.id] }); }, 'ghost sm', 'share'),
        h('div', { class: 'grid2' },
          isNew ? btn('Отмена', close) : btn('Удалить', () => { close(); const undo = remove('tpl', x.id); toast('Шаблон удалён', 'Вернуть', undo); }, 'danger', 'trash'),
          btn('Сохранить', () => {
            if (!(x.name || '').trim()) { name.focus(); return; }
            x.name = x.name.trim();
            put('tpl', isNew ? x : Object.assign(get('tpl', x.id) || {}, x)); close();
          }, 'primary', 'check')));
    };
    draw();
    return body;
  });
}
