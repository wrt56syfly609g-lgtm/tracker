// Проверка разбора импорта и экспорта. Запуск: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

// IndexedDB в Node нет: сохранение на диск просто не произойдёт, состояние живёт в памяти.
console.error = () => {};
const store = await import('../js/store.js');
const X = await import('../js/exchange.js');

function fresh() {
  store.replace({ v: 1, ex: {}, tpl: {}, habits: {}, hlog: {}, food: {}, days: {}, wo: {} });
  store.put('ex', { id: 'ex-pullup', name: 'Подтягивания', muscle: 'Спина', rest: 150, step: null });
  store.put('ex', { id: 'ex-bench', name: 'Жим штанги лёжа', muscle: 'Грудь', rest: 180, step: null });
}

test('строка с параметрами в любом порядке', () => {
  const r = X.parseLine('Тяга гири в наклоне | 3×8–12/р | Спина | отдых 1:30 | шаг 8');
  assert.deepEqual(r, { name: 'Тяга гири в наклоне', muscle: 'Спина', rest: 90, step: 8, sets: 3, goal: '8–12/р' });
});

test('разные записи подходов и отдыха', () => {
  assert.deepEqual(X.parseSets('3 x 8-12'), { sets: 3, goal: '8–12' });
  assert.deepEqual(X.parseSets('4х6'), { sets: 4, goal: '6' });
  assert.deepEqual(X.parseSets('3 подхода по 10'), { sets: 3, goal: '10' });
  assert.deepEqual(X.parseSets('3 круга × 6–12 на палец'), { sets: 3, goal: '6–12 на палец' });
  assert.equal(X.parseSets('2 хватом'), null);
  assert.equal(X.parseRest('отдых 2:30'), 150);
  assert.equal(X.parseRest('отдых 90'), 90);
  assert.equal(X.parseRest('отдых 2'), 120);
  assert.equal(X.parseRest('2–3 мин'), 150);
  assert.equal(X.parseRest('45 с'), 45);
  assert.equal(X.parseRest('90'), null);
  assert.equal(X.parseStep('шаг 2,5 кг'), 2.5);
});

test('параметры через тире и пробел в названии', () => {
  assert.deepEqual(X.parseLine('- Подтягивания — 3×5–6, отдых 2:30'), { name: 'Подтягивания', muscle: null, rest: 150, step: null, sets: 3, goal: '5–6' });
  assert.equal(X.parseLine('Упор над перекладиной — негативный выход | Спина').name, 'Упор над перекладиной — негативный выход');
  assert.equal(X.parseLine('Подтягивания 4×8').sets, 4);
});

test('программа и пачка упражнений', () => {
  const p = X.parseImport(`// комментарий
Шаблон: Д1 Верх
Подтягивания | Спина | 3×5–6
Отжимания от пола | Грудь | 3×8–12 | отдых 1:30

Шаблон: Д2 Ноги
Кубковый присед | Ноги | 3×8–12
Подтягивания | 2 подх.

Упражнения:
Вис на перекладине | Предплечья
Планка
Главное в этот день: тяжёлые подтягивания.`);
  assert.equal(p.templates.length, 2);
  assert.deepEqual(p.templates[1].items, [{ ex: 'Кубковый присед', sets: 3, goal: '8–12' }, { ex: 'Подтягивания', sets: 2, goal: null }]);
  assert.deepEqual(p.exercises.map(e => e.name).sort(), ['Вис на перекладине', 'Кубковый присед', 'Отжимания от пола', 'Планка', 'Подтягивания']);
  assert.equal(p.exercises.find(e => e.name === 'Планка').muscle, 'Кор');
  assert.ok(p.exercises.find(e => e.name === 'Планка').guessed);
  assert.deepEqual(p.skipped, ['Главное в этот день: тяжёлые подтягивания.']);
});

test('таблица Markdown и строки с табуляцией', () => {
  const p = X.parseImport(`## День 1
| № | Упражнение | Снаряд | Подходы × повторы | Отдых |
|---|---|---|---|---|
| A1 | Подтягивания прямым хватом | свой вес | 3 × 5–6 | 2–3 мин |
B1\tТяга гири в наклоне\t24\t3 × 8–12/р\t90 с`);
  assert.equal(p.templates[0].name, 'День 1');
  assert.deepEqual(p.templates[0].items.map(i => [i.ex, i.sets, i.goal]), [
    ['Подтягивания прямым хватом', 3, '5–6 · свой вес'],
    ['Тяга гири в наклоне', 3, '8–12/р · 24'],
  ]);
  assert.equal(p.exercises[0].rest, 150);
  assert.equal(p.exercises[1].rest, 90);
});

