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
    'https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js',
    'https://cdn.jsdelivr.net/gh/gn-math/assets@main/zones.json'
]

self.addEventListener('install',(e)=>{
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate',(e)=>{
    e.waitUntil(
        caches.keys().then(keys=>{
            Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))
        })
    );
});

self.addEventListener('fetch',(e)=>{
    e.respondWith(
        caches.match(e.request).then(cached=>cached||fetch(e.request))
    );
});