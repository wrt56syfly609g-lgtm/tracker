// Тренировки дома: типы упражнений, стороны Л/П, рекорды, суперсеты в формате обмена, отчёт для Claude.
// Запуск: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

console.error = () => {};
const store = await import('../js/store.js');
const C = await import('../js/calc.js');
const X = await import('../js/exchange.js');
const { report } = await import('../js/report.js');

const set = (w, r, extra = {}) => ({ w, r, rir: null, warm: false, done: true, ...extra });
let t0 = Date.UTC(2026, 9, 1);
function wo(date, items) {
  t0 += 864e5;
  return store.put('wo', { date, start: t0, end: t0 + 3600e3, active: false, name: 'Тест', items, srpe: 7, kcal: null, note: '' });
}
function fresh() {
  store.replace({ v: 1, profile: { weight: 75, bodyFat: 20, weightDate: '2026-10-01' } });
  store.put('ex', { id: 'pull', name: 'Подтягивания', muscle: 'Спина', kind: 'bw' });
  store.put('ex', { id: 'wpull', name: 'Подтягивания с весом', muscle: 'Спина', kind: 'bwx' });
  store.put('ex', { id: 'row', name: 'Тяга гири одной рукой', muscle: 'Спина', uni: true });
  store.put('ex', { id: 'lever', name: 'Передний вис', muscle: 'Спина', kind: 'time' });
  store.put('ex', { id: 'sup', name: 'Супинация с резиной', muscle: 'Предплечья', kind: 'band', uni: true });
  store.put('ex', { id: 'sq', name: 'Кубковый присед', muscle: 'Ноги' });
}

test('подходы без веса идут в статистику, если упражнение не «с весом»', () => {
  fresh();
  assert.equal(C.workSets({ ex: 'pull', sets: [set(null, 8), set(null, 6), set(null, null)] }).length, 2);
  assert.equal(C.workSets({ ex: 'sq', sets: [set(null, 8), set(16, 10)] }).length, 1);
  assert.equal(C.workSets({ ex: 'row', sets: [set(16, 10, { r2: 11 }), set(16, null, { r2: 9 }), set(16, 8, { one: 'L' })] }).length, 3);
  assert.equal(C.workSets({ ex: 'lever', sets: [set(null, 12)] }).length, 1);
});

test('тоннаж: только внешний вес, обе стороны', () => {
  fresh();
  assert.equal(C.tonnage({ ex: 'row', sets: [set(16, 10, { r2: 11 }), set(16, 9, { one: 'L', r2: 50 })] }), 16 * 21 + 16 * 9);
  assert.equal(C.tonnage({ ex: 'pull', sets: [set(null, 8)] }), 0);
  assert.equal(C.tonnage({ ex: 'wpull', sets: [set(8, 5), set(null, 6)] }), 40);
});

test('прогресс по типу: повторы, секунды, максимум с весом тела, левая к правой', () => {
  fresh();
  wo('2026-10-02', [
    { ex: 'pull', sets: [set(null, 6), set(null, 7)] },
    { ex: 'lever', sets: [set(null, 10), set(null, 14)] },
    { ex: 'wpull', sets: [set(null, 5)] },
    { ex: 'row', sets: [set(16, 8, { r2: 10 }), set(16, 8, { r2: 10 }), set(16, 7, { one: 'L' })] },
  ]);
  assert.equal(C.lastSession('pull').best, 7);
  assert.equal(C.lastSession('lever').best, 14);
  // Свой вес + груз: (75 + 0) × (1 + 5/30) = 87,5
  assert.equal(Math.round(C.lastSession('wpull').best * 10) / 10, 87.5);
  const r = C.lastSession('row');
  assert.equal(r.lr, 16 / 20); // подход только левой в сравнение не входит
  assert.ok(r.bestR > r.bestL);
  assert.equal(r.reps, 8 + 10 + 8 + 10 + 7);
});

test('рекорды отдельно по сторонам и без ложных рекордов у новой стороны', () => {
  fresh();
  // Старая запись: тогда писали только левую.
  wo('2026-10-02', [{ ex: 'row', sets: [set(16, 8)] }]);
  const cur = wo('2026-10-05', [{ ex: 'row', sets: [set(16, 8, { r2: 12 }), set(16, 9, { r2: 9 })] }]);
  const b = C.bestBefore('row', cur.id);
  assert.equal(C.isRecord('row', cur.items[0].sets[0], b, cur.date), false); // правой раньше не было
  assert.equal(C.isRecord('row', cur.items[0].sets[1], b, cur.date), true); // левая 9 > 8
  const p2 = wo('2026-10-07', [{ ex: 'pull', sets: [set(null, 5)] }]);
  const p3 = wo('2026-10-09', [{ ex: 'pull', sets: [set(null, 6), set(null, 5)] }]);
  const bp = C.bestBefore('pull', p3.id);
  assert.equal(bp.n, 1);
  assert.deepEqual(p3.items[0].sets.map(s => C.isRecord('pull', s, bp, p3.date)), [true, false]);
  assert.ok(p2);
});

