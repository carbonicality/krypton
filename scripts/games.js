lucide.createIcons();
let games=[];
let fGames=[];
let aGames=[];

const COVER_URL = "https://cdn.jsdelivr.net/gh/gn-math/covers@main";
const HTML_URL = "https://cdn.jsdelivr.net/gh/gn-math/html@main";
const CKV_URL = "https://cdn.jsdelivr.net/gh/WanoCapy/ChickenKingsVault@main";
const CKV_ICONS_URL = "https://raw.githubusercontent.com/carbonicality/ChickenKingsVault/main";

let currProvider = localStorage.getItem('krypton_provider') || 'ckv';

console.log('sw controlled:',!!navigator.serviceWorker.controller);
if (navigator.serviceWorker.controller) {
    console.log('sw controlling from',navigator.serviceWorker.controller.scriptURL);
}

async function fetchGames() {
    try {
        let zonesUrl = "https://cdn.jsdelivr.net/gh/gn-math/assets@main/zones.json";
        try {
            const sharesponse = await fetch("https://api.github.com/repos/gn-math/assets/commits?t="+Date.now());
            if (sharesponse && sharesponse.status===200) {
                const shajson=await sharesponse.json();
                const sha=shajson[0]['sha'];
                if (sha) {
                    zonesUrl =`https://cdn.jsdelivr.net/gh/gn-math/assets@${sha}/zones.json`;
                }
            }
        } catch (error) {
            console.log('using default zones');
        }
        const res = await fetch(zonesUrl+"?t="+Date.now());
        const gnMathZones = await res.json();
        games = gnMathZones
            .filter(zone => zone.id !== -1 && zone.id !== 1 && zone.id !== 64)

            .map(zone => {
                let url = zone.url.replace("{HTML_URL}",HTML_URL).replace("{COVER_URL}",COVER_URL);
                if (zone.id===0) {
                    url = "https://cdn.jsdelivr.net/gh/bubbls/youtube-playables@main/bowmasters/index.html";
                }
                return {
                    name:zone.name,
                    icon:zone.cover.replace("{COVER_URL}",COVER_URL).replace("{HTML_URL}",HTML_URL),
                    url: url
                }
            });
        localStorage.setItem('krypton_games_list',JSON.stringify(games));
        if (!navigator.onLine) {
            checkGames().then(cachedUrls => {
                fGames = games.filter(game => cachedUrls.includes(game.url));
                renderGames();
            });
        } else {
            aGames = [...games];
            fGames = [...games];
            renderGames();
        }
    } catch (error) {
        console.error('failed to load games',error);
        const cachedGames = localStorage.getItem('krypton_games_list');
        if (cachedGames) {
            console.log('loading games from cache!');
            games=JSON.parse(cachedGames);
            if (!navigator.onLine) {
                checkGames().then(cachedUrls => {
                    aGames = games.filter(game=>cachedUrls.includes(game.url));
                    fGames = [...aGames];
                    renderGames();
                });
            } else {
                fGames = [...games];
                renderGames();
            }
            fGames = [...games];
            renderGames();
        }
    }
}

function loadProvider(provider) {
    currProvider = provider;
    localStorage.setItem('krypton_provider',provider);
    games = [];fGames=[];aGames=[];
    const badge  = document.getElementById('provBadge');
    if (badge) badge.textContent = provider==='ckv'?'CKV':'gn-math';
    document.querySelectorAll('.prov-option').forEach(el => {
        el.classList.toggle('active',el.dataset.provider===provider);
    });
    if (provider==='ckv') fetchCKVGames();
    else fetchGames();
}

