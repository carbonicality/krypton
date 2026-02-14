const CACHE_NAME='krypton-games';
self.addEventListener('install',(event)=>{
    console.log('gamesw installed');
    self.skipWaiting();
});

self.addEventListener('activate',(event)=>{
    console.log('gamesw activated');
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch',(event)=>{
    event.respondWith(fetch(event.request));
});