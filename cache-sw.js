const CACHE_NAME = 'krypton-v1';
const ASSETS = [
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
    '/script.js',
    '/game-sw.js',
    '/register-sw.mjs',
    '/scripts/settings.js',
    '/scripts/history.js',
    '/scripts/games.js',
    '/scripts/bookmarks.js',
    '/libcurl/index.mjs',
    '/epoxy/index.js',
    '/epoxy/index.mjs',
    '/baremux/index.js',
    '/baremux/index.mjs',
    '/baremux/worker.js',
    'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap',
    'https://unpkg.com/lucide@latest',
    'https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js'
]

self.addEventListener('install',(e)=>{
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate',(e)=>{
    console.log('sw activating');
    e.waitUntil(
        caches.keys().then(keys=>{
           return Promise.all(
            keys.filter(k => k !== CACHE_NAME && k !== 'krypton-games-v1')
            .map(k => caches.delete(k))
           );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch',(e) => {
    if (e.request.url.startsWith('chrome-extension://')||e.request.url.startsWith('google-analytics.com')) {
        return;
    }
    e.respondWith(
        caches.match(e.request)
        .then(cached => {
            if (cached) {
                console.log('serving from cache',e.request.url);
                return cached;
            }
            return fetch(e.request)
            .then(response => {
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }
                if (e.request.url.includes('cdn.jsdelivr.net')||e.request.url.includes('unpkg.com')||e.request.url.includes('krypton-tau.vercel.app')) {
                    const resClone = response.clone();
                    caches.open('krypton-games-v1').then(cache => {
                        cache.put(e.request,resClone);
                        console.log('cached',e.request.url);
                    });
                }
                return response;
            })
            .catch(err => {
                console.log('fetch failed, returning',e.request.url);
                return caches.match(e.request);
            });
        })
    );
});