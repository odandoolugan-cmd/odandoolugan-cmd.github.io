const CACHE_NAME = 'academia-pro-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './pkg/academia_wasm.js',
    './pkg/academia_wasm_bg.wasm'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('SW:', err)))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(names => Promise.all(
            names.map(n => n !== CACHE_NAME ? caches.delete(n) : null)
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    
    event.respondWith(
        caches.match(event.request)
            .then(cached => cached || fetch(event.request).then(resp => {
                if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
                const clone = resp.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return resp;
            }))
            .catch(() => event.request.destination === 'document' ? caches.match('./index.html') : null)
    );
});
