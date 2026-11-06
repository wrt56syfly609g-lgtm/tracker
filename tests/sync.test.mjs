// Проверка слияния данных и правил синхронизации. Запуск: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

// IndexedDB в Node нет: сохранение на диск просто не произойдёт, состояние живёт в памяти.
console.error = () => {};
const { merge, same } = await import('../js/store.js');
const Y = await import('../js/sync.js');

const base = () => ({ v: 1, profile: { u: 1, weight: 75 }, settings: { u: 1, rest: 120 }, habits: {}, hlog: {}, food: {}, days: {}, ex: {}, tpl: {}, wo: {} });

test('слияние: по каждой записи побеждает более свежая правка', () => {
  const a = base(), b = base();
  a.food.x = { id: 'x', u: 10, kcal: 100 };
  b.food.x = { id: 'x', u: 20, kcal: 200 };
  a.food.y = { id: 'y', u: 30, kcal: 300 };
  b.food.z = { id: 'z', u: 5, kcal: 50 };
  const m = merge(a, b);
  assert.equal(m.food.x.kcal, 200);
  assert.equal(m.food.y.kcal, 300);
  assert.equal(m.food.z.kcal, 50);
  assert.equal(merge(b, a).food.x.kcal, 200, 'порядок аргументов не важен');
});

test('слияние: удаление новее правки — запись удалена, старее — восстановлена', () => {
  const a = base(), b = base();
  a.wo.w = { id: 'w', u: 10, name: 'Д1' };
  b.wo.w = { id: 'w', u: 20, name: 'Д1', deleted: true };
  assert.equal(merge(a, b).wo.w.deleted, true);
  a.wo.w = { id: 'w', u: 30, name: 'Д1', deleted: false };
  assert.equal(merge(a, b).wo.w.deleted, false);
});

test('слияние: профиль и настройки берутся целиком по времени правки', () => {
  const a = base(), b = base();
  a.profile = { u: 5, weight: 74 };
  b.profile = { u: 9, weight: 76 };
  b.settings = { u: 0, rest: 90 };
  const m = merge(a, b);
  assert.equal(m.profile.weight, 76);
  assert.equal(m.settings.rest, 120);
});

test('same: одинаковые копии и разница в одной записи', () => {
  const a = base(), b = base();
  a.hlog['2026-11-05|h'] = { id: '2026-11-05|h', u: 3, val: 1 };
  b.hlog['2026-11-05|h'] = { id: '2026-11-05|h', u: 3, val: 1 };
  assert.equal(same(a, b), true);
  b.hlog['2026-11-05|h'].u = 4;
  assert.equal(same(a, b), false);
  assert.equal(same(merge(a, b), b), true);
});

test('частота отправки: во время тренировки реже, после — почти сразу', () => {
  const s = base();
  assert.equal(Y.syncDelay(s), Y.DELAY.idle);
  s.wo.w = { id: 'w', u: 1, active: true };
  assert.equal(Y.hasActive(s), true);
  assert.equal(Y.syncDelay(s), Y.DELAY.workout);
  s.wo.w.deleted = true;
  assert.equal(Y.syncDelay(s), Y.DELAY.idle, 'отменённая тренировка не считается');
  assert.ok(Y.DELAY.workout >= 10 * 60000 && Y.DELAY.idle >= 30000 && Y.DELAY.finished <= 5000);
});

test('история: версии группируются по дням, новые сверху', () => {
  const at = (d, h, m) => new Date(2026, 10, d, h, m).toISOString();
  const items = [
    { sha: 'a', date: at(5, 23, 50) }, { sha: 'b', date: at(5, 9, 0) },
    { sha: 'c', date: at(4, 21, 0) }, { sha: 'd', date: at(4, 0, 5) }, { sha: 'e', date: at(2, 12, 0) },
  ];
  const g = Y.byDay(items);
  assert.deepEqual(g.map(x => x.day), ['2026-11-05', '2026-11-04', '2026-11-02']);
  assert.deepEqual(g.map(x => x.items.map(i => i.sha).join('')), ['ab', 'cd', 'e']);
  assert.equal(g[1].items[0].sha, 'c', 'первая версия дня — состояние на конец дня');
});

test('срок ключа: разбор заголовка и дни до истечения', () => {
  assert.equal(Y.parseExp('2026-12-01 00:00:00 UTC'), '2026-12-01');
  assert.equal(Y.parseExp(null), null);
  const now = new Date(2026, 10, 5, 23, 0);
  assert.equal(Y.daysLeft('2026-11-19', now), 14);
  assert.equal(Y.daysLeft('2026-11-05', now), 0);
  assert.equal(Y.daysLeft('2026-11-01', now), -4);
  assert.equal(Y.daysLeft(null, now), null);
});

test('новый ключ из файла берётся, только если он новее своего', () => {
  const f = { tk: { iv: 'i', ct: 'c' }, tkU: 200, tkExp: '2027-11-01' };
  assert.deepEqual(Y.newerToken({ tkU: 100 }, f), { tok: f.tk, tkU: 200, exp: '2027-11-01' });
  assert.deepEqual(Y.newerToken({}, f)?.tkU, 200, 'старая настройка без метки');
  assert.equal(Y.newerToken({ tkU: 200 }, f), null);
  assert.equal(Y.newerToken({ tkU: 300 }, f), null);
  assert.equal(Y.newerToken({ tkU: 0 }, { salt: 's' }), null, 'файл без ключа');
});
