lucide.createIcons();
let bookmarks = JSON.parse(localStorage.getItem('krypton_bookmarks') || '[]');
let filteredBm = [...bookmarks];

function formatUrl(url) { // an ATTEMPT to stop it from reporting http instead of https but i'm not sure if this will work
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return 'https://' + url;
    }
    return url;
}

function createBmItem(entry,index) {
    const item = document.createElement('div');
    item.className = 'bm-item';
    const displayUrl = entry.url.replace(/^https?:\/\//, '');
    item.innerHTML = `
    <div class="bm-item-icon">
        <i data-lucide="bookmark"></i>
    </div>
    <div class="bm-item-cont">
        <div class="bm-item-tl">${entry.title}</div>
        <div class="bm-item-url">${displayUrl}</div>
    </div>
    <div class="bm-item-time">${formatTime(entry.timestamp)}</div>
    <button class="bm-item-del" data-index="${index}">
        <i data-lucide="x"></i>
    </button>`;
    item.addEventListener('click', (e) => {
        if (!e.target.closest('.bm-item-del')) {
            window.parent.postMessage({type:'loadUrl',url:formatUrl(entry.url)}, '*');
        }
    });
    const delBtn = item.querySelector('.bm-item-del');
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        delBmItem(index);
    });
    return item;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'just now';
}

function createES(message) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
    <i data-lucide="bookmark-x"></i>
    <p>${message}</p>`;
    return empty;
}

function renderBookmarks() {
    const bmCont = document.getElementById('bmList');
    bmCont.innerHTML = '';
    document.getElementById('bmCount').textContent = `${filteredBm.length} items`;
    if (filteredBm.length === 0) {
        bmCont.appendChild(createES('no bookmarks yet'));
    } else {
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'bm-items';
        filteredBm.forEach((entry,index) => {
            itemsDiv.appendChild(createBmItem(entry,bookmarks.indexOf(entry)));
        });
        bmCont.appendChild(itemsDiv);
    }
    lucide.createIcons();
}

function delBmItem(index) {
    bookmarks.splice(index,1);
    localStorage.setItem('krypton_bookmarks', JSON.stringify(bookmarks));
    filteredBm = [...bookmarks];
    renderBookmarks();
}

function addBookmark(title,url) {
    const bookmark = {
        title: title,
        url: formatUrl(url),
        timestamp: Date.now()
    };
    bookmarks.unshift(bookmark);
    localStorage.setItem('krypton_bookmarks', JSON.stringify(bookmarks));
    filteredBm = [...bookmarks];
    renderBookmarks();
}

function searchBookmarks(query) {
    if (!query) {
        filteredBm = [...bookmarks];
    } else {
        const lowerQuery = query.toLowerCase();
        filteredBm = bookmarks.filter(entry => 
            entry.title.toLowerCase().includes(lowerQuery) || entry.url.toLowerCase().includes(lowerQuery)
        );
    }
    renderBookmarks();
}

const overlay = document.getElementById('addOverlay');
const addBtn = document.getElementById('addBtn');
const ovrClose = document.getElementById('ovrClose');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const bmTitle = document.getElementById('bmTitle');
const bmUrl = document.getElementById('bmUrl');

addBtn.addEventListener('click', () => {
    overlay.classList.add('active');
    bmTitle.value = '';
    bmUrl.value = '';
    bmTitle.focus();
});

ovrClose.addEventListener('click', () => {
    overlay.classList.remove('active');
});

cancelBtn.addEventListener('click', () => {
    overlay.classList.remove('active');
});

saveBtn.addEventListener('click', () => {
    const title = bmTitle.value.trim();
    const url = bmUrl.value.trim();
    if (title && url) {
        addBookmark(title,url);
        overlay.classList.remove('active');
    } else {
        alert('please fill in both the title and URL fields.');
    }
});

overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
        overlay.classList.remove('active');
    }
});

const searchInput = document.getElementById('bmSearch');
searchInput.addEventListener('input', (e) => {
    searchBookmarks(e.target.value.trim());
});
renderBookmarks();

function partCount() {
    const preset = localStorage.getItem('krypton_particlePreset') || 'maximum';
    return {off:0,minimal:40,medium:60,maximum:120}[preset]??120;
}

// beautifying stuff
// ripped from history.html
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