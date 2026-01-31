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

const sels = document.querySelectorAll('select');
sels.forEach(sel =>{
    sel.addEventListener('change',(e)=>{
        localStorage.setItem(`krypton_${e.target.id}`, e.target.value);
    });
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
}

loadSettings();

//'stolen' from history.html
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