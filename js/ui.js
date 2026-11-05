// Общие элементы интерфейса: построение DOM, иконки, степпер, чипы, листы, уведомления.
import { parseNum, num } from './calc.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function icon(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  return t.content.firstChild;
}

export const ibtn = (name, onclick, label, extra = {}) =>
  h('button', { class: 'ibtn', type: 'button', 'aria-label': label, title: label, onclick, ...extra }, icon(name));

export function btn(text, onclick, cls = '', ic) {
  return h('button', { class: 'btn ' + cls, type: 'button', onclick }, ic && icon(ic), text);
}

// Число с кнопками − и +. onChange получает число или null.
export function stepper({ value, step = 1, min = 0, max = 1e6, dec = 1, onChange, sm, label, placeholder = '' }) {
  const inp = h('input', {
    inputmode: 'decimal', value: value == null ? '' : num(value, dec).replace(/\s/g, ''), placeholder,
    'aria-label': label, enterkeyhint: 'done',
  });
  const clamp = v => Math.min(max, Math.max(min, Math.round(v * 1000) / 1000));
  const commit = v => { onChange(v == null ? null : clamp(v)); };
  inp.addEventListener('change', () => commit(parseNum(inp.value)));
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  inp.addEventListener('focus', () => inp.select());
  const cur = () => parseNum(inp.value) ?? value ?? 0;
  return h('div', { class: 'stepper' + (sm ? ' sm' : '') },
    h('button', { type: 'button', 'aria-label': 'Меньше', onclick: () => commit(cur() - step) }, icon('minus', 'sm')),
    inp,
    h('button', { type: 'button', 'aria-label': 'Больше', onclick: () => commit(cur() + step) }, icon('plus', 'sm')),
  );
}

// Набор кнопок-вариантов. Повторное нажатие на выбранный снимает выбор (если allowNone).
export function chips({ opts, value, onChange, cls = '', allowNone = true }) {
  return h('div', { class: 'chips ' + cls, role: 'group' }, opts.map(o => {
    const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : String(o);
    return h('button', {
      type: 'button', class: 'chip' + (v === value ? ' on' : ''), 'aria-pressed': String(v === value),
      title: o.title, onclick: () => onChange(v === value && allowNone ? null : v),
    }, o.ic && icon(o.ic, 'sm'), l);
  }));
}

export const sw = (on, onChange, label) =>
  h('button', { type: 'button', class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, onclick: () => onChange(!on) });

export function field(label, control, hint) {
  return h('div', { class: 'field' }, h('span', null, label), control, hint && h('div', { class: 'hint' }, hint));
}

export function input(props) {
  const el = h('input', { class: 'inp', ...props });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && el.tagName === 'INPUT') el.blur(); });
  return el;
}

// Нижний лист (модальное окно). Возвращает функцию закрытия.
export function sheet(title, body, { onClose } = {}) {
  const close = () => { bg.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  // Esc закрывает только верхний лист, если открыто несколько.
  const esc = e => { if (e.key === 'Escape' && [...document.querySelectorAll('.sheet-bg')].pop() === bg) close(); };
  const bg = h('div', { class: 'sheet-bg', onclick: e => { if (e.target === bg) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'grab' }),
      h('div', { class: 'sh-h' }, h('h2', null, title), ibtn('x', close, 'Закрыть')),
      typeof body === 'function' ? body(close) : body));
  document.body.append(bg);
  document.addEventListener('keydown', esc);
  return close;
}

// Подтверждение внутри листа (системные confirm в приложении не используем).
export function confirmSheet(title, text, okText, onOk, danger = true) {
  sheet(title, close => h('div', { class: 'stack' },
    h('p', { style: 'margin:0' }, text),
    h('div', { class: 'grid2' },
      btn('Отмена', close),
      btn(okText, () => { close(); onOk(); }, danger ? 'danger' : 'primary'))));
}

export function toast(msg, action, onAction, ms = 4500) {
  const box = document.getElementById('toasts');
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, msg),
    action && h('button', { type: 'button', onclick: () => { el.remove(); onAction(); } }, action));
  box.append(el);
  setTimeout(() => el.remove(), ms);
}

export function bar(value, max, cls = '') {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return h('div', { class: 'bar ' + cls }, h('i', { style: `width:${p}%` }));
}

export function macroRow(label, cls, value, target, unit = 'г') {
  return h('div', { class: 'macro ' + cls },
    h('div', { class: 'row between' },
      h('span', { class: 'row', style: 'gap:6px' }, h('i', { class: 'dot' }), label),
      h('span', { class: 'num' }, h('b', null, num(value)), target ? ` / ${num(target)} ${unit}` : ` ${unit}`)),
    bar(value, target || value || 1));
}

export function stat(label, value, cls = '') {
  return h('div', { class: 'stat' }, h('span', null, label), h('b', { class: cls }, value));
}

export function card(title, ic, ...kids) {
  return h('section', { class: 'card' },
    title && h('div', { class: 'card-h' }, ic && icon(ic), h('h2', null, title)), kids);
}
