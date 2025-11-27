lucide.createIcons();

let tabCount = 1;
let tabs = {};

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
});

function addTL(tab) {
    tab.addEventListener('click', (e) => {
        if (e.target.closest('.tab-cl')) {
            if (document.querySelectorAll('.tab').length > 1) {
                tab.style.animation = 'slideOut 0.2s ease-out';
                setTimeout(() => {
                    tab.remove();
                    if (tab.classList.contains('active')) {
                        const lastTab = document.querySelector('.tab:last-of-type');
                        if (lastTab) lastTab.classList.add('active');
                    }
                },200);
            }
        } else {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        }
    });
}

document.querySelectorAll('.tab').forEach(addTL);

document.getElementById('refBtn').addEventListener('click', () => {
    const icon = document.querySelector('#refBtn svg');
    icon.style.transform = 'rotate(360deg)';
    icon.style.transition = 'transform 0.5s';
    setTimeout(() => {
        icon.style.transform = '';
    },500);
});

document.getElementById('urlInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const url = e.target.value;
        const activeTab = document.querySelector('.tab.active .tab-tl');
        if (activeTab){
            activeTab.textContent = url || 'New Tab';
            loadWebsite(url);
        }
    }
});

let bookmarked = false;
document.getElementById('bmBtn').addEventListener('click', () => {
    const btn = document.getElementById('bmBtn');
    bookmarked = !bookmarked;
    if (bookmarked) {
        btn.innerHTML = '<i data-lucide="star"></i>';
        lucide.createIcons();
        const svg = btn.querySelector('svg');
        svg.style.fill = '#60a5fa';
        svg.style.color = '#60a5fa';
    } else {
        btn.innerHTML = '<i data-lucide="star"></i>';
        lucide.createIcons();
    }
});

// its proxin' time.
/* PLEASE NOTE REVIEWERS: I did not make tinyjet! it was made by https://github.com/soap-phia/
therefore, the backend is NOT made by me.
the github repo for tinyjet is at https://github.com/soap-phia/tinyjet/ please refer to this. */

function loadWebsite(url) {
    if (!window.proxyReady || !window.scramjet) {
        console.error('proxy not ready yet');
        setTimeout(() => loadWebsite(url), 1000);
        return;
    }
    const cArea = document.querySelector('.c-area');
    const wScreen = document.querySelector('.wscreen');
    let fullUrl = url;
    if (!url.includes('.') && !url.startsWith('http')) {
        fullUrl = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
        fullUrl = 'https://' + url;
    }
    const proxyUrl = window.scramjet.encodeUrl(fullUrl);
    console.log('full url: ', fullUrl);
    console.log('proxy url: ', proxyUrl);
    const activeTab = document.querySelector('.tab.active');
    const tabId = activeTab.dataset.tabId;
    tabs[tabId] = {url:fullUrl,title:url};
    activeTab.querySelector('.tab-tl').textContent = url;
    if (wScreen) {
        wScreen.style.display = 'none';
    }
    const exIframe = cArea.querySelector('iframe');
    if (exIframe) {
        exIframe.remove();
    }
    const iframe = document.createElement('iframe');
    iframe.className = 'bframe';
    iframe.src = proxyUrl;
    cArea.appendChild(iframe);
}