// Проверка базы продуктов, поиска и подсчёта КБЖУ. Запуск: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

console.error = () => {};
const store = await import('../js/store.js');
const F = await import('../js/foods.js');
const { DATA } = await import('../js/foods-data.js');
const { totals, targets } = await import('../js/calc.js');

function fresh() {
  store.replace({ v: 1, ex: {}, tpl: {}, habits: {}, hlog: {}, food: {}, days: {}, wo: {}, prod: {} });
}
const first = q => F.search(q, 5)[0]?.name;

test('встроенная таблица: id уникальны, значения в пределах 100 г', () => {
  const ids = new Set();
  for (const b of F.BASE) {
    assert.ok(!ids.has(b.id), 'повтор: ' + b.name);
    ids.add(b.id);
    for (const k of F.NUTR) assert.ok(typeof b[k] === 'number' && b[k] >= 0, `${b.name}: ${k}`);
    assert.ok(b.p + b.f + b.c + b.fb <= 100.5, b.name);
  }
  assert.ok(F.BASE.length >= 400, 'продуктов меньше 400: ' + F.BASE.length);
  assert.equal(Object.keys(DATA).length + 1, F.CATS.length);
});

test('поиск находит продукты из примеров и понимает падежи и ё', () => {
  fresh();
  assert.equal(first('гречка сухая'), 'Гречка ядрица (сухая)');
  assert.equal(first('крылья запеченные с костями'), 'Куриные крылья запечённые (вес с костями)');
  assert.equal(first('роллтон'), 'Роллтон (лапша б/п, сухая)');
  assert.equal(first('качотта'), 'Качотта');
  assert.equal(first('сулугуни'), 'Сулугуни');
  assert.equal(first('творог 1'), 'Творог 1 %');
  assert.equal(first('творог 1%'), 'Творог 1 %');
  assert.match(first('гречки'), /^Гречка/);
  assert.match(first('крыльев'), /^Куриные крылья/);
  assert.equal(first('яйца'), 'Яйцо куриное');
  assert.ok(F.search('семга').some(x => x.name.startsWith('Лосось')));
  assert.deepEqual(F.search(''), []);
  assert.deepEqual(F.search('абырвалг'), []);
});

test('подсчёт порции по весу', () => {
  const g = F.BASE.find(x => x.name === 'Гречка ядрица (сухая)');
  assert.deepEqual(F.portion(g, 80), { kcal: 246, p: 10.1, f: 2.6, c: 45.7, fb: 9 });
  assert.deepEqual(F.portion(g, 0), { kcal: 0, p: 0, f: 0, c: 0, fb: 0 });
});

test('количество в строке', () => {
  assert.deepEqual(F.parseQty('гречка 80 г'), { q: 'гречка', g: 80, n: null });
  assert.deepEqual(F.parseQty('гречка 80г'), { q: 'гречка', g: 80, n: null });
  assert.deepEqual(F.parseQty('2 шт яйцо'), { q: 'яйцо', g: null, n: 2 });
  assert.deepEqual(F.parseQty('роллтон 1 пачка'), { q: 'роллтон', g: null, n: 1 });
  assert.deepEqual(F.parseQty('молоко 0,25 л'), { q: 'молоко', g: 250, n: null });
  assert.deepEqual(F.parseQty('масло 1 ст. л.'), { q: 'масло', g: null, n: 1 });
  assert.deepEqual(F.parseQty('творог 5 %'), { q: 'творог 5 %', g: null, n: null });
  assert.deepEqual(F.parseQty('молоко 2,5 %'), { q: 'молоко 2,5 %', g: null, n: null });
});

test('блюдо из ингредиентов: на 100 г готового веса', () => {
  const buck = F.BASE.find(x => x.name === 'Гречка ядрица (сухая)');
  const oil = F.BASE.find(x => x.name === 'Масло сливочное 82,5 %');
  const r = F.dish([{ per: buck, g: 100 }, { per: oil, g: 10 }], 300);
  assert.equal(r.tot.kcal, 383);
  assert.equal(r.weight, 300);
  assert.equal(r.raw, 110);
  assert.equal(r.per.kcal, 128);
  assert.equal(r.per.fb, 3.8);
  const noCook = F.dish([{ per: buck, g: 100 }, { per: null, g: 50 }, { per: oil, g: 0 }]);
  assert.equal(noCook.weight, 100);
  assert.equal(noCook.per.kcal, 308);
});

test('свой продукт: сохраняется один раз и находится поиском первым', () => {
  fresh();
  const rec = F.saveProduct(null, { name: 'Творог 1 % Савушкин', p: 16, f: 1, c: 1.3, fb: 0 });
  assert.equal(rec.kcal, 78);
  assert.equal(rec.cat, F.MY_CAT);
  assert.equal(first('творог 1'), 'Творог 1 % Савушкин');
  assert.equal(F.product(rec.id).user, true);
  F.removeProduct(rec.id)();
  assert.ok(F.product(rec.id));
  F.removeProduct(rec.id);
  assert.equal(F.product(rec.id), null);
});

test('правка встроенного продукта перекрывает таблицу и откатывается', () => {
  fresh();
  const id = F.BASE.find(x => x.name === 'Сулугуни').id;
  F.saveProduct(id, { name: 'Сулугуни', kcal: 300, p: 21, f: 24, c: 0, fb: 0, cat: 'Сыры' });
  assert.equal(F.product(id).kcal, 300);
  assert.equal(F.product(id).edited, true);
  assert.equal(F.products().filter(x => x.name === 'Сулугуни').length, 1);
  F.removeProduct(id);
  assert.equal(F.product(id).kcal, 289);
  assert.ok(!F.product(id).edited);
  F.saveProduct(id, { name: 'Сулугуни', kcal: 280, p: 20, f: 22, c: 0, fb: 0, cat: 'Сыры' });
  assert.equal(F.product(id).kcal, 280);
});

test('клетчатка в итогах дня и цели', () => {
  fresh();
  store.put('food', { date: '2026-11-05', name: 'Гречка', g: 80, kcal: 246, p: 10.1, f: 2.6, c: 45.7, fb: 9 });
  store.put('food', { date: '2026-11-05', name: 'Старая запись без клетчатки', kcal: 100, p: 1, f: 1, c: 1 });
  const t = totals('2026-11-05');
  assert.equal(t.fb, 9);
  assert.equal(t.kcal, 346);
  const tg = targets('2026-11-05');
  assert.ok(tg.fb >= 25);
  store.setObj('profile', { fbOverride: 35 });
  assert.equal(targets('2026-11-05').fb, 35);
});

test('коллекция продуктов участвует в слиянии устройств', () => {
  assert.ok(store.COLS.includes('prod'));
  const a = { v: 1, prod: { x: { id: 'x', name: 'A', u: 1 } } };
  const b = { v: 1, prod: { x: { id: 'x', name: 'B', u: 2 }, y: { id: 'y', name: 'C', u: 1 } } };
  const m = store.merge(a, b);
  assert.equal(m.prod.x.name, 'B');
  assert.ok(m.prod.y);
});
