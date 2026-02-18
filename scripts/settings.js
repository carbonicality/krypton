lucide.createIcons();

const navItems=document.querySelectorAll('.nav-item');
const sections=document.querySelectorAll('.setsection');
navItems.forEach(item=>{
    item.addEventListener('click',()=>{
        const secId = item.dataset.sec;
        navItems.forEach(nav=>nav.classList.remove('active'));
        item.classList.add('active');
        sections.forEach(sec => sec.classList.remove('active'));
        document.getElementById(secId).classList.add('active');
        lucide.createIcons();
    });
});

document.getElementById('cacheBtn').addEventListener('click',async()=>{
    if (!navigator.serviceWorker.controller) {
        alert('SW not ready yet, please try again in a moment.');
        return;
    }
    try {
        const cache = await caches.open('krypton-v1');
        await cache.addAll([
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
        ]);
        localStorage.setItem('krypton_games_cached','true');
        alert('Site cached successfully. You can now use krypton offline.');
    } catch (err) {
        console.error('caching failed',err);
        alert('Caching failed: '+err.message);
    }
});

const sels = document.querySelectorAll('select');
sels.forEach(sel =>{
    sel.addEventListener('change',(e)=>{
        localStorage.setItem(`krypton_${e.target.id}`, e.target.value);
    });
});

document.getElementById('particlePreset').addEventListener('change',()=>{
        alert('This window will refresh to apply changes.');
        window.parent.location.reload();
    });

const inputs = document.querySelectorAll('input[type="text"]');
inputs.forEach(input => {
    input.addEventListener('change',(e)=>{
        localStorage.setItem(`krypton_${e.target.id}`,e.target.value);
    });
});

const clearBtn = document.getElementById('sudo-rm');
if (clearBtn) {
    clearBtn.addEventListener('click',()=>{
        if (confirm('are you sure you want to clear all data? this cannot be undone.')) {
            localStorage.clear();
            alert('all data has been cleared.');
            window.location.reload();
        }
    });
}

function initTgls() {
    const tgls = {
        tglParticles: 'krypton_particles',
        tglAnims: 'krypton_anims'
    };
    Object.entries(tgls).forEach(([id,key])=>{
        const el = document.getElementById(id);
        if (!el) return;
        if (localStorage.getItem(key)!=='false') el.classList.add('active');
        el.addEventListener('click',()=>{
            el.classList.toggle('active');
            localStorage.setItem(key,el.classList.contains('active'));
            alert('This window will refresh to apply changes.')
            window.parent.location.reload();
        });
    });
}
initTgls();

function loadSettings() {
    const sSearchEng = localStorage.getItem('krypton_searchEngine');
    if (sSearchEng) {
        const searchSel=document.getElementById('searchEngine');
        if (searchSel) searchSel.value=sSearchEng;
    }
    const sProxyType = localStorage.getItem('krypton_proxyType');
    if (sProxyType) {
        const proxySel = document.getElementById('proxyType');
        if (proxySel) proxySel.value= sProxyType;
    }
    const sWispUrl = localStorage.getItem('krypton_wispUrl');
    if (sWispUrl) {
        const wispInput = document.getElementById('wispUrl');
        if (wispInput) wispInput.value=sWispUrl;
    }
    const sTheme = localStorage.getItem('krypton_themeType');
    if (sTheme) {
        const themeSel = document.getElementById('themeType');
        if (themeSel) themeSel.value = sTheme;
    }
    const sParticlePreset = localStorage.getItem('krypton_particlePreset');
    if (sParticlePreset) {
        const presetSel = document.getElementById('particlePreset');
        if (presetSel) presetSel.value = sParticlePreset;
    }
}

loadSettings();

function partCount() {
    const preset = localStorage.getItem('krypton_particlePreset') || 'maximum';
    return {off:0,minimal:40,medium:60,maximum:120}[preset]??120;
}

//'stolen' from history.html
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