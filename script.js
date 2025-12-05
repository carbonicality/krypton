lucide.createIcons();

let tabCount = 1;
let tabs = {};
let urlUpdInterval = null;
const urlContainer = document.querySelector('.url-intainer');
const urlInput = document.getElementById('urlInput');
const urlDisplay = document.createElement('div');
urlDisplay.className = 'url-display';
urlContainer.insertBefore(urlDisplay,urlInput.nextSibling);
let isNav = false;

let bookmarks = JSON.parse(localStorage.getItem('krypton_bookmarks') || '[]');

function renderBms() {
    const container = document.getElementById('bmContainer');
    container.innerHTML = '';
    bookmarks.forEach((bookmark, index) => {
        const bmEl = document.createElement('div');
        bmEl.className = 'bm-item';
        bmEl.innerHTML = `
        <div class="bm-icon">
            <i data-lucide="globe"></i>
        </div>
        <span class="bm-title">${bookmark.title}</span>
        <div class="bm-remove" data-index="${index}">
            <i data-lucide="x"></i>
        </div>`;
        bmEl.addEventListener('click', (e)=> {
            if (!e.target.closest('.bm-remove')) {
                loadWebsite(bookmark.url);
            }
        });
        const removeBtn = bmEl.querySelector('.bm-remove');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeBm(index);
        });
        container.appendChild(bmEl);
    });
    lucide.createIcons();
}

function addBm(url,title) {
    const bookmark = {url,title};
    bookmarks.push(bookmark);
    localStorage.setItem('krypton_bookmarks', JSON.stringify(bookmarks));
    renderBms();
}

function removeBm(index) {
    bookmarks.splice(index,index+1);
    localStorage.setItem('krypton_bookmarks', JSON.stringify(bookmarks));
    renderBms();
}

function isBookmarked(url) {
    return bookmarks.some(b => b.url === url);
}

function updBmBtn() {
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) return;
    const tabId = activeTab.dataset.tabId;
    const currentUrl = tabs[tabId]?.url;
    const btn = document.getElementById('bmBtn');
    const bookmarked = currentUrl && currentUrl !== 'krypton://new-tab' && isBookmarked(currentUrl);
    btn.innerHTML = '<i data-lucide="star"></i>';
    lucide.createIcons();
    if (bookmarked) {
        const svg = btn.querySelector('svg');
        svg.style.fill = '#60a5fa';
        svg.style.color = '#60a5fa';
    }
}
 
document.getElementById('bmBtn').addEventListener('click', () => {
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) return;
    const tabId = activeTab.dataset.tabId;
    const currentUrl = tabs[tabId]?.url;
    if (!currentUrl || currentUrl === 'krypton://new-tab') return;
    const btn = document.getElementById('bmBtn');
    if (isBookmarked(currentUrl)) {
        const index = bookmarks.findIndex(b => b.url === currentUrl);
        if (index !== -1) {
            removeBm(index);
        }
        btn.innerHTML= '<i data-lucide="star"></i>';
        lucide.createIcons();
    } else {
        let title;
        try {
            const urlObj = new URL(currentUrl);
            title = urlObj.hostname;
        } catch (e) {
            title = currentUrl;
        }
        addBm(currentUrl, title);
        btn.innerHTML = '<i data-lucide="star"></i>';
        lucide.createIcons();
        const svg = btn.querySelector('svg');
        svg.style.fill = '#60a5fa';
        svg.style.color = '#60a5fa';
    }
});

renderBms();

function formatUrl(url) {
    if (!url || url === 'krypton://new-tab') return '';
    try {
        const urlObj = new URL(url);
        return `<span class="url-proto">${urlObj.protocol}//</span><span class="url-domain">${urlObj.hostname}</span><span class="url-path">${urlObj.pathname}${urlObj.search}${urlObj.hash}</span>`;
    } catch (e) {
        return `<span class="url-domain">${url}</span>`;
    }
}

urlInput.addEventListener('blur', () => {
    if (urlInput.value && urlInput.value !== 'krypton://new-tab') {
        urlDisplay.innerHTML = formatUrl(urlInput.value);
        urlDisplay.style.display = 'block';
        urlInput.style.display = 'none';
    }
});

