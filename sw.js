// Сервис-воркер: хранит файлы приложения на устройстве, чтобы оно работало без интернета.
// При выпуске новой версии меняй VERSION — устройства скачают обновление при следующем запуске.
const VERSION = 'podhod-1.2.2';
const FILES = [
  './',
  'css/app.css',
  'css/fonts.css',
  'fonts/onest-cyrillic.woff2',
  'fonts/onest-latin.woff2',
  'fonts/unbounded-cyrillic.woff2',
  'fonts/unbounded-latin.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'index.html',
  'js/app.js',
  'js/calc.js',
  'js/charts.js',
  'js/exchange.js',
  'js/foods-data.js',
  'js/foods.js',
  'js/icons.js',
  'js/store.js',
  'js/sync.js',
  'js/timer.js',
  'js/ui.js',
  'js/views/exchange.js',
  'js/views/food.js',
  'js/views/habits.js',
  'js/views/settings.js',
  'js/views/stats.js',
  'js/views/today.js',
  'js/views/workout.js',
  'manifest.webmanifest',
  'vendor/jsQR.js',
  'vendor/qrcode.js',
];

// Каждый файл берётся заново с сервера: метка ?v= обходит кэш GitHub Pages, иначе сразу после выпуска
// часть файлов могла прийти старой, а часть новой, и приложение не запускалось (пустой экран).
// Если хоть один файл не скачался, новая версия не ставится и остаётся прежняя.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(async f => {
    const r = await fetch(new Request(f + '?v=' + VERSION, { cache: 'reload' }));
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    await c.put(f, r);
  }))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
    .then(reviveStuck));
});

// Окна, где приложение не запустилось (например, пустой экран после неудачного обновления),
// перезагружаем сами, уже с новыми файлами. Запущенное приложение отвечает на ping и не трогается:
// ему покажется «Приложение обновлено». Данные при перезагрузке не теряются.
async function reviveStuck() {
  const list = await self.clients.matchAll({ type: 'window' });
  await Promise.all(list.map(c => new Promise(done => {
    const ch = new MessageChannel();
    let alive = false;
    ch.port1.onmessage = () => { alive = true; };
    try { c.postMessage({ type: 'podhod-ping' }, [ch.port2]); } catch { /* окно уже закрыто */ }
    setTimeout(() => {
      // navigate не ждём: перезагрузка сама ждёт окончания активации, иначе была бы взаимная блокировка.
      if (!alive) Promise.resolve().then(() => c.navigate(c.url)).catch(() => {});
      done();
    }, 1500);
  })));
}
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true })
    .then(r => r || fetch(e.request).catch(() => caches.match('./'))));
});