function initProvSel() {
    const wrapper = document.querySelector('.search-sec');
    const searchBox = document.querySelector('.search-box');
    if (!wrapper || !searchBox) return;
    const providerEl = document.createElement('div');
    providerEl.className = 'prov-sel';
    providerEl.innerHTML = `
    <div class="prov-btn" id="provBtn">
        <i data-lucide="layers"></i>
        <span id="provBadge" class="prov-badge">${currProvider === 'ckv' ? 'CKV' : 'gn-math'}</span
        <i data-lucide="chevron-down" class="prov-chevron"></i>
    </div>
    <div class="prov-dropdown" id="provDropdown">
        <div class="prov-option ${currProvider === 'ckv'?'active':''}" data-provider="ckv">
            <span class="prov-dot"></span>
            CKV
        </div>
        <div class="prov-option ${currProvider === 'gnmath'?'active':''}" data-provider="gnmath">
            <span class="prov-dot"></span>
            gn-math
        </div>
    </div>`;
    wrapper.insertBefore(providerEl,searchBox);
    const btn = document.getElementById('provBtn');
    const dropdown= document.getElementById('provDropdown');
    btn.addEventListener('click',(e)=>{
        e.stopPropagation();
        dropdown.classList.toggle('open');
    });
    document.addEventListener('click',()=>dropdown.classList.remove('open'));
    providerEl.querySelectorAll('.prov-option').forEach(el=>{
        el.addEventListener('click',()=>{
            dropdown.classList.remove('open');
            loadProvider(el.dataset.provider);
        });
    });
    lucide.createIcons();
}

async function fetchCKVGames() {
    try {
        const iconMap = {};
        try {
            const iconRes = await fetch(`${CKV_ICONS_URL}/games.json?t=${Date.now()}`);
            const iconJson = await iconRes.json();
            iconJson.forEach(g => {
                const key = g.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                iconMap[key] = `${CKV_ICONS_URL}/${g.img}`;
            });
        } catch (e) {
            console.log('couldnt load icon map');
        }
        const apiUrl = `https://api.github.com/repos/WanoCapy/ChickenKingsVault/contents/`;
        const res = await fetch(apiUrl);
        const json = await res.json();
        let htmlFiles = json.filter(f => f.type==='file'&&f.name.endsWith('.html') && f.name !=='index.html');
        const prettyFiles = htmlFiles.filter(f => /[A-Z\s]/.test(f.name));
        if (prettyFiles.length > 0) htmlFiles = prettyFiles;
        games = htmlFiles.map(f => {
            const normKey = f.name.replace('.html','').toLowerCase().replace(/[^a-z0-9]/g, '');
            const icon = iconMap[normKey]||'';
            return {
                name:f.name.replace('.html',''),
                icon:icon,
                url:`${CKV_URL}/${f.name}`
            };
        });
        localStorage.setItem('krypton_games_list_ckv',JSON.stringify(games));
        aGames = [...games];
        fGames = [...games];
        renderGames();
    } catch (error) {
        console.error('failed to load CKV games:',error);
        const cachedGames = localStorage.getItem('krypton_games_list_ckv');
        if (cachedGames) {
            games = JSON.parse(cachedGames);
            aGames = [...games];
            fGames = [...games];
            renderGames();
        }
    }
}

async function checkGames() {
    try {
        const cache = await caches.open('krypton-v2');
        const requests  =await cache.keys();
        const cachedUrls = requests.map(req => req.url);
        return cachedUrls;
    } catch (err) {
        console.error('error checking cache',err);
        return [];
    }
}

function genFallback(name) {
    const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    return `<div style="width:100%;height:100%;background:linear-gradient(180deg,#60a5fa,#93c5fd);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:white;text-shadow:0 2px 8px rgba(0,0,0,0.6);border-radius:inherit;letter-spacing:1px;">${initials}</div>`;
}

function createGC(game) {
    const card = document.createElement('div');
    card.className = 'gcard';
    if (localStorage.getItem('krypton_anims') === 'false') {
        card.style.transition = 'none';
    }
    card.innerHTML = `
    <div class="gicon">
        <img src="${game.icon}" alt="${game.name}" loading="lazy">
    </div>
    <div class="game-nm">${game.name}</div>`;
    const img = card.querySelector('img');
    if (!game.icon) {
        img.parentElement.innerHTML = genFallback(game.name);
    } else {
        img.addEventListener('error',()=>{
            img.parentElement.innerHTML = genFallback(game.name);
        });
    }
    card.addEventListener('click',()=>openGame(game));
    return card;
}

