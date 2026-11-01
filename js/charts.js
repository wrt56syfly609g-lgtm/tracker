// Простые SVG-графики: линия, столбцы, кольцо, тепловая карта. Цвета берутся из темы (CSS).
import { h } from './ui.js';
import { num } from './calc.js';

const svg = (w, ht, inner) => {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${ht}" role="img">${inner}</svg>`;
  return t.content.firstChild;
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function scale(vals, target) {
  const all = vals.concat(target != null ? [target] : []);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15;
  return [lo - pad, hi + pad];
}

// points: [{x: подпись, y: число}]
export function lineChart(points, { h: H = 150, target, dec = 0, unit = '' } = {}) {
  const pts = points.filter(p => p.y != null);
  if (pts.length < 2) return h('div', { class: 'empty' }, pts.length ? 'Нужно хотя бы две точки для графика' : 'Пока нет данных');
  const W = 320, L = 34, R = 14, T = 16, B = 20;
  const [lo, hi] = scale(pts.map(p => p.y), target);
  const X = i => L + (i / (pts.length - 1)) * (W - L - R);
  const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let g = '';
  for (let k = 0; k <= 2; k++) {
    const v = lo + ((hi - lo) * k) / 2, y = Y(v);
    g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="axis" x="${L - 6}" y="${y + 3}" text-anchor="end">${num(v, dec)}</text>`;
  }
  if (target != null) g += `<line class="tgt" x1="${L}" x2="${W - R}" y1="${Y(target)}" y2="${Y(target)}"/>`;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  g += `<path class="area" d="${d}L${X(pts.length - 1)},${H - B}L${L},${H - B}Z"/><path class="line" d="${d}"/>`;
  if (pts.length <= 40) pts.forEach((p, i) => { g += `<circle class="pt" cx="${X(i)}" cy="${Y(p.y)}" r="2.5"/>`; });
  const li = pts.length - 1, lp = pts[li];
  g += `<circle class="end" cx="${X(li)}" cy="${Y(lp.y)}" r="4.5"/>`;
  g += `<text class="val" x="${X(li) - 6}" y="${Y(lp.y) - 9}" text-anchor="end">${num(lp.y, dec)}${esc(unit)}</text>`;
  g += `<text class="axis" x="${L}" y="${H - 4}">${esc(pts[0].x)}</text><text class="axis" x="${W - R}" y="${H - 4}" text-anchor="end">${esc(lp.x)}</text>`;
  return svg(W, H, g);
}

// items: [{x: подпись, y: число|null}]
export function barChart(items, { h: H = 150, target, labelEvery = 1 } = {}) {
  if (!items.some(i => i.y)) return h('div', { class: 'empty' }, 'Пока нет данных');
  const W = 320, L = 34, R = 6, T = 12, B = 20;
  const vals = items.map(i => i.y || 0);
  const hi = Math.max(...vals, target || 0) * 1.12 || 1;
  const Y = v => T + (1 - v / hi) * (H - T - B);
  const bw = (W - L - R) / items.length;
  let g = '';
  for (let k = 0; k <= 2; k++) {
    const v = (hi * k) / 2, y = Y(v);
    g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="axis" x="${L - 6}" y="${y + 3}" text-anchor="end">${num(v)}</text>`;
  }
  items.forEach((it, i) => {
    const v = it.y || 0, x = L + i * bw + bw * 0.15, w = bw * 0.7;
    const cls = !v ? 'zero' : target && v > target * 1.05 ? 'over' : '';
    const y = v ? Y(v) : H - B - 2;
    g += `<rect class="barr ${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(H - B - y).toFixed(1)}" rx="${Math.min(4, w / 2)}"/>`;
    if (i % labelEvery === 0) g += `<text class="axis" x="${(x + w / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(it.x)}</text>`;
  });
  if (target) g += `<line class="tgt" x1="${L}" x2="${W - R}" y1="${Y(target)}" y2="${Y(target)}"/>`;
  return svg(W, H, g);
}

export function ring(value, max, big, small) {
  const R = 52, C = 2 * Math.PI * R, p = max > 0 ? Math.min(1, value / max) : 0;
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="${R}" stroke-width="11"/><circle class="fg" cx="60" cy="60" r="${R}" stroke-width="11" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}"/></svg>`;
  return h('div', { class: 'ring-wrap' + (max > 0 && value > max * 1.05 ? ' over' : '') }, t.content.firstChild,
    h('div', { class: 'lbl' }, h('b', null, big), h('span', null, small)));
}

// cells: [{d, v: 0..1 | null, today}], начиная с понедельника
export function heatmap(cells) {
  return h('div', { class: 'heat', role: 'img', 'aria-label': 'Тепловая карта выполнения' }, cells.map(c => {
    const l = c.v == null ? (c.pad ? 'x' : '') : c.v <= 0 ? '' : c.v < 0.34 ? 'l1' : c.v < 0.67 ? 'l2' : c.v < 1 ? 'l3' : 'l4';
    return h('i', { class: l + (c.today ? ' today' : ''), title: c.d ? `${c.d}: ${c.v == null ? '—' : Math.round(c.v * 100) + '%'}` : null });
  }));
}
