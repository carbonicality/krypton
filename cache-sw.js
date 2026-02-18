const CACHE_NAME = 'krypton-v2';

self.addEventListener('install',(e)=>{
    console.log('SW installed');
    self.skipWaiting();
});

self.addEventListener('activate',(e)=>{
    console.log('SW activated');
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch',(e)=>{
    e.respondWith(
        fetch(e.request).then(response => {
            if (response.ok && e.request.method==='GET') {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(e.request,clone);
                });
            }
            return response;
        }).catch(()=>{
            return caches.match(e.request);
        })
    );
});