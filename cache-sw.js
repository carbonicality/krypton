const CACHE_NAME = 'krypton-v2';
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/games.html',
    '/history.html',
    '/bookmarks.html',
    '/settings.html',
    '/styles/styles.css',
    '/styles/settings.css',
    '/styles/history.css',
    '/styles/games.css',
    '/styles/bookmarks.css',
    '/scripts/settings.js',
    '/scripts/history.js',
    '/scripts/games.js',
    '/scripts/bookmarks.js',
    'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap',
    'https://unpkg.com/lucide@latest',
    'https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js'
];

self.addEventListener('install',(e)=>{
    console.log('SW installing');
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',(e)=>{
    console.log('SW activated');
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k=>caches.delete(k))
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch',(e)=>{
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) {
                return cached;
            }
            return fetch(e.request).then(response => {
                if (response.ok && e.request.method==='GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(e.request,clone);
                    });
                }
                return response;
            });
        })
        .catch(()=>{
            return caches.match(e.request);
        })
    );
});