test('подходы текстом по типу', () => {
  fresh();
  assert.equal(C.setsText([set(16, 10, { r2: 11 }), set(16, 9, { one: 'L' })], 'row'), '16×10/11 · 16×9 Л');
  assert.equal(C.setsText([set(null, 8), set(null, 7)], 'pull'), '8 · 7');
  assert.equal(C.setsText([set(8, 5), set(null, 6)], 'wpull'), '+8×5 · 6');
  assert.equal(C.setsText([set(null, 20)], 'lever'), '20 с');
  assert.equal(C.setsText([set(15, 12, { r2: 10 })], 'sup'), '12/10 (рез. 15)');
});

const PROGRAM = `Шаблон: Д1
Подтягивания | Спина | 3×5–8 | отдых 2:00
Тяга гири в наклоне одной рукой | Спина | 3×8–12/р; сразу следующее | отдых 0:15 | шаг 8
Молот с гирей на полотенце | Руки | 4×6–10/р, левой 4 подхода, правой 3 | отдых 2:00
Пронация рычагом (гиря за рог) | Предплечья | 3×8–12/р; круг | отдых 0:15
Супинация с резиной | Предплечья | 3×8–12/р; круг
Подворот кисти (каппинг) | Предплечья | 3×8–15/р; конец круга | отдых 2:00
Передний вис: текущий этап | Спина | 3×8–15 с (на старте в группировке)
Паллоф-пресс | Кор | 3×10–15 на сторону
Выкручивание полотенца | Предплечья | 3×6–10 в каждую сторону
Прыжок из приседа | Ноги | свой вес + груз | 3×5 | сразу следующее`;

test('импорт понимает тип, стороны, лишний подход левой и круги', () => {
  const p = X.parseImport(PROGRAM);
  const ex = Object.fromEntries(p.exercises.map(e => [e.name, e]));
  const items = Object.fromEntries(p.templates[0].items.map(i => [i.ex, i]));
  assert.equal(ex['Подтягивания'].kind, 'bw');
  assert.ok(ex['Подтягивания'].kindGuessed);
  assert.equal(ex['Тяга гири в наклоне одной рукой'].kind, undefined); // с весом — по умолчанию
  assert.equal(ex['Передний вис: текущий этап'].kind, 'time'); // цель в секундах
  assert.equal(ex['Супинация с резиной'].kind, 'band');
  assert.equal(ex['Прыжок из приседа'].kind, 'bwx');
  assert.ok(!ex['Прыжок из приседа'].kindGuessed);
  assert.ok(ex['Тяга гири в наклоне одной рукой'].uni);
  assert.ok(ex['Паллоф-пресс'].uni);
  assert.ok(!ex['Выкручивание полотенца'].uni);
  assert.equal(ex['Тяга гири в наклоне одной рукой'].rest, null); // «отдых 0:15» у суперсета отброшен
  assert.deepEqual(items['Молот с гирей на полотенце'], { ex: 'Молот с гирей на полотенце', sets: 3, goal: '6–10', extra: 1 });
  assert.deepEqual(items['Тяга гири в наклоне одной рукой'], { ex: 'Тяга гири в наклоне одной рукой', sets: 3, goal: '8–12', link: true });
  assert.equal(items['Паллоф-пресс'].goal, '10–15');
  assert.ok(items['Пронация рычагом (гиря за рог)'].link && items['Супинация с резиной'].link);
  assert.ok(!items['Подворот кисти (каппинг)'].link);
  assert.ok(!items['Прыжок из приседа'].link); // последнее в шаблоне не связывается
  assert.equal(items['Выкручивание полотенца'].goal, '6–10 в каждую сторону');
});