urlDisplay.addEventListener('click', () => {
    urlDisplay.style.display = 'none';
    urlInput.style.display = 'block';
    urlInput.focus();
});

urlInput.addEventListener('focus', () => {
    urlDisplay.style.display = 'none';
    urlInput.style.display = 'block';
});

document.getElementById('ntBtn').addEventListener('click', () => {
    tabCount++;
    const tabBar = document.getElementById('tabBar');
    const ntBtn = document.getElementById('ntBtn');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const newTab = document.createElement('div');
    newTab.className = 'tab active';
    newTab.dataset.tabId = tabCount;
    newTab.innerHTML = `
    <div class="tab-fav">
        <i data-lucide="globe"></i>
    </div>
    <span class="tab-tl">New Tab</span>
    <div class="tab-cl">
        <i data-lucide="x"></i>
    </div>`;
    tabBar.insertBefore(newTab,ntBtn);
    lucide.createIcons();
    addTL(newTab);
    tabs[tabCount] = {
        url:'krypton://new-tab',
        title:'New Tab',
        iframe:null,
        isFirst:true,
        cgf:false
    };
    showWscreen();
});

function updLIC(url) {
    const urlIcon = document.querySelector('.url-icon');
    if (!url || url === 'krypton://new-tab') {
        urlIcon.innerHTML = '<i data-lucide="atom"></i>';
        urlIcon.style.color = '#60a5fa';
        lucide.createIcons();
        return;
    }
    try {
        const urlObj = new URL(url);
        if (urlObj.protocol === 'https:') {
            urlIcon.innerHTML = '<i data-lucide="lock"></i>';
            urlIcon.style.color = '#22c55e';
        } else if (urlObj.protocol === 'http:') {
            urlIcon.innerHTML = '<i data-lucide="unlock"></i>';
            urlIcon.style.color = '#eb4034';
        } else {
            urlIcon.innerHTML = '<i data-lucide="ellipsis"></i>';
            urlIcon.style.color = '#60a5fa';
        }
        lucide.createIcons();
    } catch (e) {
        urlIcon.innerHTML = '<i data-lucide="atom"></i>';
        urlIcon.style.color = '#60a5fa';
        lucide.createIcons();
    }
}

function swTab(tabId) {
    const cArea = document.querySelector('.c-area');
    const wScreen = document.querySelector('.wscreen');
    document.querySelectorAll('.bframe').forEach(iframe => {
        iframe.style.display = 'none';
    });
    if (urlUpdInterval) {
        clearInterval(urlUpdInterval);
    }
    if (tabs[tabId] && tabs[tabId].iframe) {
        tabs[tabId].iframe.style.display = 'block';
        wScreen.style.display = 'none';
        document.getElementById('urlInput').value = tabs[tabId].url || '';
        if (tabs[tabId].url && tabs[tabId].url !== 'krypton://new-tab') {
            urlDisplay.innerHTML = formatUrl(tabs[tabId].url);
            urlDisplay.style.display = 'block';
            urlInput.style.display = 'none';
            updLIC(tabs[tabId].url);
        } else {
            urlDisplay.innerHTML = '';
            urlDisplay.style.display = 'none';
            urlInput.style.display = 'block';
            urlInput.value = '';
            updLIC('krypton://new-tab');
        }
        startURLM(tabs[tabId].iframe,tabId);
        updNavBtns();
    } else if (tabs[tabId] && tabs[tabId].url === 'krypton://new-tab') {
        wScreen.style.display = 'block';
        document.getElementById('urlInput').value = '';
        urlDisplay.innerHTML = '';
        urlDisplay.style.display = 'none';
        urlInput.style.display = 'block';
        updLIC('krypton://new-tab');
        updNavBtns();
    } else {
        wScreen.style.display = 'block';
        document.getElementById('urlInput').value = '';
        urlDisplay.innerHTML = '';
        urlDisplay.style.display = 'none';
        urlInput.style.display = 'block';
        updLIC('krypton://new-tab');
        updNavBtns();
    }
    updBmBtn();
}

