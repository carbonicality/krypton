lucide.createIcons();

let tabCount = 1;
let tabs = {};
let urlUpdInterval = null;

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
    showWscreen();
});

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
        document.getElementById('urlInput').value= tabs[tabId].url || '';
        startURLM(tabs[tabId].iframe, tabId);
    } else {
        wScreen.style.display = 'block';
        document.getElementById('urlInput').value = '';
    }
}

function showWscreen() {
    const wScreen = document.querySelector('.wscreen');
    document.querySelectorAll('.bframe').forEach(iframe => {
        iframe.style.display = 'none';
    });
    wScreen.style.display = 'block';
    document.getElementById('urlInput').value = '';
    if (urlUpdInterval) {
        clearInterval(urlUpdInterval);
    }
}

function startURLM(iframe,tabId) {
    const activeTab = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    urlUpdInterval = setInterval(() => {
        try {
            let iframeSrc = iframe.contentWindow.location.href;
            if (iframeSrc.includes('/scramjet/')) {
                let encodedUrl = iframeSrc.split('/scramjet/')[1];
                let decodedUrl = decodeURIComponent(encodedUrl);
                document.getElementById('urlInput').value = decodedUrl;
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
            // cors error most likely, expected
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
    icon.style.transform = 'rotate(360deg)';
    icon.style.transition = 'transform 0.5s';
    setTimeout(() => {
        icon.style.transform = '';
    },500);
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
            iframe: iframe
        };
        document.querySelectorAll('.bframe').forEach(frame => {
            if(frame !== iframe) {
                frame.style.display = 'none';
            }
        });
    }
    document.getElementById('urlInput').value = fixedurl;
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
}