// actual history stuff
lucide.createIcons();
let history = JSON.parse(localStorage.getItem('krypton_history') || '[]');
let filteredHist = [...history];

function getHistoryTR(range) {
    const now = Date.now();
    const odMs = 24 * 60 * 60 * 1000;
    switch(range) {
        case 'today':
            const sToday = new Date().setHours(0,0,0,0);
            return filteredHist.filter(entry => entry.timestamp >= sToday);
        case 'yesterday':
            const sYest = new Date().setHours(0,0,0,0) - odMs;
            const sToday2 = new Date().setHours(0,0,0,0);
            return filteredHist.filter(entry => entry.timestamp >= sYest && entry.timestamp < sToday2);
        case 'week':
            const weekAgo = now - (7 * odMs);
            const sToday3 = new Date().setHours(0,0,0,0) - odMs;
            return filteredHist.filter(entry => entry.timestamp >= weekAgo && entry.timestamp < sToday3);
        case 'older':
            return filteredHist.filter(entry => entry.timestamp < now - (7 * odMs));
        default:
            return filteredHist;
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor(diff / (1000 * 60));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleTimeString('en-GB', {hour: 'numeric', minute:'2-digit', hour12: true});
}

function formatUrl(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return 'https://' + url;
    }
    return url;
}

function createHistItem(entry, index) {
    const item = document.createElement('div');
    item.className = 'hist-item';
    const displayUrl = entry.url.replace(/^https?:\/\//, '');
    item.innerHTML = `
    <div class="hist-item-icon">
        <i data-lucide="globe"></i>
    </div>
    <div class="hist-item-cont">
        <div class="hist-item-tl">${entry.title}</div>
        <div class="hist-item-url">${displayUrl}</div>
    </div>
    <div class="hist-item-time">${formatTime(entry.timestamp)}</div>
    <button class="hist-item-del" data-index="${index}">
        <i data-lucide="x"></i>
    </button>`;
    item.addEventListener('click', (e) => {
        if (!e.target.closest('.hist-item-del')) {
            window.parent.postMessage({type:'loadUrl',url:formatUrl(entry.url)}, '*');
        }
    });
    const delBtn = item.querySelector('.hist-item-del');
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        delHistItem(index);
    });
    return item;
}

function createES(message) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
    <i data-lucide="inbox"></i>
    <p>${message}</p>`;
    return empty;
}

function renderHistory() {
    const today = getHistoryTR('today');
    const yest = getHistoryTR('yesterday');
    const week = getHistoryTR('week');
    const older = getHistoryTR('older');
    const todayCont = document.getElementById('tdyHistory');
    todayCont.innerHTML = '';
    document.getElementById('tdyCount').textContent = `${today.length} items`;
    if (today.length === 0) {
        todayCont.appendChild(createES('no browsing history for today'));
    } else {
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'hist-items';
        today.forEach((entry,index) => {
            itemsDiv.appendChild(createHistItem(entry,history.indexOf(entry)));
        });
        todayCont.appendChild(itemsDiv);
    }
    const yestCont = document.getElementById('yestHistory');
    yestCont.innerHTML = '';
    document.getElementById('yestCount').textContent = `${yest.length} items`;
    if (yest.length === 0) {
        yestCont.appendChild(createES('no browsing history from yesterday'));
    } else {
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'hist-items';
        yest.forEach((entry,index) => {
            itemsDiv.appendChild(createHistItem(entry,history.indexOf(entry)));
        });
        yestCont.appendChild(itemsDiv);
    }
    const weekCont = document.getElementById('weekHistory');
    weekCont.innerHTML = '';
    document.getElementById('weekCount').textContent = `${week.length} items`;
    if (week.length === 0) {
        weekCont.appendChild(createES('no browsing history from the last week'));
    } else {
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'hist-items';
        week.forEach((entry, index) => {
            itemsDiv.appendChild(createHistItem(entry,history.indexOf(entry)));
        });
        weekCont.appendChild(itemsDiv);
    }
    const olderCont = document.getElementById('olderHistory');
    olderCont.innerHTML = '';
    document.getElementById('olderCount').textContent = `${older.length} items`;
    if (older.length === 0) {
        olderCont.appendChild(createES('no older browsing history'));
    } else {
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'hist-items';
        older.forEach((entry,index) => {
            itemsDiv.appendChild(createHistItem(entry,history.indexOf(entry)));
        });
        olderCont.appendChild(itemsDiv);
    }
    lucide.createIcons();
}

function delHistItem(index) {
    history.splice(index,1);
    localStorage.setItem('krypton_history', JSON.stringify(history));
    filteredHist = [...history];
    renderHistory();
}

function clearAllHist() {
    if (confirm('are you sure you want to clear all your browsing history?')) {
        history = [];
        filteredHist = [];
        localStorage.setItem('krypton_history', JSON.stringify(history));
        //just to make sure this works
        window.parent.postMessage({type:'clearHistory'}, '*');
        renderHistory();
    }
}

function searchHistory(query) {
    if (!query) {
        filteredHist = [...history];
    } else {
        const lowerQuery = query.toLowerCase();
        filteredHist = history.filter(entry =>
            entry.title.toLowerCase().includes(lowerQuery) || entry.url.toLowerCase().includes(lowerQuery)
        );
    }
    renderHistory();
}

document.getElementById('clearBtn').addEventListener('click', clearAllHist);
const searchInput = document.getElementById('histSearch');
searchInput.addEventListener('input', (e) => {
    searchHistory(e.target.value.trim());
});

renderHistory();

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