test('импорт не задваивает упражнения и заменяет шаблон с тем же названием, «Вернуть» откатывает', () => {
  fresh();
  const tplOld = store.put('tpl', { name: 'Д1 Верх', items: [{ ex: 'ex-bench', sets: 5 }] });
  const plan = X.planImport(X.parseImport('Шаблон: д1 верх\nподтягивания | 4×6 | отдых 2:00\nНовое упражнение | Руки'));
  assert.equal(plan.newEx.length, 1);
  assert.equal(plan.changedEx.length, 1); // отдых у «Подтягиваний» 150 → 120
  assert.equal(plan.updTpl.length, 1);
  const undo = X.applyImport(plan, { overwrite: true });
  assert.equal(store.all('ex').length, 3);
  assert.equal(store.get('ex', 'ex-pullup').rest, 120);
  assert.deepEqual(store.get('tpl', tplOld.id).items.map(i => [i.ex, i.sets, i.goal]).slice(0, 1), [['ex-pullup', 4, '6']]);
  assert.equal(store.all('tpl').length, 1);
  undo();
  assert.equal(store.all('ex').length, 2);
  assert.equal(store.get('ex', 'ex-pullup').rest, 150);
  assert.deepEqual(store.get('tpl', tplOld.id).items, [{ ex: 'ex-bench', sets: 5 }]);
});

test('без замены настроек существующие упражнения не меняются', () => {
  fresh();
  X.applyImport(X.planImport(X.parseImport('Подтягивания | отдых 1:00 | Руки')), { overwrite: false });
  assert.equal(store.get('ex', 'ex-pullup').rest, 150);
  assert.equal(store.get('ex', 'ex-pullup').muscle, 'Спина');
});

test('экспорт текстом и JSON читается импортом обратно', async () => {
  fresh();
  const e = store.put('ex', { name: 'Тяга | гири', muscle: 'Спина', rest: 90, step: 8 });
  const t = store.put('tpl', { name: 'Д1', items: [{ ex: 'ex-pullup', sets: 3, goal: '5–6' }, { ex: e.id, sets: 4 }] });
  const sel = { tplIds: [t.id], exIds: ['ex-bench'] };
  const text = X.toText(sel);
  assert.match(text, /Шаблон: Д1\nПодтягивания \| Спина \| 3×5–6 \| отдых 2:30\nТяга, гири \| Спина \| 4 подх\. \| отдых 1:30 \| шаг 8\n\nУпражнения:\nЖим штанги лёжа \| Грудь \| отдых 3:00\n/);
  // В тексте «|» в названии заменяется запятой, в JSON название остаётся как есть.
  for (const [src, nm] of [[text, 'Тяга, гири'], [X.toJSON(sel), 'Тяга | гири']]) {
    const p = X.parseImport(src);
    assert.equal(p.exercises.length, 3);
    assert.deepEqual(p.templates, [{ name: 'Д1', items: [{ ex: 'Подтягивания', sets: 3, goal: '5–6' }, { ex: nm, sets: 4, goal: null }] }]);
    assert.equal(p.exercises.find(x => x.name === nm).step, 8);
  }
  const link = await X.toLink(text, 'https://example.org/tracker/');
  assert.ok(link.startsWith('https://example.org/tracker/#import='));
  assert.equal(await X.fromLink(link.split('#import=')[1]), text);
});

test('полная резервная копия тоже подходит', () => {
  const p = X.parseImport(JSON.stringify({ profile: {}, ex: { a: { id: 'a', name: 'Присед', muscle: 'Ноги', rest: 180 }, b: { id: 'b', name: 'Старое', deleted: true } }, tpl: { t: { id: 't', name: 'Низ', items: [{ ex: 'a', sets: 4 }, { ex: 'b', sets: 3 }] } } }));
  assert.deepEqual(p.exercises, [{ name: 'Присед', muscle: 'Ноги', rest: 180, step: null }]);
  assert.deepEqual(p.templates, [{ name: 'Низ', items: [{ ex: 'Присед', sets: 4, goal: null }] }]);
});

test('ошибочный JSON даёт понятную ошибку', () => {
  assert.match(X.parseImport('{"exercises": [').error, /ошибка/);
});

