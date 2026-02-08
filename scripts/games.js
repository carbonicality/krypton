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
        games = gnMathZones.map(zone=>({
            name:zone.name,
            icon:zone.cover.replace("{COVER_URL}",COVER_URL).replace("{HTML_URL}",HTML_URL),
            url:zone.url.replace("{HTML_URL}",HTML_URL).replace("{COVER_URL}",COVER_URL)
        }));
        fGames=[...games];
        renderGames();
    } catch (error) {
        console.error('failed to load games',error);
    }
}

function createGC(game) { //create GSC perhaps???????????? cr50 ti50 oooh
    const card=document.createElement('div');
    card.className ='gcard';
    const isCached = localStorage.getItem('krypton_games_cached') === 'true';
    card.innerHTML = `
    <div class="gicon">
        <img src="${game.icon}" alt="${game.name}">
    </div>
    <div class="game-nm">${game.name}</div>
    ${isCached ? '<div class="cbadge"><i data-lucide="database"></i></div>':''}
    `;
    card.addEventListener('click',()=>{
        openGame(game);
    });
    return card;
}

async function openGame(game) {
    try {
        //handle externals, open in new
        if (game.url.startsWith("http") && !game.url.includes("cdn.jsdelivr.net")) {
            window.open(game.url,"_blank");
            return;
        }
        const res = await fetch(game.url+"?t="+Date.now());
        const html= await res.text();
        document.open();
        document.write(html);
        document.close();
    } catch (error) {
        console.error('err fetching game:(',error);
        if (error.message.includes('HTTP') ||error.message.includes('fetch')){
            alert('failed to load game'+error.message);
        }
    }
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
    fetchGames();
}
initBack();

// beautifying stuff
function initParticles() {
    if (typeof particlesJS !== 'undefined') {
        particlesJS('particles-js', {
            particles: {
                number: {
                    value: 120,
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