test('экспорт с типами, сторонами и кругами читается обратно', () => {
  fresh();
  const t = store.put('tpl', { name: 'Д1', items: [
    { ex: 'pull', sets: 3, goal: '5–8', link: true },
    { ex: 'row', sets: 3, goal: '8–12', extra: 1 },
    { ex: 'lever', sets: 3, goal: '10–15 с', link: true },
    { ex: 'sup', sets: 3, goal: '8–12' },
    { ex: 'sq', sets: 3, goal: '20 с' },
  ] });
  const text = X.toText({ tplIds: [t.id] });
  assert.match(text, /Подтягивания \| Спина \| свой вес \| 3×5–8 \| сразу следующее\n/);
  assert.match(text, /Тяга гири одной рукой \| Спина \| на каждую сторону \| 3×8–12 \| \+1 подход левой\n/);
  assert.match(text, /Кубковый присед \| Ноги \| с весом \| 3×20 с\n/); // иначе импорт угадал бы «на время»
  for (const src of [text, X.toJSON({ tplIds: [t.id] })]) {
    const p = X.parseImport(src);
    const ex = Object.fromEntries(p.exercises.map(e => [e.name, e]));
    assert.deepEqual(p.templates[0].items.map(i => [i.ex, i.sets, i.goal, i.extra || 0, !!i.link]), [
      ['Подтягивания', 3, '5–8', 0, true], ['Тяга гири одной рукой', 3, '8–12', 1, false],
      ['Передний вис', 3, '10–15 с', 0, true], ['Супинация с резиной', 3, '8–12', 0, false], ['Кубковый присед', 3, '20 с', 0, false]]);
    assert.deepEqual(['Подтягивания', 'Тяга гири одной рукой', 'Передний вис', 'Супинация с резиной', 'Кубковый присед'].map(n => [ex[n].kind || 'w', !!ex[n].uni]),
      [['bw', false], ['w', true], ['time', false], ['band', true], ['w', false]]);
  }
});

test('повторный импорт проставляет тип и стороны, угаданный тип не перетирает выбранный', () => {
  fresh();
  store.put('ex', { id: 'dips', name: 'Отжимания на брусьях', muscle: 'Грудь' });
  store.put('ex', { id: 'jump', name: 'Пого-прыжки', muscle: 'Ноги', kind: 'w' });
  const plan = X.planImport(X.parseImport('Шаблон: Д\nОтжимания на брусьях | 3×6–12\nПого-прыжки | 3×15\nКубковый присед | 3×8–12/р'));
  assert.deepEqual(plan.changedEx.map(e => [e.name, e.diff]), [['Отжимания на брусьях', ['kind']], ['Кубковый присед', ['uni']]]);
  const undo = X.applyImport(plan);
  assert.equal(store.get('ex', 'dips').kind, 'bw');
  assert.equal(store.get('ex', 'sq').uni, true);
  assert.equal(store.get('ex', 'jump').kind, 'w');
  undo();
  assert.equal(C.kindOf('dips'), 'w');
  assert.equal(C.isUni('sq'), false);
});

test('отчёт для Claude: подходы по типам, стороны, прогресс и программа', () => {
  fresh();
  const d = C.today(), d0 = C.addDays(d, -3);
  wo(d0, [{ ex: 'row', goal: '3×8–12 +1 Л', sets: [set(16, 8, { r2: 10, rir: 2 }), set(16, 7, { one: 'L' })] }, { ex: 'pull', sets: [set(null, 6)] }]);
  wo(d, [{ ex: 'row', sets: [set(16, 9, { r2: 10 })], tech: 4, note: 'левая лучше' }, { ex: 'lever', sets: [set(null, 15)], link: true }, { ex: 'pull', sets: [set(null, 7), { ...set(null, 7), done: false }] }]);
  store.put('tpl', { name: 'Д1', items: [{ ex: 'row', sets: 3, goal: '8–12', extra: 1 }] });
  const r = report({ weeks: 4 });
  assert.match(r, /- Тяга гири одной рукой \(Л\/П; цель 3×8–12 \+1 Л\): 16×8\/10, 16×7 Л · запас 2, —/);
  assert.match(r, /- Передний вис \(на время\): 15 с · сразу следующее/);
  assert.match(r, /- Подтягивания \(свой вес\): 7 · не отмечено подходов: 1/);
  assert.match(r, /техника 4\/5 · «левая лучше»/);
  assert.match(r, /Подтягивания: лучший подход 6 → 7 повт\. \(тренировок: 2\)/);
  assert.match(r, /левая 80 → 90 % от правой/);
  assert.match(r, /Тренировки: 2 \(0,5 в неделю\)/);
  assert.match(r, /Текущая программа \(формат импорта «Подхода»\):\nШаблон: Д1\nТяга гири одной рукой \| Спина \| на каждую сторону \| 3×8–12 \| \+1 подход левой\n$/);
});