async function openGame(game) {
    console.log('zone frame',document.getElementById('zoneFrame'));
    console.log('close game',document.getElementById('closeGame'));
    try {
        if (game.url.startsWith("http") && !game.url.includes("cdn.jsdelivr.net")) {
            window.open(game.url,"_blank");
            return;
        }
        const res = await fetch(game.url);
        const html = await res.text();
        const frame = document.getElementById('zoneFrame');
        if (!frame) {
            console.error('zoneFrame not found');
            return;
        }
        frame.style.display = 'block';
        frame.contentDocument.open();
        frame.contentDocument.write(html);
        frame.contentDocument.close();

        //ad block!
        const removeAds = frame.contentDocument.createElement('script');
        removeAds.textContent=`
        function removeAds() {
            ['sidebarad1','sidebarad2'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
        }
        removeAds();
        const observer = new MutationObserver(removeAds);
        observer.observe(document.body,{childList:true,subtree:true});`;
        frame.contentDocument.body.appendChild(removeAds);

        frame.contentDocument.body.style.backgroundColor = '#0a0a0a';
        const closeBtn = document.getElementById('closeGame');
        if (closeBtn) {
            closeBtn.style.display='block';
        }
        document.getElementById('fsBtn').style.display='block';
        lucide.createIcons();
    } catch (err) {
        console.error('error fetching game',err);
        const frame = document.getElementById('zoneFrame');
        if (!frame || frame.style.display==='none') {
            alert("Failed to load game! :(");
        }
    }
}

function closeGame() {
    const frame = document.getElementById('zoneFrame');
    frame.remove();
    const nFrame = document.createElement('iframe');
    nFrame.id='zoneFrame';
    nFrame.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:9999;';
    document.body.appendChild(nFrame);
    document.getElementById('closeGame').style.display='none';
    document.getElementById('fsBtn').style.display='none';
}

function tglFullscreen() {
    const iframe = document.getElementById('zoneFrame');
    const icon = document.querySelector('#fsBtn i');
    if (!document.fullscreenElement) {
        iframe.requestFullscreen();
        icon.setAttribute('data-lucide','minimize');
    } else {
        document.exitFullscreen();
        icon.setAttribute('data-lucide','maximize');
    }
    lucide.createIcons();
}

function initBack() {
    const isMenu = document.getElementById('gameGrid') !== null;
    if (!isMenu) {
        const backBtn=document.createElement('div');
        backBtn.className='back-btn';
        backBtn.innerHTML =`
        <div class="back-btn-in">
            <i data-lucide="x"></i>
            <span class="back-txt">Back</span>
        </div>`;
        document.body.appendChild(backBtn);
        lucide.createIcons();
        backBtn.addEventListener('click',()=>{
            window.history.back();
        });
    }
}

function renderGames() {
    const grid = document.getElementById('gameGrid');
    const emptyState = document.getElementById('emptyState');
    grid.innerHTML = '';
    if (fGames.length===0) {
        grid.style.display='none';
        emptyState.style.display='flex';
    } else {
        grid.style.display='grid';
        emptyState.style.display='none';
        fGames.forEach((game,index)=>{
            const card = createGC(game);
            card.style.animationDelay=`${index*0.05}s`;
            grid.appendChild(card);
        });
    }
    lucide.createIcons();
}

function searchGames(query) {
    if (!query) {
        fGames=[...aGames];
    } else {
        const lQuery = query.toLowerCase();
        fGames = aGames.filter(game=>{
            return game.name.toLowerCase().includes(lQuery);
        });
    }
    renderGames();
}

const searchInput = document.getElementById('gameSearch');
if (searchInput) {
    searchInput.addEventListener('input',(e)=>{
        searchGames(e.target.value.trim());
    });
    initProvSel();
    loadProvider(currProvider);
}
initBack();

