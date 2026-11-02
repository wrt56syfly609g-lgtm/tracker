// Сервис-воркер: хранит файлы приложения на устройстве, чтобы оно работало без интернета.
// При выпуске новой версии меняй VERSION — устройства скачают обновление при следующем запуске.
const VERSION = 'podhod-1.1.0';
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

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true })
    .then(r => r || fetch(e.request).catch(() => caches.match('./'))));
});
