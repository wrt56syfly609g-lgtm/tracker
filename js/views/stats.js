// Раздел «Статистика»: день / неделя / месяц — питание, баланс и вес, рутина, тренировки, сон; прогресс упражнений.
import { S, all, MUSCLES } from '../store.js';
import { h, icon, ibtn, chips, card, stat, macroRow } from '../ui.js';
import { lineChart, barChart } from '../charts.js';
import {
  num, signed, avg, today, addDays, weekStart, monthStart, monthEnd, addMonths, range, fmtDate, fmtShort, parse, MONTHS, WD_SHORT,
  totals, energy, model, targets, habitsSorted, isDone, streak, dayRatio, dayRec, readiness, workoutsOn, woMinutes, woKcal,
  workSets, sessions, exName, pct, setsText, KJ, KCAL_PER_KG, currentWeight, currentBf,
} from '../calc.js';

let mode = 'week', anchor = today(), exSel = null;

function period() {
  if (mode === 'day') return { a: anchor, b: anchor, label: fmtDate(anchor) };
  if (mode === 'week') { const a = weekStart(anchor), b = addDays(a, 6); return { a, b, label: `${fmtShort(a)} – ${fmtShort(b)}` }; }
  const a = monthStart(anchor), b = monthEnd(anchor), d = parse(a);
  return { a, b, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
}
function shift(n) {
  anchor = mode === 'day' ? addDays(anchor, n) : mode === 'week' ? addDays(anchor, 7 * n) : addMonths(anchor, n);
  if (anchor > today()) anchor = today();
}

export function render(ctx) {
  const P = period(), end = P.b < today() ? P.b : today();
  const days = P.a <= end ? range(P.a, end) : [];
  const out = [];
  const canNext = P.b < today();

  out.push(h('div', { class: 'stack' },
    chips({ cls: 'seg', allowNone: false, value: mode, opts: [{ v: 'day', l: 'День' }, { v: 'week', l: 'Неделя' }, { v: 'month', l: 'Месяц' }], onChange: v => { mode = v; ctx.render(); } }),
    h('div', { class: 'row between' },
      ibtn('chevron-left', () => { shift(-1); ctx.render(); }, 'Назад'),
      h('b', { class: 'disp', style: 'font-size:15px' }, P.label),
      ibtn('chevron-right', () => { shift(1); ctx.render(); }, 'Вперёд', { disabled: !canNext }))));

  /* Питание */
  const logged = days.filter(d => totals(d).n > 0);
  const tg = targets(end || today());
  const sum = logged.reduce((a, d) => { const t = totals(d); a.k += t.kcal; a.p += t.p; a.f += t.f; a.c += t.c; a.fb += t.fb; return a; }, { k: 0, p: 0, f: 0, c: 0, fb: 0 });
  const n = logged.length || 1;
  const nutr = [
    h('div', { class: 'grid3' },
      stat(mode === 'day' ? 'Съедено' : 'В среднем за день', num(sum.k / n) + ' ккал'),
      stat('В кДж', num(sum.k / n * KJ)),
      stat('Дней с записями', `${logged.length} из ${days.length}`)),
    macroRow('Белки', 'c-p', sum.p / n, tg.p), macroRow('Жиры', 'c-f', sum.f / n, tg.f), macroRow('Углеводы', 'c-c', sum.c / n, tg.c),
    macroRow('Клетчатка', 'c-fb', sum.fb / n, tg.fb),
  ];
  if (mode !== 'day') nutr.push(barChart(range(P.a, P.b).map(d => ({
    x: mode === 'week' ? WD_SHORT[parse(d).getDay()] : String(parse(d).getDate()), y: d <= today() ? totals(d).kcal : 0,
  })), { target: tg.kcal, labelEvery: mode === 'week' ? 1 : 5 }), h('div', { class: 'hint' }, 'Пунктир — цель по калориям. Красным — дни заметно выше цели.'));
  out.push(card('Питание', 'salad', nutr));

  /* Баланс и вес */
  const bal = logged.reduce((a, d) => a + energy(d).bal, 0);
  const M = model();
  const wPts = days.filter(d => M.days[d]).map(d => ({ x: fmtShort(d), y: Math.round(M.days[d].w * 10) / 10 }));
  out.push(card('Баланс и вес', 'scale',
    h('div', { class: 'grid3' },
      stat('Баланс за период', signed(Math.round(bal)) + ' ккал'),
      stat('Это примерно', signed(bal / KCAL_PER_KG, 2) + ' кг'),
      stat('В среднем в день', logged.length ? signed(Math.round(bal / logged.length)) + ' ккал' : '—')),
    h('div', { class: 'grid2' },
      stat('Расчётный вес сейчас', num(currentWeight(), 1) + ' кг'),
      stat('Расчётный % жира', num(currentBf(), 1) + ' %')),
    mode !== 'day' && wPts.length > 1 ? lineChart(wPts, { dec: 1, unit: ' кг' }) : null,
    h('div', { class: 'hint' }, `Модель: 7700 ккал ≈ 1 кг. Считаются только дни с записанной едой. Отсчёт от веса ${num(S.profile.weight, 1)} кг на ${fmtDate(S.profile.weightDate)}; новые замеры вписывай в настройках.`)));

  /* Рутина */
  const ratios = days.map(dayRatio).filter(v => v != null);
  const hs = habitsSorted();
  out.push(card('Рутина', 'list-check',
    stat('Выполнение ежедневных дел', ratios.length ? Math.round(avg(ratios) * 100) + ' %' : '—'),
    hs.length ? h('div', { class: 'list' }, hs.map(x => {
      const cnt = days.filter(d => isDone(x, d)).length, s = streak(x);
      const weeks = Math.max(1, Math.ceil(days.length / 7));
      const goal = x.perWeek ? x.perWeek * weeks : days.length;
      return h('div', { class: 'item' },
        h('div', { class: 't' }, h('b', null, x.name), h('span', null, x.perWeek ? `${cnt} раз, цель ${x.perWeek} в неделю` : `${cnt} из ${days.length} дн.`)),
        s.n ? h('span', { class: 'tag fire' }, icon('flame', 'sm'), `${s.n} ${s.unit}`) : null,
        h('div', { style: 'width:64px' }, h('div', { class: 'bar' }, h('i', { style: `width:${goal ? Math.min(100, cnt / goal * 100) : 0}%` }))));
    })) : null));

  /* Тренировки */
  const wos = days.flatMap(workoutsOn);
  const kg = currentWeight();
  const muscle = Object.fromEntries(MUSCLES.map(m => [m, 0]));
  let ton = 0, setsN = 0;
  for (const w of wos) for (const it of w.items) {
    const ws = workSets(it); setsN += ws.length; ton += ws.reduce((a, s) => a + s.w * s.r, 0);
    const m = S.ex[it.ex]?.muscle; if (m in muscle) muscle[m] += ws.length;
  }
  const srpes = wos.map(w => w.srpe).filter(v => v != null);
  const maxM = Math.max(1, ...Object.values(muscle));
  out.push(card('Тренировки', 'barbell',
    h('div', { class: 'grid4' },
      stat('Тренировок', wos.length), stat('Минут', num(wos.reduce((a, w) => a + woMinutes(w), 0))),
      stat('Тоннаж, кг', num(ton)), stat('Усталость', srpes.length ? num(avg(srpes), 1) : '—')),
    h('div', { class: 'sec-label' }, 'Рабочие подходы по группам мышц'),
    h('div', { class: 'stack', style: 'gap:6px' }, MUSCLES.map(m => h('div', { class: 'hbar' },
      h('span', null, m), h('div', { class: 'bar' }, h('i', { style: `width:${muscle[m] / maxM * 100}%` })), h('b', { class: 'num', style: 'text-align:right' }, muscle[m])))),
    mode === 'week' ? h('div', { class: 'hint' }, 'Для роста мышц обычно советуют около 10–20 рабочих подходов на группу в неделю.') : null,
    h('div', { class: 'hint' }, `Потрачено на тренировках: ${num(wos.reduce((a, w) => a + woKcal(w, kg), 0))} ккал.`)));

  /* Прогресс упражнения (за всё время) */
  const exWith = all('ex').filter(e => sessions(e.id).length).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  if (exWith.length) {
    if (!exSel || !exWith.find(e => e.id === exSel)) exSel = exWith[0].id;
    const ss = sessions(exSel), last = ss[ss.length - 1], prev = ss[ss.length - 2], first = ss[0];
    const sel = h('select', { class: 'inp', id: 'ex-sel', 'aria-label': 'Упражнение' }, exWith.map(e => h('option', { value: e.id, selected: e.id === exSel }, e.name)));
    sel.addEventListener('change', () => { exSel = sel.value; ctx.render(); });
    const fmtPct = v => v == null ? '—' : signed(v, 1) + ' %';
    out.push(card('Прогресс упражнения', 'chart-line', sel,
      h('div', { class: 'grid2' },
        stat('Расчётный максимум', num(last.best, 1) + ' кг'),
        stat('Лучший рабочий вес', num(Math.max(...ss.map(s => s.maxW)), 2) + ' кг'),
        stat('К прошлому разу', fmtPct(prev ? pct(last.best, prev.best) : null), prev && last.best >= prev.best ? 'pos' : prev ? 'neg' : ''),
        stat('С начала', fmtPct(ss.length > 1 ? pct(last.best, first.best) : null), last.best >= first.best ? 'pos' : 'neg')),
      lineChart(ss.map(s => ({ x: fmtShort(s.date), y: Math.round(s.best * 10) / 10 })), { dec: 1, unit: ' кг' }),
      h('div', { class: 'hint' }, 'Расчётный максимум на 1 повтор: вес × (1 + (повторы + запас) / 30). Растёт и от веса, и от повторов.'),
      h('div', { class: 'list' }, ss.slice(-5).reverse().map(s => h('div', { class: 'item' },
        h('div', { class: 't' }, h('b', { class: 'num' }, setsText(s.sets)), h('span', null, `${fmtDate(s.date)}${s.rpe ? ' · RPE ' + num(s.rpe, 1) : ''}${s.tech ? ' · техника ' + s.tech : ''}`)),
        h('span', { class: 'num small' }, num(s.best, 1)))))));
  }

  /* Сон и самочувствие */
  const recs = days.map(dayRec).filter(Boolean);
  const pick = k => recs.map(r => r[k]).filter(v => v != null);
  const rds = days.map(readiness).filter(v => v != null);
  const sleepPts = days.map(d => ({ x: fmtShort(d), y: dayRec(d)?.sleep ?? null }));
  out.push(card('Сон и самочувствие', 'moon',
    h('div', { class: 'grid4' },
      stat('Сон, ч', pick('sleep').length ? num(avg(pick('sleep')), 1) : '—'),
      stat('Качество', pick('sq').length ? num(avg(pick('sq')), 1) : '—'),
      stat('Самочувствие', pick('well').length ? num(avg(pick('well')), 1) : '—'),
      stat('Готовность', rds.length ? num(avg(rds)) : '—')),
    mode !== 'day' ? lineChart(sleepPts, { dec: 1, unit: ' ч', target: 8 }) : null));

  /* Сон и лёгкость веса (за всё время) */
  const good = [], bad = [];
  for (const w of all('wo', w => !w.active)) {
    const sl = dayRec(w.date)?.sleep; if (sl == null) continue;
    const r = w.items.flatMap(workSets).filter(s => s.rir != null).map(s => 10 - s.rir);
    if (!r.length) continue;
    (sl >= 7.5 ? good : sl < 7 ? bad : []).push(avg(r));
  }
  out.push(card('Сон и тяжесть веса', 'zzz',
    good.length >= 2 && bad.length >= 2
      ? [h('div', { class: 'grid2' }, stat('После сна 7,5+ ч', 'RPE ' + num(avg(good), 1)), stat('После сна меньше 7 ч', 'RPE ' + num(avg(bad), 1))),
        h('div', { class: 'hint' }, avg(good) < avg(bad) ? 'Когда высыпаешься, вес ощущается легче.' : 'Пока разницы в пользу сна не видно.')]
      : h('div', { class: 'empty' }, 'Нужно хотя бы по 2 тренировки после хорошего и плохого сна, с отмеченным запасом в подходах.')));

  return h('div', { class: 'stack', style: 'gap:14px' }, out);
}
