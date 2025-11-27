importScripts("https://cdn.jsdelivr.net/gh/soap-phia/tinyjet@latest/tinyjet/scramjet.all.js");
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker()
async function handleRequest(event) {
  await scramjet.loadConfig()
  if (scramjet.route(event)) {return await scramjet.fetch(event)}
  return await fetch(event.request)
}
self.addEventListener('fetch', (event) => {event.respondWith(handleRequest(event))})