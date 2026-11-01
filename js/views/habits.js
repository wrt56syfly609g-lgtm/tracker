// Раздел «Рутина»: привычки с сериями, ежедневные дела, добавки, тепловая карта, редактор.
import { S, put, get, remove, all } from '../store.js';
import { h, icon, ibtn, btn, chips, stepper, sheet, field, input, toast, card } from '../ui.js';
import { heatmap } from '../charts.js';
import { habitsSorted, isDone, hval, streak, dayRatio, today, addDays, weekStart, range, num } from '../calc.js';

export const GROUPS = { routine: 'Рутина', daily: 'Ежедневные дела', supp: 'Добавки' };
const ICONS = ['check', 'barbell', 'brush', 'book', 'run', 'walk', 'stretching', 'dental', 'droplet', 'bath', 'vacuum-cleaner',
  'pill', 'sun', 'bed', 'moon', 'heart', 'music', 'leaf', 'sparkles', 'target', 'home', 'calendar', 'notes', 'bolt'];

const setVal = (hid, d, val) => put('hlog', { id: d + '|' + hid, date: d, hid, val });

function subText(x, d) {
  const parts = [];
  if (x.group !== 'daily') {
    const s = streak(x, d);
    if (x.perWeek) parts.push(`${s.week} из ${x.perWeek} на этой неделе`);
  }
  if (x.measure === 'qty' && x.target) parts.push(`цель ${num(x.target)} ${x.unit || ''}`.trim());
  if (x.auto === 'workout') parts.push('отмечается после тренировки');
  return parts.filter(Boolean).join(' · ');
}

export function habitControl(x, d, compact = false) {
  const done = isDone(x, d), v = hval(x.id, d);
  const s = x.group !== 'daily' ? streak(x, d) : null;
  let control;
  if (x.measure === 'qty') {
    control = h('div', { class: 'qty' }, stepper({ value: v || null, step: x.qstep || 5, min: 0, max: 100000, sm: true, placeholder: '0', label: x.name, onChange: n => setVal(x.id, d, n || 0) }));
  } else {
    control = h('button', {
      type: 'button', class: 'check' + (done ? ' on' : ''), 'aria-pressed': String(done), 'aria-label': x.name,
      onclick: () => setVal(x.id, d, v > 0 || (done && x.auto) ? 0 : 1),
    }, icon('check'));
  }
  const sub = subText(x, d);
  return h('div', { class: 'habit item' + (done ? ' done' : '') },
    h('div', { class: 'hi' }, icon(x.icon || 'check')),
    h('div', { class: 't' }, h('b', null, x.name),
      (sub || (s && s.n > 0)) ? h('span', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
        s && s.n ? h('span', { class: 'tag fire' }, icon('flame', 'sm'), `${s.n} ${s.unit}`) : null, sub) : null),
    control);
}

let editMode = false;