function showWscreen() {
    const wScreen = document.querySelector('.wscreen');
    document.querySelectorAll('.bframe').forEach(iframe => {
        iframe.style.display = 'none';
    });
    wScreen.style.display = 'block';
    document.getElementById('urlInput').value = '';
    urlDisplay.innerHTML = '';
    urlDisplay.style.display = 'none';
    urlInput.style.display = 'block';
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        const tabId = activeTab.dataset.tabId;
        if (tabs[tabId]) {
            tabs[tabId].url = 'krypton://new-tab';
        }
        activeTab.querySelector('.tab-tl').textContent = 'New Tab';
    }
    updLIC('krypton://new-tab');
    if (urlUpdInterval) {
        clearInterval(urlUpdInterval);
    }
    updNavBtns();
    updBmBtn();
}

function startURLM(iframe,tabId) {
    const activeTab = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    let lastUrl = tabs[tabId]?.url;
    let urlChangeCount = 0;
    urlUpdInterval = setInterval(() => {
        try {
            let iframeSrc = iframe.contentWindow.location.href;
            if (iframeSrc.includes('/scramjet/')) {
                let encodedUrl = iframeSrc.split('/scramjet/')[1];
                let decodedUrl = decodeURIComponent(encodedUrl);
                if (tabs[tabId] && tabs[tabId].url !== decodedUrl) {
                    updBmBtn();
                    tabs[tabId].isFirst = false;
                    if (lastUrl !== decodedUrl && !isNav) {
                        tabs[tabId].cgf = false;
                        updNavBtns();
                    }
                }
                lastUrl = decodedUrl;
                if (document.activeElement !== urlInput) {
                    document.getElementById('urlInput').value = decodedUrl;
                    if (document.getElementById('urlInput').style.display === 'none') {
                        urlDisplay.innerHTML = formatUrl(decodedUrl);
                    }
                }
                updLIC(decodedUrl);
                tabs[tabId].url = decodedUrl;
                try {
                    let urlObj = new URL(decodedUrl);
                    if (activeTab) {
                        activeTab.querySelector('.tab-tl').textContent = urlObj.hostname;
                    }
                } catch (e) {
                    if (activeTab) {
                        activeTab.querySelector('.tab-tl').textContent = decodedUrl;
                    }
                }
            }
        } catch (e) {
            if (tabs[tabId] && tabs[tabId].url) {
                updLIC(tabs[tabId].url);
            }
        }
    },500);
}

function addTL(tab) {
    tab.addEventListener('click', (e) => {
        if (e.target.closest('.tab-cl')) {
            if (document.querySelectorAll('.tab').length > 1) {
                tab.style.animation = 'slideOut 0.2s ease-out';
                setTimeout(() => {
                    const tabId = tab.dataset.tabId;
                    if (tabs[tabId] && tabs[tabId].iframe) {
                        tabs[tabId].iframe.remove();
                    }
                    delete tabs[tabId];
                    tab.remove();
                    if (tab.classList.contains('active')) {
                        const lastTab = document.querySelector('.tab:last-of-type');
                        if (lastTab) {
                            lastTab.classList.add('active');
                            swTab(lastTab.dataset.tabId);
                        }
                    }
                },200);
            }
        } else {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            swTab(tab.dataset.tabId);
        }
    });
}

document.querySelectorAll('.tab').forEach(addTL);

document.getElementById('refBtn').addEventListener('click', () => {
    const icon = document.querySelector('#refBtn svg');
    
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        const tabId = activeTab.dataset.tabId;
        if (tabs[tabId] && tabs[tabId].iframe) {
            tabs[tabId].iframe.src = tabs[tabId].iframe.src;
        }
    }
});

document.getElementById('urlInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const url= e.target.value;
        loadWebsite(url);
    }
});

function updNavBtns() {
    const activeTab = document.querySelector('.tab.active');
    const backBtn = document.getElementById('backBtn');
    const fwBtn = document.getElementById('fwBtn');
    if (activeTab) {
        const tabId = activeTab.dataset.tabId;
        if (tabs[tabId] && tabs[tabId].iframe) {
            backBtn.disabled = false;
            fwBtn.disabled = !tabs[tabId].cgf;
        } else {
            backBtn.disabled = true;
            fwBtn.disabled = true;
        }
    } else {
        backBtn.disabled = true;
        fwBtn.disabled = true;
    }
}

