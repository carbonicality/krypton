importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
let configLoaded=false;

self.addEventListener('install',(event)=>{
    self.skipWaiting();
});

self.addEventListener('activate', (event)=>{
    event.waitUntil(clients.claim());
});

async function handleRequest(event) {
    if (!configLoaded) {
        try{
            await scramjet.loadConfig();
            configLoaded=true;
        } catch (err) { 
            console.warn('cfg load failed, continuing anyway haha',err);
            configLoaded=true;
        }
    }
    if (scramjet.route(event)) {
        return scramjet.fetch(event);
    }
    return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});