export function render(ctx) {
  const d = ctx.date, hs = habitsSorted();
  const out = [];
  const totalDaily = hs.filter(x => !x.perWeek);
  const ratio = dayRatio(d);
  out.push(h('div', { class: 'card' },
    h('div', { class: 'row between' },
      h('div', null, h('div', { class: 'sec-label' }, 'Выполнено за день'), h('div', { class: 'big' }, ratio == null ? '—' : Math.round(ratio * 100) + ' %')),
      h('div', { class: 'muted small', style: 'text-align:right' }, `${totalDaily.filter(x => isDone(x, d)).length} из ${totalDaily.length} ежедневных`)),
    h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((ratio || 0) * 100)}%` }))));

  for (const [g, title] of Object.entries(GROUPS)) {
    const list = hs.filter(x => (x.group || 'daily') === g);
    if (!list.length && !editMode) continue;
    out.push(card(title, null,
      list.length ? h('div', { class: 'list' }, list.map(x => editMode
        ? h('div', { class: 'item' }, h('div', { class: 'hi', style: 'width:32px;display:flex;color:var(--muted)' }, icon(x.icon || 'check')),
          h('div', { class: 't' }, h('b', null, x.name), h('span', null, describe(x))),
          ibtn('pencil', () => editHabit(x), 'Изменить'))
        : habitControl(x, d))) : h('div', { class: 'empty' }, 'Пусто'),
      editMode && btn('Добавить', () => editHabit({ group: g, measure: 'check', icon: g === 'supp' ? 'pill' : 'check' }), 'soft sm', 'plus')));
  }

  out.push(h('div', { class: 'grid2' },
    btn(editMode ? 'Готово' : 'Изменить список', () => { editMode = !editMode; ctx.render(); }, editMode ? 'primary' : '', editMode ? 'check' : 'pencil'),
    btn('Новое дело', () => editHabit({ group: 'routine', measure: 'check', icon: 'check' }), '', 'plus')));

  // Тепловая карта за 18 недель
  const end = today(), start = weekStart(addDays(end, -7 * 17));
  const cells = range(start, addDays(weekStart(end), 6)).map(x => x > end ? { pad: true, v: null } : { d: x, v: dayRatio(x), today: x === end });
  out.push(card('Последние 18 недель', 'calendar', heatmap(cells),
    h('div', { class: 'hint' }, 'Каждая клетка — день. Чем ярче, тем больше ежедневных дел выполнено.')));
  return h('div', { class: 'stack', style: 'gap:14px' }, out);
}

function describe(x) {
  const a = [x.measure === 'qty' ? `количество${x.unit ? ', ' + x.unit : ''}${x.target ? ', цель ' + num(x.target) : ''}` : 'галочка'];
  a.push(x.perWeek ? `${x.perWeek} раз в неделю` : 'каждый день');
  return a.join(' · ');
}

function editHabit(src) {
  const x = { ...src };
  const isNew = !x.id;
  sheet(isNew ? 'Новое дело' : 'Изменить', close => {
    const body = h('div', { class: 'stack' });
    const draw = () => {
      const name = input({ value: x.name || '', placeholder: 'Например, Читать', id: 'hb-name' });
      name.addEventListener('input', () => { x.name = name.value; });
      body.replaceChildren(
        field('Название', name),
        field('Группа', chips({ opts: Object.entries(GROUPS).map(([v, l]) => ({ v, l })), value: x.group, allowNone: false, onChange: v => { x.group = v; draw(); } })),
        field('Как отмечать', chips({ cls: 'seg', allowNone: false, value: x.measure, opts: [{ v: 'check', l: 'Галочка' }, { v: 'qty', l: 'Количество' }], onChange: v => { x.measure = v; draw(); } })),
        x.measure === 'qty' && h('div', { class: 'grid3' },
          field('Единица', (() => { const i = input({ value: x.unit || '', placeholder: 'мин' }); i.addEventListener('input', () => { x.unit = i.value; }); return i; })()),
          field('Цель', stepper({ value: x.target ?? null, step: 5, min: 0, max: 100000, sm: true, placeholder: '—', onChange: v => { x.target = v; draw(); } })),
          field('Шаг', stepper({ value: x.qstep ?? 5, step: 1, min: 1, max: 1000, sm: true, onChange: v => { x.qstep = v; draw(); } }))),
        field('Расписание', chips({ cls: 'seg', allowNone: false, value: x.perWeek ? 'w' : 'd', opts: [{ v: 'd', l: 'Каждый день' }, { v: 'w', l: 'N раз в неделю' }], onChange: v => { x.perWeek = v === 'w' ? (x.perWeek || 3) : null; draw(); } }),
          x.perWeek ? 'Серия считается неделями: пропуски в остальные дни её не ломают.' : null),
        x.perWeek && field('Раз в неделю', stepper({ value: x.perWeek, step: 1, min: 1, max: 7, onChange: v => { x.perWeek = v || 1; draw(); } })),
        field('Значок', h('div', { class: 'icon-grid' }, ICONS.map(ic => h('button', { type: 'button', class: x.icon === ic ? 'on' : '', 'aria-label': ic, onclick: () => { x.icon = ic; draw(); } }, icon(ic))))),
        h('div', { class: 'grid2' },
          isNew ? btn('Отмена', close) : btn('Удалить', () => {
            close(); const undo = remove('habits', x.id); toast(`«${x.name}» удалено`, 'Вернуть', undo);
          }, 'danger', 'trash'),
          btn('Сохранить', () => {
            if (!(x.name || '').trim()) { name.focus(); return; }
            x.name = x.name.trim();
            if (isNew) { x.c = today(); x.order = Math.max(0, ...all('habits').map(y => y.order || 0)) + 1; }
            put('habits', isNew ? x : Object.assign(get('habits', x.id) || {}, x));
            close();
          }, 'primary', 'check')),
      );
    };
    draw();
    return body;
  });
}
