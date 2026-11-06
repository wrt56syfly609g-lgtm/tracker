// Экран «Сегодня»: калории, рутина, тренировка, сон и самочувствие, заметка.
import { all, put } from '../store.js';
import { h, icon, btn, chips, stepper, macroRow, card, stat } from '../ui.js';
import { ring } from '../charts.js';
import { num, signed, energy, targets, habitsSorted, isDone, readiness, fatigueWarning, workoutsOn, woMinutes, workSets, tonnage, KJ, dayRec } from '../calc.js';
import { habitControl } from './habits.js';
import { st as syncSt, keyDaysLeft } from '../sync.js';

export function setDay(d, p) {
  const r = dayRec(d) || { id: d };
  put('days', Object.assign(r, p));
}

export function render(ctx) {
  const d = ctx.date, e = energy(d), tg = targets(d), t = e.t;
  const out = [];

  const rd = readiness(d);
  if (fatigueWarning()) out.push(h('div', { class: 'banner' }, icon('alert-triangle'),
    h('div', null, h('b', null, 'Три тяжёлые тренировки подряд. '), 'Общая усталость была 8 и выше. Следующую можно облегчить: примерно −10 % веса или на один подход меньше.')));
  else if (rd != null && rd < 45) out.push(h('div', { class: 'banner' }, icon('bolt'),
    h('div', null, `Готовность сегодня ${rd} из 100. Если тренируешься, ориентируйся на запас 2–3 повтора.`)));

  // Ключ GitHub скоро истечёт: без него синхронизация остановится.
  const dl = syncSt.on ? keyDaysLeft() : null;
  if (dl != null && dl <= 14) out.push(h('div', { class: 'banner' }, icon('alert-triangle'),
    h('div', { class: 'grow' }, dl < 0 ? 'Ключ GitHub истёк, синхронизация не работает. ' : `Ключ GitHub истекает через ${dl} дн. `,
      'Создай новый и замени его в настройках.'),
    btn('Открыть', () => ctx.go('settings'), 'sm')));

  // Калории
  const left = tg.kcal - t.kcal;
  out.push(card('Калории', 'flame',
    h('div', { class: 'row', style: 'gap:16px;align-items:center' },
      ring(t.kcal, tg.kcal, num(t.kcal), `из ${num(tg.kcal)} ккал`),
      h('div', { class: 'stack grow', style: 'gap:6px' },
        h('div', { class: 'row between small' }, h('span', { class: 'muted' }, left >= 0 ? 'Осталось' : 'Сверх цели'), h('b', { class: 'num' }, num(Math.abs(left)) + ' ккал')),
        h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Съедено, кДж'), h('span', { class: 'num' }, num(t.kcal * KJ))),
        h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Расход'), h('span', { class: 'num' }, num(e.burned) + ' ккал')),
        h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Баланс'),
          h('b', { class: 'num' }, signed(Math.round(e.bal)) + ' ккал')))),
    macroRow('Белки', 'c-p', t.p, tg.p), macroRow('Жиры', 'c-f', t.f, tg.f), macroRow('Углеводы', 'c-c', t.c, tg.c),
    macroRow('Клетчатка', 'c-fb', t.fb, tg.fb),
    btn('Добавить еду', () => ctx.go('food'), 'soft block', 'plus')));

  // Рутина
  const hs = habitsSorted(), done = hs.filter(x => isDone(x, d)).length;
  out.push(card(`Рутина · ${done} из ${hs.length}`, 'list-check',
    hs.length ? h('div', { class: 'list' }, hs.map(x => habitControl(x, d, true))) : h('div', { class: 'empty' }, 'Список пуст. Добавь дела в разделе «Рутина».'),
    btn('Изменить список', () => ctx.go('habits'), 'ghost sm')));

  // Тренировка
  const active = all('wo', w => w.active)[0];
  const doneW = workoutsOn(d);
  let wBody;
  if (active) wBody = [h('div', { class: 'row between' }, h('span', null, 'Идёт тренировка'), h('span', { class: 'tag acc num', 'data-since': active.start }, woMinutes(active) + ' мин')),
    btn('Продолжить', () => ctx.go('workout'), 'primary block', 'player-play')];
  else if (doneW.length) wBody = doneW.map(w => {
    const sets = w.items.reduce((a, it) => a + workSets(it).length, 0);
    const ton = w.items.reduce((a, it) => a + tonnage(it), 0);
    return h('div', { class: 'grid3' }, stat('Время', woMinutes(w) + ' мин'), stat('Подходов', sets), stat('Тоннаж', num(ton) + ' кг'));
  });
  else wBody = [btn('Начать тренировку', () => ctx.go('workout'), 'primary block', 'barbell')];
  out.push(card('Тренировка', 'barbell', wBody));

  // Сон и самочувствие
  const day = dayRec(d) || {};
  out.push(card('Сон и самочувствие', 'moon',
    h('div', { class: 'grid2' },
      h('div', { class: 'field' }, h('span', null, 'Сон, часов'), stepper({ value: day.sleep ?? null, step: 0.5, min: 0, max: 16, label: 'Сон, часов', placeholder: '0', onChange: v => setDay(d, { sleep: v }) })),
      h('div', { class: 'field' }, h('span', null, 'Готовность'), h('div', { class: 'mid', style: 'padding-top:8px' }, rd == null ? '—' : rd + ' / 100'))),
    h('div', { class: 'field' }, h('span', null, 'Качество сна'), chips({ opts: scale5(['плохо', '', '', '', 'отлично']), value: day.sq ?? null, onChange: v => setDay(d, { sq: v }) })),
    h('div', { class: 'field' }, h('span', null, 'Самочувствие'), chips({ opts: scale5(['разбит', '', '', '', 'супер']), value: day.well ?? null, onChange: v => setDay(d, { well: v }) }))));

  // Заметка
  const ta = h('textarea', { class: 'inp', id: 'note-' + d, placeholder: 'Как прошёл день, что заметил…', value: day.note || '' });
  ta.addEventListener('change', () => setDay(d, { note: ta.value }));
  out.push(card('Заметка', 'notes', ta));

  return h('div', { class: 'stack', style: 'gap:14px' }, out);
}

const scale5 = labels => [1, 2, 3, 4, 5].map((v, i) => ({ v, l: String(v), title: labels[i] || null }));
