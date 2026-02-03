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

self.addEventListener('fetch',(event)=>{
    const url = new URL(event.request.url);
    if (url.hostname==='cdn.jsdelivr.net' && url.pathname.includes('/gn-math/html@main')) {
        event.respondWith(
            (async ()=>{
                const res = await fetch(event.request);
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
                    <script>
                    const backBtn = document.createElement('div');
                    backBtn.className='back-btn';
                    backBtn.innerHTML=\`
                    <div class="back-btn-in">
                        <i data-lucide="x"></i>
                        <span class="back-txt">Back</span>
                    </div>\`;
                    document.body.appendChild(backBtn);
                    lucide.createIcons();
                    backBtn.addEventListener('click',()=>{
                        window.history.back();
                    });
                    </script>
                    </body>`
                );
                return new  Response(modHtml,{
                    headers:{'Content-Type':'text/html'}
                });
            })()
        );
        return;
    }
    event.respondWith(fetch(event.request));
});