document.getElementById('backBtn').addEventListener('click', () => {
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        const tabId = activeTab.dataset.tabId;
        if (tabs[tabId] && tabs[tabId].iframe) {
            if (tabs[tabId].isFirst) {
                const iframe = tabs[tabId].iframe;
                tabs[tabId].iframe.remove();
                delete tabs[tabId];
                showWscreen();
            } else {
                try {
                    isNav = true;
                    tabs[tabId].iframe.contentWindow.history.back();
                    tabs[tabId].cgf = true;
                    updNavBtns();
                    setTimeout(() => {isNav=false;},600);
                } catch (e) {
                    console.log("can't go back:",e);
                    isNav = false;
                }
            }
        }
    }
});

document.getElementById('fwBtn').addEventListener('click', () => {
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        const tabId = activeTab.dataset.tabId;
        if (tabs[tabId] && tabs[tabId].iframe) {
            try {
                isNav = true;
                tabs[tabId].iframe.contentWindow.history.forward();
                setTimeout(() => {
                    isNav = false;
                },600);
            } catch (e) {
                console.log("can't go forward:", e);
                isNav = false;
                tabs[tabId].cgf = false;
                updNavBtns();
            }
        }
    }
});

// its proxin' time.
/* PLEASE NOTE REVIEWERS: I did not make tinyjet! it was made by https://github.com/soap-phia/
therefore, the backend is NOT made by me.
the github repo for tinyjet is at https://github.com/soap-phia/tinyjet/ please refer to this. */

function search(input) {
    let template = "https://www.google.com/search?q=%s";
    try {
        return new URL(input).toString();
    } catch (err) {}
    try {
        let url = new URL(`http://${input}`);
        if (url.hostname.includes(".")) return url.toString();
    } catch (err) {}
    return template.replace("%s", encodeURIComponent(input));
}

function loadWebsite(url) {
    if (!url || url.toLowerCase() === 'krypton://new-tab' || url.toLowerCase() === 'krypton new tab') {
        showWscreen();
        return;
    }
    const cArea = document.querySelector('.c-area');
    const wScreen = document.querySelector('.wscreen');
    let fixedurl = search(url);
    let src = window.scramjet.encodeUrl(fixedurl);
    console.log('full url:',fixedurl);
    console.log('proxy url:',src);
    const activeTab = document.querySelector('.tab.active');
    const tabId = activeTab.dataset.tabId;
    wScreen.style.display = 'none';
    if (tabs[tabId] && tabs[tabId].iframe) {
        tabs[tabId].iframe.src = src;
        tabs[tabId].url = fixedurl;
    } else {
        const iframe = document.createElement('iframe');
        iframe.className = 'bframe';
        iframe.src = src;
        iframe.dataset.tabId = tabId;
        cArea.appendChild(iframe);
        tabs[tabId] = {
            url: fixedurl,
            title: url,
            iframe: iframe,
            isFirst: true,
            cgf: false
        };
        document.querySelectorAll('.bframe').forEach(frame => {
            if(frame !== iframe) {
                frame.style.display = 'none';
            }
        });
    }
    document.getElementById('urlInput').value = fixedurl;
    urlDisplay.innerHTML = formatUrl(fixedurl);
    urlDisplay.style.display = 'block';
    urlInput.style.display = 'none';
    updLIC(fixedurl);
    setTimeout(() => {
        updLIC(fixedurl);
    },100);
    try {
        let urlObj = new URL(fixedurl);
        activeTab.querySelector('.tab-tl').textContent = urlObj.hostname;
    } catch (e) {
        activeTab.querySelector('.tab-tl').textContent = fixedurl;
    }
    if (urlUpdInterval) {
        clearInterval(urlUpdInterval);
    }
    startURLM(tabs[tabId].iframe, tabId);
    updNavBtns();
    updBmBtn();
}

updLIC('krypton://new-tab');

// background beautifulising particle stuff
function initParticles() { // bro this stupid function is so annoying bro this was so hard to make there was SO MUCH TRIAL AND ERROR JUST FOR THIS
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
        setTimeout(initParticles, 100);
    }
}

// init particles when ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initParticles);
} else {
    initParticles();
}