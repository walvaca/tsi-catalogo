/* Service Worker de TSI Catálogo — permite abrir la app sin conexión a internet.
   Estrategia: si hay internet, siempre trae la versión más nueva (y la guarda en caché
   de paso); si no hay internet, sirve la última copia guardada. El catálogo en sí vive
   en IndexedDB (js/db.js), no aquí — este cache solo cubre el código de la app. */
const CACHE_NAME = 'tsi-catalogo-v4';
const ASSETS = [
  './', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './logo-tsi.png',
  './vendor/xlsx.full.min.js', './vendor/jszip.min.js',
  './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js',
  './js/db.js', './js/xlsx-images.js', './js/parser-gvs.js', './js/parser-generic.js',
  './js/search.js', './js/ui.js', './js/import-wizard.js',
  './js/cotizador.js', './js/pdf-cotizacion.js', './js/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache =>
    Promise.all(ASSETS.map(a => cache.add(a).catch(err => console.error('No se pudo cachear', a, err))))
  ));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) caches.open(CACHE_NAME).then(cache => cache.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
