lucide.createIcons();

const apps = [
    {
        name:'Roblox',
        icon:'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Roblox_%282025%29_%28App_Icon%29.svg/960px-Roblox_%282025%29_%28App_Icon%29.svg.png',
        url:'https://92.ip.nowgg.fun/apps/a/19900/b.html'
    }
];

let fApps = [...apps];

function openApp(url) {
    window.parent.postMessage({type:'app-load-url',url:url},'*');
}

function renderApps() {
    const grid = document.getElementById('appGrid');
    const emptyState = document.getElementById('emptyState');
    grid.innerHTML = '';
    if (fApps.length === 0) {
        grid.style.display='none';
        emptyState.style.display = 'flex';
    } else {
        grid.style.display='grid';
        emptyState.style.display='none';
        fApps.forEach((app,idx)=>{
            const card = document.createElement('div');
            card.className = 'gcard';
            card.innerHTML = `
            <div class="gicon">
                <img src="${app.icon}" alt="${app.name}" loading="lazy">
            </div>
            <div class="game-nm">${app.name}</div>`;
            card.style.animationDelay = `${idx*0.05}s`;
            card.addEventListener('click',()=>openApp(app.url));
            grid.appendChild(card);
        });
    }
    lucide.createIcons();
}

function searchApps(query) {
    if (!query) {
        fApps = [...apps];
    }else {
        const lQuery = query.toLowerCase();
        fApps = apps.filter(app=>app.name.toLowerCase().includes(lQuery));
    }
    renderApps();
}

let sTimeout;
const searchInput = document.getElementById('appSearch');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        clearTimeout(sTimeout);
        sTimeout = setTimeout(() => {
            searchApps(e.target.value.trim());
        }, 150);
    });
}

renderApps();
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