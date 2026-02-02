const CACHE_NAME='krypton-games';
const GHOST='https://krypton-games.surge.sh';
const B2_BUCKET='krypton-games';
const B2_KEY_ID='0033f2bce0a5fa90000000001';
const B2_APP_KEY='K003a7J1GbTOPQkyNkc8/Uh+M9aVcwU';
importScripts('../uv/uv.config.js');

self.addEventListener('install',(event)=>{
    console.log('gamesw installed');
    self.skipWaiting();
});

self.addEventListener('activate',(event)=>{
    console.log('gamesw activated');
    event.waitUntil(clients.claim());
});

async function authB2() {
    const authUrl = 'https://api.backblazeb2.com/b2api/v2/b2_authorize_account';
    const creds = btoa(B2_KEY_ID+':'+B2_APP_KEY);
    const proxyUrl = __uv$config.prefix+__uv$config.encodeUrl(authUrl);
    const res = await fetch(proxyUrl,{
        headers:{
            'Authorization': 'Basic '+creds
        }
    });
    return await res.json();
}

async function fetchGameB2(gameName) {
    try {
        const authData = await authB2();
        const dl= `${authData.downloadUrl}/file/${B2_BUCKET}/${gameName}.html`;
        const proxyUrl = __uv$config.prefix+__uv$config.encodeUrl(dlUrl);
        const res = await fetch(proxyUrl,{
            headers:{
                'Authorization': authData.authorizationToken
            }
        });
        return await res.text();
    } catch (error) {
        console.error('failed to fetch b2',error);
        throw error;
    }
}

self.addEventListener('message',async (event) => {
    if (event.data.type==='GCACHE') {
        const gamesList = event.data.games;
        const uvConfig=event.data.uvPrefix;
        const cache = await caches.open(CACHE_NAME);
        importScripts('/uv/uv.config.js');
        for (const game of gamesList) {
            try {
                const proxyUrl = __uv$config.prefix+__uv$config.encodeUrl(game.url);
                const res = await fetch(proxyUrl);
                const html = await res.text();
                const modHtml = html.replace(
                    '</head>',
                    `<link href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap" rel="stylesheet">
                    <style>
    .back-btn {
    position: fixed;
    top: 24px;
    left: 24px;
    z-index:10000000000000000000000000000000000000000000000000000000000000000000000; /*even BIGGGER number*/
    cursor:pointer;
}

.back-btn-in {
    display:flex;
    align-items:center;
    justify-content:center;
    background:rgba(26,26,26,0.95);
    border: 1.5px solid rgba(60,60,60,0.6);
    border-radius:18px;
    width:36px;
    height:36px;
    padding:0;
    backdrop-filter:blur(12px);
    transition: width 0.3s cubic-bezier(0.34,1.56,0.64,1),padding 0.3s cubic-bezier(0.34,1.56,0.64,1),background 0.2s ease,border-color 0.2s ease;
    overflow:hidden;
}

.back-btn-in svg {
    width: 18px;
    height:18px;
    color:rgba(255,255,255,0.7);
    stroke:currentColor;
    stroke-width:2;
    stroke-linecap:round;
    stroke-linejoin:round;
    fill:none;
    flex-shrink:0;
}

.back-txt {
    color: rgba(255,255,255,0.9);
    font-size: 13px;
    font-weight: 500;
    font-family:'Geist',sans-serif;
    white-space:nowrap;
    opacity:0;
    width:0;
    margin-left:0;
    transition: opacity 0.25s ease 0.05s, width 0.3s cubic-bezier(0.34,1.56,0.64,1),margin-left 0.3s cubic-bezier(0.34,1.56,0.64,1);
}

.back-btn:hover .back-btn-in {
    width: auto;
    border-radius: 18px;
    padding: 0 14px 0 9px;
    background: rgba(26,26,26,0.95);
    border-color:rgba(80,80,80,0.8);
}

.back-btn:hover .back-txt {
    opacity: 1;
    width: auto;
    margin-left: 8px;
}
                </style>
                </head>`
                ).replace(
                    '</body>',
                    `<script src="https://unpkg.com/lucide@latest"></script>
<script src="../scripts/games.js"></script></body>`
                );
                await cache.put(`/games/${game.name}.html`,new Response(modHtml,{
                    headers:{'Content-Type':'text/html'}
                }));
                if (game.icon) {
                    const iconRes = await fetch(game.icon);
                    await cache.put(game.icon,iconRes);
                }
                console.log(`cached ${game.name}`);
            } catch (error) {
                console.error(`failed to cache ${game.name}`,error);
            }
        }
        event.ports[0].postMessage({success: true});
    }
});

self.addEventListener('fetch',(event)=>{
    const url = new URL(event.request.url);
    console.log('sw inter',url.pathname);
    if (url.pathname.startsWith('/b2-game/')) {
        console.log('matched /b2-game/');
        event.respondWith(
            (async ()=>{
                const gameName = url.pathname.replace('/b2-game/','').replace('.html','');
                const cached = await caches.match(`/games/${gameName}.html`);
                if (cached) {
                    console.log('serving from cache',gameName);
                    return cached;
                }
                console.log('fetching from b2',gameName);
                const html = await fetchGameB2(gameName);
                const cache = await caches.open(CACHE_NAME);
                const res=new Response(html,{
                    headers:{'Content-Type':'text/html'}
                });
                await cache.put(`/games/${gameName}.html`,res.clone());
                return res;
            })()
        );
        return;
    }
    if (url.pathname.startsWith('/games/') && url.pathname.endsWith('.html')) {
        event.respondWith(
            caches.match(event.request).then(cResponse => {
                if (cResponse) {
                    console.log('serving from cache:',url.pathname);
                    return cResponse;
                }
                return fetch(event.request);
            })
        );
    } else {
        event.respondWith(
            caches.match(event.request).then(cResponse =>{
                return cResponse || fetch(event.request);
            })
        );
    }
});