window.addEventListener('DOMContentLoaded',()=>{
    if (!navigator.onLine) {
        const gametainer = document.querySelector('.gametainer');
        if (gametainer) {
            const offlineMsg = document.createElement('div');
            offlineMsg.className='offline-indicator';
            offlineMsg.style.cssText = 'text-align:center;color:#94a3b8;font-size:14px;margin-top:16px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(239,68,68,0.08);padding:10px 16px;border-radius:10px;border:1px solid rgba(239,68,68,0.2);';
            offlineMsg.innerHTML = '<i data-lucide="wifi-off" style="width=16px;height=16px;"></i> <span>you are offline - showing cached games only</span>';
            gametainer.insertBefore(offlineMsg,gametainer.firstChild);
            lucide.createIcons();
        }
    }
});

let sTimeout;
searchInput.addEventListener('input',(e)=>{
    clearTimeout(sTimeout);
    sTimeout = setTimeout(()=>{
        searchGames(e.target.value.trim());
    },150);
});

function partCount() {
    const preset = localStorage.getItem('krypton_particlePreset') || 'maximum';
    return {off:0,minimal:40,medium:60,maximum:120}[preset]??120;
}

// beautifying stuff
function initParticles() {
    if (localStorage.getItem('krypton_particles')==='false') return;
    const count = partCount();
    if (typeof particlesJS !== 'undefined') {
        particlesJS('particles-js', {
            particles: {
                number: {
                    value: count,
                    density: {
                        enable: true,
                        value_area: 800
                    }
                },
                color: {
                    value: ['#60a5fa', '#93c5fd', '#dbeafe', '#fff']
                },
                shape: {
                    type: 'circle'
                },
                opacity: {
                    value: 0.6,
                    random: true,
                    anim: {
                        enable: true,
                        speed: 0.8,
                        opacity_min: 0.1,
                        sync: false
                    }
                },
                size: {
                    value: 2.5,
                    random: true,
                    anim: {
                        enable: true,
                        speed: 2,
                        size_min: 0.3,
                        sync: false
                    }
                },
                line_linked: {
                    enable: true,
                    distance: 120,
                    color: '#60a5fa',
                    opacity: 0.15,
                    width: 1
                },
                move: {
                    enable: true,
                    speed: 0.8,
                    direction: 'none',
                    random: true,
                    straight: false,
                    out_mode: 'out',
                    bounce: false,
                    attract: {
                        enable: true,
                        rotateX: 600,
                        rotateY: 1200
                    }
                }
            },
            interactivity: {
                detect_on: 'canvas',
                events: {
                    onhover: {
                        enable: true,
                        mode: 'grab'
                    },
                    onclick: {
                        enable: true,
                        mode: 'push'
                    },
                    resize: true
                },
                modes: {
                    grab: {
                        distance: 140,
                        line_linked: {
                            opacity: 0.4
                        }
                    },
                    push: {
                        particles_nb: 4
                    }
                }
            },
            retina_detect: true
        });
    } else {
        setTimeout(initParticles,100);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initParticles);
} else {
    initParticles();
}

window.addEventListener('offline',()=>{
    const gametainer = document.querySelector('.gametainer');
    if (gametainer && !document.querySelector('.offline-indicator')) {
        const offlineMsg = document.createElement('div');
        offlineMsg.className = 'offline-indicator';
        offlineMsg.style.cssText = 'text-align:center;color:#94a3b8;font-size:14px;margin-top:16px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(239,68,68,0.08);padding:10px 16px;border-radius:10px;border:1px solid rgba(239,68,68,0.2);';
        offlineMsg.innerHTML = '<i data-lucide="wifi-off" style="height=16px;width=16px;"></i> <span>you are offline - showing cached games only</span>';
        gametainer.insertBefore(offlineMsg, gametainer.firstChild);
        lucide.createIcons();
        checkGames().then(cachedUrls => {
            aGames = games.filter(game => cachedUrls.includes(game.url));
            fGames = [...aGames];
            renderGames();
        });
    }
});