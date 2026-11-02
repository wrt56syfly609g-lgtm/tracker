// Листы «Экспорт» и «Импорт»: программы (шаблоны целиком) и пачки отдельных упражнений.
import { all, MUSCLES } from '../store.js';
import { h, icon, btn, chips, sw, field, sheet, toast, stat } from '../ui.js';
import { today } from '../calc.js';
import { collect, toText, toJSON, toLink, parseImport, planImport, applyImport } from '../exchange.js';

const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const off = (el, d) => { el.disabled = !!d; return el; };
const banner = (text, cls = '') => h('div', { class: 'banner ' + cls }, icon(cls ? 'info-circle' : 'alert-triangle'), h('div', null, text));
const row = (label, control, hint) => h('div', { class: 'row between', style: 'gap:12px' },
  h('div', { class: 'grow' }, h('div', null, label), hint && h('div', { class: 'hint' }, hint)), control);

async function copy(text, msg = 'Скопировано') {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { toast('Не удалось скопировать. Выдели текст в поле и скопируй вручную.'); }
}
function download(text, name, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function share(text, fmt, name) {
  try {
    if (fmt === 'json') {
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Упражнения для «Подхода»' }); return; }
    }
    await navigator.share({ title: 'Упражнения для «Подхода»', text });
  } catch (e) { if (e?.name !== 'AbortError') toast('Не получилось поделиться. Скопируй текст.'); }
}

/* ---------- экспорт ---------- */
// pre: { tplIds, exIds } — что выбрано сразу. По умолчанию все шаблоны.
export function exportSheet(pre = {}) {
  const tpls = all('tpl').sort(byName), exs = all('ex').sort(byName);
  const selT = new Set(pre.tplIds ?? tpls.map(t => t.id)), selE = new Set(pre.exIds ?? []);
  let fmt = 'text', muscle = null, open = !!pre.exIds?.length || !tpls.length;
  sheet('Экспорт', () => {
    const body = h('div', { class: 'stack' });
    const draw = () => {
      const s = { tplIds: [...selT], exIds: [...selE] };
      const { tpls: ct, exs: ce } = collect(s);
      const text = ce.length ? (fmt === 'json' ? toJSON(s) : toText(s)) : '';
      const inTpl = new Set(ct.flatMap(t => t.items.map(i => i.ex)));
      const vis = exs.filter(e => !muscle || e.muscle === muscle);
      const name = `podhod-${ct.length ? 'programma' : 'uprazhneniya'}-${today()}.${fmt === 'json' ? 'json' : 'txt'}`;
      const exPart = h('details', { class: 'more', ontoggle: e => { open = e.target.open; } },
        h('summary', null, `Отдельные упражнения · выбрано ${selE.size}`),
        h('div', { class: 'stack', style: 'margin-top:10px' },
          chips({ opts: MUSCLES, value: muscle, cls: 'sm', onChange: v => { muscle = v; draw(); } }),
          h('div', { class: 'grid2' },
            btn('Выбрать все', () => { vis.forEach(e => selE.add(e.id)); draw(); }, 'sm'),
            btn('Снять все', () => { vis.forEach(e => selE.delete(e.id)); draw(); }, 'sm ghost')),
          vis.length ? h('div', { class: 'list' }, vis.map(e => h('div', { class: 'item' },
            h('div', { class: 't' }, h('b', null, e.name), h('span', null, e.muscle)),
            inTpl.has(e.id) && !selE.has(e.id) ? h('span', { class: 'tag' }, 'в шаблоне')
              : sw(selE.has(e.id), v => { v ? selE.add(e.id) : selE.delete(e.id); draw(); }, e.name))))
            : h('div', { class: 'empty' }, 'В этой группе упражнений нет.')));
      exPart.open = open;
      body.replaceChildren(
        h('div', { class: 'hint' }, 'Программа — это шаблоны целиком. Можно добавить или отправить отдельно пачку упражнений. Упражнения из выбранных шаблонов попадают сами.'),
        h('div', { class: 'sec-label' }, `Шаблоны · ${selT.size} из ${tpls.length}`),
        tpls.length ? h('div', { class: 'list' }, tpls.map(t => h('div', { class: 'item' },
          h('div', { class: 't' }, h('b', null, t.name), h('span', null, `${t.items.length} упр.`)),
          sw(selT.has(t.id), v => { v ? selT.add(t.id) : selT.delete(t.id); draw(); }, t.name))))
          : h('div', { class: 'empty' }, 'Шаблонов пока нет.'),
        exPart,
        field('Формат', chips({ cls: 'seg', allowNone: false, value: fmt, opts: [{ v: 'text', l: 'Текст' }, { v: 'json', l: 'Файл JSON' }], onChange: v => { fmt = v; draw(); } }),
          fmt === 'text' ? 'Читается глазами: удобно отправить в мессенджер, заметки или Claude.' : 'Для хранения и других программ.'),
        h('textarea', { class: 'inp mono', readonly: true, rows: 9, spellcheck: 'false', value: text, placeholder: 'Ничего не выбрано', 'aria-label': 'Что будет выгружено' }),
        h('div', { class: 'hint' }, `Выгрузится ${ct.length} шабл. и ${ce.length} упр.`),
        h('div', { class: 'grid2' },
          off(btn('Скопировать', () => copy(text), 'primary', 'copy'), !text),
          off(btn('Скачать файл', () => download(text, name, fmt === 'json' ? 'application/json' : 'text/plain;charset=utf-8'), '', 'download'), !text)),
        h('div', { class: 'grid2' },
          off(btn('Ссылка', async () => copy(await toLink(toText(s), location.href.split('#')[0]), 'Ссылка скопирована. Открой её на любом устройстве — появится импорт.'), '', 'link'), !text),
          navigator.share ? off(btn('Поделиться', () => share(text, fmt, name), '', 'share'), !text) : null),
      );
    };
    draw();
    return body;
  });
}

/* ---------- импорт ---------- */
const EXAMPLE = `Шаблон: Верх
Подтягивания | Спина | 3×6–10 | отдых 2:30
Жим гири стоя | Плечи | 3×8–12/р | отдых 1:30 | шаг 8

Шаблон: Низ
Кубковый присед | Ноги | 3×8–12 | отдых 2:00

Упражнения:
Вис на полотенцах | Предплечья
Планка | Кор
`;

function help(set) {
  return h('details', { class: 'more' },
    h('summary', null, 'Как записать текстом'),
    h('div', { class: 'stack', style: 'margin-top:10px' },
      h('pre', { class: 'code-ex' }, EXAMPLE),
      h('ul', { class: 'hint rules' },
        h('li', null, 'Одна строка — одно упражнение. После названия всё необязательно и в любом порядке, через | или ;'),
        h('li', null, `Группа: ${MUSCLES.join(', ')}. Если не указать, подставится по названию.`),
        h('li', null, 'Подходы × повторы: 3×8–12, 4×6, 3×20–30 с. Отдых: отдых 90, отдых 2:30. Шаг веса: шаг 8.'),
        h('li', null, '«Шаблон: название» начинает шаблон. Строки после «Упражнения:» просто добавятся в библиотеку.'),
        h('li', null, 'Упражнения с тем же названием не задваиваются. Шаблон с тем же названием заменится.'),
        h('li', null, 'Понимает и JSON из экспорта, и файл резервной копии.')),
      btn('Вставить пример', () => set(EXAMPLE), 'sm', 'notes')));
}

const DIFF_L = { muscle: 'группа', rest: 'отдых', step: 'шаг' };
const fmtF = (f, v) => v == null ? 'как в настройках' : f === 'rest' ? mmss(v) : f === 'step' ? String(v).replace('.', ',') + ' кг' : v;

function preview(text, st, onApply) {
  if (!text.trim()) return [];
  const p = parseImport(text);
  if (p.error) return [banner(p.error)];
  const plan = planImport(p), out = [];
  if (!plan.ex.length) out.push(banner('Не нашёл ни одного упражнения. Посмотри пример ниже.'));
  else {
    out.push(h('div', { class: 'grid3' }, stat('Новых упражнений', plan.newEx.length), stat('Уже есть', plan.sameEx.length), stat('Шаблонов', plan.tpl.length)));
    if (plan.tpl.length) out.push(h('div', { class: 'list' }, plan.tpl.map(t => h('div', { class: 'item' },
      h('div', { class: 't' }, h('b', null, t.name),
        h('span', null, t.items.map(i => i.ex + (i.goal ? ` ${i.sets}×${i.goal}` : ` ×${i.sets}`)).join(', '))),
      h('span', { class: 'tag' + (t.cur ? ' gold' : ' acc') }, t.cur ? 'заменит' : 'новый')))));
    if (plan.updTpl.length) out.push(h('div', { class: 'hint' }, `Шаблон с таким названием уже есть: ${plan.updTpl.map(t => t.name).join(', ')}. Его состав заменится, прошлые тренировки не тронутся.`));
    if (plan.newEx.length) out.push(h('details', { class: 'more' },
      h('summary', null, `Новые упражнения · ${plan.newEx.length}`),
      h('div', { class: 'list' }, plan.newEx.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(e => h('div', { class: 'item' },
        h('div', { class: 't' }, h('b', null, e.name),
          h('span', null, [e.muscle + (e.guessed ? ' (?)' : ''), e.rest && 'отдых ' + mmss(e.rest), e.step && 'шаг ' + fmtF('step', e.step)].filter(Boolean).join(' · '))))))));
    if (plan.guessed.length) out.push(h('div', { class: 'hint' }, `У ${plan.guessed.length} упр. группа мышц не указана, подставил по названию (отмечены «?»). Поменять можно в библиотеке.`));
    if (plan.changedEx.length) out.push(row('Обновить настройки у упражнений, которые уже есть', sw(st.overwrite, v => st.set(v), 'Обновить настройки'),
      plan.changedEx.slice(0, 6).map(e => `${e.name}: ${e.diff.map(f => `${DIFF_L[f]} ${fmtF(f, e.cur[f])} → ${fmtF(f, e[f])}`).join(', ')}`).join('; ')
      + (plan.changedEx.length > 6 ? ` и ещё ${plan.changedEx.length - 6}` : '')));
  }
  if (p.skipped.length) out.push(h('details', { class: 'more' },
    h('summary', null, `Пропущено строк, которые не похожи на упражнение: ${p.skipped.length}`),
    h('ul', { class: 'hint rules' }, p.skipped.slice(0, 30).map(s => h('li', null, s)))));
  if (plan.ex.length) out.push(btn('Импортировать', () => onApply(plan), 'primary block', 'check'));
  return out;
}

export function importSheet(initial = '') {
  let text = initial, overwrite = true;
  sheet('Импорт', close => {
    const ta = h('textarea', { class: 'inp mono', rows: 8, spellcheck: 'false', value: text, 'aria-label': 'Текст для импорта', placeholder: 'Вставь программу или список упражнений: текст, JSON или таблицу' });
    const prev = h('div', { class: 'stack' });
    const file = h('input', { type: 'file', accept: '.json,.txt,.md,.csv,.tsv,text/plain,application/json', hidden: true });
    const st = { get overwrite() { return overwrite; }, set: v => { overwrite = v; draw(); } };
    const draw = () => prev.replaceChildren(...preview(text, st, plan => {
      const undo = applyImport(plan, { overwrite });
      close();
      const parts = [plan.newEx.length && `упражнений ${plan.newEx.length}`, plan.newTpl.length && `шаблонов ${plan.newTpl.length}`, plan.updTpl.length && `обновлено шаблонов ${plan.updTpl.length}`].filter(Boolean);
      toast(parts.length ? `Готово, добавлено: ${parts.join(', ')}.` : 'Готово, всё уже было в библиотеке.', 'Вернуть', undo, 10000);
    }));
    const set = v => { ta.value = text = v; draw(); };
    let tm;
    ta.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { text = ta.value; draw(); }, 300); });
    file.addEventListener('change', async () => {
      const f = file.files[0]; file.value = '';
      if (!f) return;
      try { set(await f.text()); } catch { toast('Не удалось прочитать файл.'); }
    });
    draw();
    return h('div', { class: 'stack' },
      h('div', { class: 'hint' }, 'Программа (шаблоны) или пачка отдельных упражнений: текстом, файлом или по ссылке. Перед загрузкой видно, что добавится.'),
      ta,
      h('div', { class: 'grid2' },
        navigator.clipboard?.readText ? btn('Вставить', async () => {
          try { set(await navigator.clipboard.readText()); } catch { toast('Нет доступа к буферу обмена. Вставь в поле вручную.'); ta.focus(); }
        }, '', 'clipboard') : null,
        btn('Из файла', () => file.click(), '', 'upload')),
      file, prev, help(set));
  });
}
