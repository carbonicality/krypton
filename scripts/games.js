lucide.createIcons();
let games=[];
let fGames=[];

const COVER_URL = "https://cdn.jsdelivr.net/gh/gn-math/covers@main";
const HTML_URL = "https://cdn.jsdelivr.net/gh/gn-math/html@main";

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
        fGames=[...games];
        renderGames();
    } catch (error) {
        console.error('failed to load games',error);
        const cachedGames = localStorage.getItem('krypton_games_list');
        if (cachedGames) {
            console.log('loading games from cache!');
            games=JSON.parse(cachedGames);
            if (!navigator.onLine) {
                const cached = JSON.parse(localStorage.getItem('krypton_cached_games') || '[]');
                fGames = cached;
            } else {
                fGames = [...games];
            }
            renderGames();
        }
    }
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
    <div class="game-nm">${game.name}</div>
    <button class="cache-btn" title="Cache for offline">
        <i data-lucide="download"></i>
    </button>`;
    const cacheBtn = card.querySelector('.cache-btn');
    const cachedGames = JSON.parse(localStorage.getItem('krypton_cached_games')||'[]');
    const isCached = cachedGames.some(g => g.url === game.url);
    if (isCached) {
        cacheBtn.innerHTML = '<i data-lucide="check"></i>';
        cacheBtn.style.color = '#22c55e';
        lucide.createIcons();
    }
    cacheBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            const cache = await caches.open('krypton-games-v1');
            await cache.add(game.url);
            await cache.add(game.icon);
            try {
                const response = await fetch(game.url);
                const html = await response.text();
                const scriptRegex = /<script[^>]+src=["']([^"']+)["']/g;
                const linkRegex = /<link[^>]+href=["']([^"']+)["']/g;
                const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
                const resources = [];
                let match;
                while ((match = scriptRegex.exec(html))!==null) {
                    resources.push(match[1]);
                }
                while ((match = linkRegex.exec(html))!==null) {
                    resources.push(match[1]);
                }
                while ((match = imgRegex.exec(html))!==null) {
                    resources.push(match[1]);
                }
                const gameUrl = new URL(game.url);
                const absResources = resources.map(resource => {
                    if (resource.startsWith('http')) {
                        return resource;
                    } else if (resource.startsWith('//')) {
                        return 'https:'+resource;
                    } else if (resource.startsWith('/')) {
                        return gameUrl.origin + resource;
                    } else {
                        const gamePath = gameUrl.pathname.substring(0,gameUrl.pathname.lastIndexOf('/')+1);
                        return gameUrl.origin+gamePath+resource;
                    }
                });
                for (const resource of absResources) {
                    try {
                        await cache.add(resource);
                    } catch (err) {
                        console.log('couldnt cache resources', resource);
                    }
                }
            } catch (err) {
                console.log('couldnt parse game html',err);
            }
            const cachedGames = JSON.parse(localStorage.getItem('krypton_cached_games')||'[]');
            if (!cachedGames.some(g => g.url === game.url)) {
                cachedGames.push(game);
                localStorage.getItem('krypton_cached_games',JSON.stringify(cachedGames));
            }
            cacheBtn.innerHTML = '<i data-lucide="check"></i>';
            cacheBtn.style.color = '#22c55e';
            lucide.createIcons();
        } catch (err) {
            console.error('failed to cache game: ',err);
            cacheBtn.innerHTML = '<i data-lucide="x"></i>';
            cacheBtn.style.color = '#ef4444';
            lucide.createIcons();
        }
    });
    card.addEventListener('click',()=>{
        openGame(game);
    });
    return card;
}

function isOnline() {
    return navigator.onLine;
}

async function getGames() {
    if (isOnline()) {
        return games;
    } else {
        const cachedGames = JSON.parse(localStorage.getItem('krypton_cached_games'));
        return cachedGames;
    }
}

async function openGame(game) {
    console.log('zone frame',document.getElementById('zoneFrame'));
    console.log('close game',document.getElementById('closeGame'));
    try {
        if (game.url.startsWith("http") && !game.url.includes("cdn.jsdelivr.net")) {
            window.open(game.url,"_blank");
            return;
        }
        let html;
        if (!navigator.onLine) {
            const cache = await caches.open('krypton-games-v1');
            const cacheRes = await cache.match(game.url);
            if (cacheRes) {
                html = cacheRes.text();
            } else {
                alert('This game is not cached for offline play. Please cache it while online.');
                return;
            }
        } else {
            const res = await fetch(game.url+"?t="+Date.now());
            html = await res.text();
        }
        const frame = document.getElementById('zoneFrame');
        frame.style.display = 'block';
        frame.contentDocument.open();
        frame.contentDocument.write(html);
        frame.contentDocument.close();
        frame.contentDocument.body.style.backgroundColor='#0a0a0a';
        const closeBtn = document.getElementById('closeGame');
        closeBtn.style.display = 'block';
        lucide.createIcons();
    } catch (err) {
        console.error('error fetching game',err);
        alert('Failed to load game. Make sure it is cached for offline play.');
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
        fGames=[...games];
    } else {
        const lQuery = query.toLowerCase();
        fGames = games.filter(game=>{
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
    if (!navigator.onLine) {
        const searchBox = document.querySelector('.search-box');
        const offlineMsg = document.createElement('div');
        offlineMsg.style.cssText = 'text-align:center;color:#94a3b8;font-size:14px;margin-top:12px;';
        offlineMsg.textContent = 'offline - showing cached games only';
        searchBox.appendChild(offlineMsg);
    }
    fetchGames();
}
initBack();

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