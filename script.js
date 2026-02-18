import * as BareMux from "/baremux/index.mjs";
let connection=null;
function getConnection() {
    if (!connection) {
        connection = new BareMux.BareMuxConnection("/baremux/worker.js");
    }
    return connection;
}

let swReg = false;
let sjInit = false;
let isLoading = false;

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
let history = JSON.parse(localStorage.getItem('krypton_history') || '[]');

async function registerSW() {
    if (!navigator.serviceWorker) {
        throw new Error("browser doesnt support sw");
    }
    const proxyType =getProxyType();
    if (proxyType === 'uv') {
        await navigator.serviceWorker.register('/uv/sw.js');
    }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/cache-sw.js')
    .then(reg => console.log('krypton sw registered',reg))
    .catch(err => console.error('sw failed',err));
}

async function initProxy() {
    const pType = getProxyType();
    if (pType==='uv') {
        if (!swReg) {
            try {
                await registerSW();
                swReg=true;
                console.log('sw registered');
            } catch (err) {
                console.error('sw reg failed',err);
                throw err;
            }
        }
        let wispUrl = localStorage.getItem('krypton_wispUrl') || "wss://wisp.mercurywork.shop";
        const conn = getConnection();
        if ((await connection.getTransport()!=="/epoxy/index.mjs")) {
            await connection.setTransport("/epoxy/index.mjs",[{wisp:wispUrl}]);
            console.log('epoxy set!');
        }
    } else if (pType==='scramjet') {
        sjInit=true;
        console.log('sj init');
    }
}

function ensureScramInit() {
    return new Promise((resolve)=>{
        let initFrame=document.getElementById('scramjet-init');
        if (!initFrame){
            initFrame=document.createElement('iframe');
            initFrame.id='scramjet-init';
            initFrame.src='https://api.carbon06.qzz.io/';
            initFrame.style.display='none';
            document.body.appendChild(initFrame);
        }
        if (sjInit) {
            resolve();
            return;
        }
        const checkInit=()=>{
            setTimeout(()=>{
                sjInit=true;
                console.log('sj init, hidden iframe');
                resolve();
            },2000);
        };
        initFrame.addEventListener('load',checkInit,{once:true});
    });
}

function ATHistory(url,title) {
    if (!url || url === 'krypton://new-tab' || url.startsWith('./') || url.startsWith('krypton://')) {
        return;
    }
    const histEntry = {
        url: url,
        title: title,
        timestamp: Date.now()
    };
    history = history.filter(entry => entry.url !== url);
    history.unshift(histEntry);
    if (history.length > 1000) {
        history = history.slice(0,1000);
    }
    localStorage.setItem('krypton_history', JSON.stringify(history));
}

function clearHist() {
    history = [];
    localStorage.setItem('krypton_history', JSON.stringify(history));
}

function getHistTR(range) {
    const now = Date.now();
    const odMs = 24 * 60 * 60 * 1000;
    switch(range) {
        case 'today':
            const sToday = new Date().setHours(0,0,0,0);
            return history.filter(entry => entry.timestamp >= sToday);
        case 'yesterday':
            const sYest = new Date().setHours(0,0,0,0) - odMs;
            const sToday2 = new Date().setHours(0,0,0,0);
            return history.filter(entry => entry.timestamp >= sYest && entry.timestamp < sToday2);
        case 'week':
            return history.filter(entry => entry.timestamp >= now - (7 * odMs));
        case 'older':
            return history.filter(entry => entry.timestamp < now - (7 * odMs));
        default:
            return history;
    }
}

function setupIntercept(iframe,tabId) {
    iframe.addEventListener('load',()=>{
        try {
            const iframeDoc = iframe.contentWindow.document;
            iframeDoc.addEventListener('click',(e)=>{
                const link = e.target.closest('a');
                if (link && (link.target==='_blank' || e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    e.stopPropagation();
                    let href = link.href;
                    newTabUrl(href);
                }
            },true);
        } catch (err) {
            console.log('cannot intercept iframe clicks (cors?):',err);
        }
    });
}

function newTabUrl(url) {
    tabCount++;
    const tabBar = document.getElementById('tabBar');
    const ntBtn = document.getElementById('ntBtn');
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    const newTab = document.createElement('div');
    newTab.className='tab active';
    newTab.dataset.tabId = tabCount;
    newTab.innerHTML = `
    <div class="tab-fav">
        <i data-lucide="globe"></i>
    </div>
    <span class="tab-tl">Loading...</span>
    <div class="tab-cl">
        <i data-lucide="x"></i>
    </div>`;
    tabBar.insertBefore(newTab,ntBtn);
    lucide.createIcons();
    addTL(newTab);
    tabs[tabCount] = {
        url:url,
        title:'Loading...',
        iframe:null,
        isFirst:true,
        cgf:false,
    };
    loadWebsite(url);
}

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
    if (url.startsWith('krypton://')) {
        const path = url.replace('krypton://', '');
        return `<span class="url-proto">krypton://</span><span class="url-domain">${path}</span>`;
    }
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
            urlIcon.innerHTML = '<i data-lucide="grip"></i>';
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
    const proxyType=getProxyType();
    if (proxyType==='scramjet') {
        if (urlUpdInterval) {
            clearInterval(urlUpdInterval);
        }
        return;
    }
    const activeTab = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    let lastUrl = tabs[tabId]?.url;
    let urlChangeCount = 0;
    urlUpdInterval=setInterval(()=>{
        try {
            let iframeSrc = iframe.contentWindow.location.href;
            const proxyType=getProxyType();
            let decodedUrl=null;
            if (proxyType==='scramjet'&&iframeSrc.includes('/scram/')) {
                let parts = iframeSrc.split('/scram/')
                if (parts[1]) {
                    decodedUrl=decodeURIComponent(parts[1]);
                }
            } else if (proxyType==='uv'&&iframeSrc.includes(__uv$config.prefix)) {
                let encodedUrl = iframeSrc.split(__uv$config.prefix)[1];
                decodedUrl=__uv$config.decodeUrl(encodedUrl);
            }
            if (decodedUrl) {
                if (tabs[tabId] && tabs[tabId].url !== decodedUrl) {
                    updBmBtn();
                    tabs[tabId].isFirst = false;
                    if (lastUrl !== decodedUrl && !isNav) {
                        tabs[tabId].cgf = false;
                        updNavBtns();
                    }
                    updTabFavicon(iframe,tabId);
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
                updTitle(iframe,tabId);
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
                    const wasActive = tab.classList.contains('active');
                    const prevTab = tab.previousElementSibling;
                    const nextTab = tab.nextElementSibling;
                    if (tabs[tabId] && tabs[tabId].iframe) {
                        tabs[tabId].iframe.remove();
                    }
                    delete tabs[tabId];
                    tab.remove();
                    if (wasActive) {
                        if (prevTab && prevTab.classList.contains('tab')) {
                            prevTab.classList.add('active');
                            swTab(prevTab.dataset.tabId);
                        }
                        else if (nextTab && nextTab.classList.contains('tab')) {
                            nextTab.classList.add('active');
                            swTab(nextTab.dataset.tabId);
                        }
                        else {
                            const anyTab = document.querySelector('.tab');
                            if (anyTab) {
                                anyTab.classList.add('active');
                                swTab(anyTab.dataset.tabId);
                            }
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

function updTitle(iframe,tabId) {
    try {
        const iframeDoc = iframe.contentWindow.document;
        const pageTitle=iframeDoc.title;
        const tab=document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (tab&&pageTitle) {
            tab.querySelector('.tab-tl').textContent=pageTitle;
            tabs[tabId].title=pageTitle;
        }
    } catch (err) {
        console.log('couldnt get title (cors?)',err);
    }
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

function updTabFavicon(iframe,tabId) {
    try {
        const iframeDoc = iframe.contentWindow.document;
        let faviconUrl = null;
        const iconLink=iframeDoc.querySelector('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]');
        if (iconLink && iconLink.href) {
            faviconUrl=iconLink.href;
        }
        if (!faviconUrl) {
            try {
                const url = new URL(iframe.contentWindow.location.href);
                const proxyType=getProxyType();
                let decodedUrl = null;
                if (proxyType==='scramjet' && url.href.includes('/scram/')) {
                    const parts = url.href.split('/scram/');
                    if (parts[1]) {
                        decodedUrl = decodeURIComponent(parts[1]);
                    }
                } else if (proxyType==='uv'&&url.pathname.includes(__uv$config.prefix)) {
                    let encodedUrl = url.pathname.split(__uv$config.prefix)[1];
                    decodedUrl=__uv$config.decodeUrl(encodedUrl);
                }
                if (decodedUrl) {
                    let realUrl=new URL(decodedUrl);
                    faviconUrl=`${realUrl.origin}/favicon.ico`;
                }
            } catch (e) {
                console.log('couldnt get favicon',e);
            }
        }
        if (faviconUrl) {
            const tab = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
            if (tab) {
                const favCont = tab.querySelector('.tab-fav');
                const favImg = document.createElement('img');
                favImg.src = faviconUrl;
                favImg.style.width='16px';
                favImg.style.height='16px';
                favImg.style.objectFit='contain';
                favImg.onload = ()=>{
                    favCont.innerHTML='';
                    favCont.appendChild(favImg);
                };
                favImg.onerror = ()=>{
                    favCont.innerHTML='<i data-lucide="globe"></i>';
                    lucide.createIcons();
                };
            }
        }
    } catch (err) {
        console.log('cant access iframe to get fav',err);
    }
}

// its proxin' time.

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

function getProxyType() {
    return localStorage.getItem('krypton_proxyType') || 'scramjet';
}

async function loadWebsite(url) {
    if (isLoading) {
        console.log('ignoring duplicate (issuetracker reference??)');
        return;
    }
    if (!url || url.toLowerCase() === 'krypton://new-tab' || url.toLowerCase()==='krypton new tab') {
        showWscreen();
        return;
    }
    if (url.toLowerCase()==='krypton://bookmarks') {
        loadWebsiteInternal('./bookmarks.html','Bookmarks');
        return;
    }
    if (url.toLowerCase()=='krypton://history') {
        loadWebsiteInternal('./history.html','History');
        return;
    }
    if (url.toLowerCase()=='krypton://settings') {
        loadWebsiteInternal('./settings.html','Settings');
        return;
    }
    if (url.toLowerCase()=='krypton://games') {
        loadWebsiteInternal('./games.html','Games');
        return;
    }
    isLoading=true;
    const activeTab=document.querySelector('.tab.active');
    const tabId = activeTab.dataset.tabId;
    const cArea = document.querySelector('.c-area');
    const wScreen = document.querySelector('.wscreen');
    let fixedurl = search(url);
    const loadOvr = document.getElementById('loadOvr');
    const progBar = document.getElementById('progBar');
    const progBarCont = document.getElementById('progBarCont');
    loadOvr.classList.add('show');
    progBarCont.classList.add('show');
    progBar.style.width = '30%';
    try{
        await initProxy();
    } catch (err) {
        console.error('proxy init failed :(',err);
        alert('failed to init proxy');
        return;
    }
    let src;
    const proxyType=getProxyType();
    if (proxyType === 'scramjet') {
        await initProxy();
        src = `https://api.carbon06.qzz.io/embed.html`;
        console.log('sj init, loading embed!');
    } else {
        await initProxy();
        src=__uv$config.prefix+__uv$config.encodeUrl(fixedurl);
    }
    console.log('fullurl:',fixedurl);
    console.log('proxy url',src);
    console.log('proxy type',proxyType);
    wScreen.style.display = 'none';
    if (tabs[tabId] && tabs[tabId].iframe) {
        tabs[tabId].iframe.src = src;
        tabs[tabId].url = fixedurl;
        if (proxyType==='scramjet') {
            tabs[tabId].iframe.dataset.pendingUrl = fixedurl;
        }
        monitorLoad(tabs[tabId].iframe,tabId);
    } else {
        const iframe = document.createElement('iframe');
        iframe.className = 'bframe';
        iframe.src = src;
        iframe.dataset.tabId = tabId;
        cArea.appendChild(iframe);
        setupIntercept(iframe,tabId);
        if (proxyType==='scramjet') {
            iframe.dataset.pendingUrl=fixedurl;
        }
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
        monitorLoad(iframe,tabId);
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
    try {
        let urlObj = new URL(fixedurl);
        ATHistory(fixedurl, urlObj.hostname);
    } catch (e) {
        ATHistory(fixedurl, fixedurl);
    }
    if (urlUpdInterval) {
        clearInterval(urlUpdInterval);
    }
    startURLM(tabs[tabId].iframe, tabId);
    updNavBtns();
    updBmBtn();
}

updLIC('krypton://new-tab');

function monitorLoad(iframe,tabId) {
    const loadOvr = document.getElementById('loadOvr');
    const progBar = document.getElementById('progBar');
    const progBarCont = document.getElementById('progBarCont');
    if (!loadOvr.classList.contains('show')) {
        loadOvr.classList.add('show');
        progBarCont.classList.add('show');
        progBar.style.width='10%';
    } else {
        progBar.style.width='40%';
    }
    loadOvr.classList.add('show');
    progBarCont.classList.add('show');
    progBar.style.width='10%';
    let startTime = Date.now();
    let progVal = 30;
    let loadComplete = false;
    const progInterval = setInterval(()=>{
        if (loadComplete) {
            clearInterval(progInterval);
            return;
        }
        if (progVal <90) {
            progVal += (90-progVal)*0.1;
            progBar.style.width=`${progVal}%`;
        }
    },200);
    const iframeReady = setInterval(()=>{
        try {
            const iframeDoc = iframe.contentWindow.document;
            if (iframeDoc.readyState==='complete') {
                const hasContent= iframeDoc.body && (iframeDoc.body.children.length > 0 || iframeDoc.body.textContent.trim().length>0);
                if (hasContent) {
                    completeLoad();
                }
            }
        } catch (e) {
            console.log('loaded cors, we shouldnt get this though');
        }
    },200);
    //max time to load, 8s
    const maxTimeout = setTimeout(()=>{
        completeLoad();
    },8000);
    //detect net idle
    let lastActivity = Date.now();
    const actCheck = setInterval(()=>{
        const tsAct = Date.now() - lastActivity;
        if (tsAct>1000 && Date.now()-startTime>1500) {
            completeLoad();
        }
    },500);
    function completeLoad() {
        if (loadComplete) return;
        loadComplete = true;
        isLoading=false;
        clearInterval(progInterval);
        clearInterval(iframeReady);
        clearInterval(actCheck);
        clearTimeout(maxTimeout);
        progBar.style.width='100%';
        setTimeout(()=>{
            loadOvr.classList.remove('show');
            setTimeout(()=>{
                progBarCont.classList.remove('show');
                progBar.style.width = '0%';
            },300);
        },200);
    }
}

function partCount() {
    const preset = localStorage.getItem('krypton_particlePreset') || 'maximum';
    return {off:0,minimal:40,medium:60,maximum:120}[preset]??120;
}

// background beautifulising particle stuff
function initParticles() { // bro this stupid function is so annoying bro this was so hard to make there was SO MUCH TRIAL AND ERROR JUST FOR THIS
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
        setTimeout(initParticles, 100);
    }
}

// init particles when ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initParticles);
} else {
    initParticles();
}

// search box functionality
const searchInput = document.querySelector('.search-input');
if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) {
                loadWebsite(query);
            }
        }
    });
}

// menu dropdown stuff
const menuBtn = document.getElementById('menuBtn');
const drMenu = document.getElementById('drMenu');

menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    drMenu.classList.toggle('show');
    lucide.createIcons();
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wpr')) {
        drMenu.classList.remove('show');
    }
});

document.getElementById('historyItem').addEventListener('click', () => {
    drMenu.classList.remove('show');
    loadWebsiteInternal('./history.html', 'History');
});

document.getElementById('bmItem').addEventListener('click', () => {
    drMenu.classList.remove('show');
    loadWebsiteInternal('./bookmarks.html', 'Bookmarks');
});

// about overlay stuff
document.getElementById('aboutItem').addEventListener('click', () => {
    drMenu.classList.remove('show');
    const overlay = document.getElementById('aboutOverlay');
    overlay.style.display = 'flex';
    overlay.offsetHeight;
    overlay.classList.add('show');
    lucide.createIcons();
});

document.getElementById('closeAbout').addEventListener('click', () => {
    const overlay = document.getElementById('aboutOverlay');
    overlay.classList.remove('show');
    // this setTimeout fixes the anim not working, this took me a while to figure out lmao
    setTimeout(() => {
        overlay.style.display = 'none';
    },150);
});

document.getElementById('aboutOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'aboutOverlay') {
        const overlay = document.getElementById('aboutOverlay');
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.style.display = 'none';
        },150);
    }
});

// the great github commit pulling thingymajig
async function fetchGHCommit() {
    const commitEl = document.getElementById('ghCommit');
    try {
        const response = await fetch('https://api.github.com/repos/carbonicality/krypton/commits/main');
        const data = await response.json();
        if (data.sha) {
            const shortSha = data.sha.substring(0,7);
            const commitMsg = data.commit.message.split('\n')[0];
            const commitDate = new Date(data.commit.author.date).toLocaleDateString();
            commitEl.textContent = `${shortSha} - ${commitDate}`;
            commitEl.title = commitMsg;
        } else {
            commitEl.textContent = 'unable to fetch!'
        }
    } catch (error) {
        console.error('failed to fetch gh commit: ', error);
        commitEl.textContent = 'failed to fetch';
    }
}

document.getElementById('aboutItem').addEventListener('click', () => {
    drMenu.classList.remove('show');
    const overlay = document.getElementById('aboutOverlay');
    overlay.style.display = 'flex';
    overlay.offsetHeight;
    overlay.classList.add('show');
    lucide.createIcons();
    fetchGHCommit();
});

// for internal pages, i.e history.html
function loadWebsiteInternal(url,title) {
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) return;
    const tabId = activeTab.dataset.tabId;
    const cArea = document.querySelector('.c-area');
    const wScreen = document.querySelector('.wscreen');
    wScreen.style.display = 'none';
    let kryptonUrl = url;
    if (url === './history.html') {
        kryptonUrl = 'krypton://history';
    } else if (url === './bookmarks.html') {
        kryptonUrl = 'krypton://bookmarks';
    } else if (url === './games.html') {
        kryptonUrl = 'krypton://games'
    } else if (url === './settings.html') {
        kryptonUrl = 'krypton://settings'
    }
    if (tabs[tabId] && tabs[tabId].iframe) {
        tabs[tabId].iframe.src = url;
        tabs[tabId].url = kryptonUrl;
    } else {
        const iframe = document.createElement('iframe');
        iframe.className = 'bframe';
        iframe.src = url;
        iframe.dataset.tabId = tabId;
        cArea.appendChild(iframe);
        tabs[tabId] = {
            url: kryptonUrl,
            title: title,
            iframe: iframe,
            isFirst: true,
            cgf: false
        };
        document.querySelectorAll('.bframe').forEach(frame => {
            if (frame !== iframe) {
                frame.style.display = 'none';
            }
        });
    }
    activeTab.querySelector('.tab-tl').textContent = title;
    document.getElementById('urlInput').value = kryptonUrl;
    urlDisplay.innerHTML = formatUrl(kryptonUrl);
    urlDisplay.style.display = 'block';
    urlInput.style.display = 'none';
    updLIC(kryptonUrl);
    updNavBtns();
    updBmBtn();
}

window.addEventListener('message', (event) => {
    if (event.data.type === 'clearHistory') {
        localStorage.setItem('krypton_history', JSON.stringify([]));
        return;
    }
    if (event.origin==='https://api.carbon06.qzz.io' && event.data.type==='scramjet-ready') {
        console.log('received scramjet-ready');
        document.querySelectorAll('.bframe').forEach(iframe => {
            if (iframe.src.includes('embed.html') && iframe.dataset.pendingUrl){
                const url = iframe.dataset.pendingUrl;
                iframe.contentWindow.postMessage({
                    type:'navigate',
                    url: url,
                },'https://api.carbon06.qzz.io');
                console.log('sent nav AFTER READY',url);
                delete iframe.dataset.pendingUrl;
            }
        });
    }
    if (event.origin==='https://api.carbon06.qzz.io' && event.data.type==='open-new-tab') {
        const url=event.data.url;
        let decodedUrl = url;
        if (url.includes('/scramjet/')) {
            const parts = url.split('/scramjet/');
            if (parts[1]) {
                decodedUrl = decodeURIComponent(parts[1]);
            }
        }
        newTabUrl(decodedUrl);
    }
    if (event.origin==='https://api.carbon06.qzz.io' && event.data.type==='scramjet-url-update') {
        console.log('URL upd event',event.data.url);
        const sjUrl = event.data.url;
        const pageTitle=event.data.title;
        let decodedUrl=sjUrl;
        try {
            const m = sjUrl.match(/\/scram\/(.+)/);
            if (m) {
                decodedUrl = decodeURIComponent(m[1]).split('&zx=')[0].split('&no_sw_cr=')[0];
            }
        } catch (_) {}
        if (decodedUrl.includes('api.carbon06.qzz.io/embed.html')) return;
        const activeTab = document.querySelector('.tab.active');
        if (activeTab) {
            const tabId=activeTab.dataset.tabId;
            if (decodedUrl === tabs[tabId]?.url) return;
            if (tabs[tabId] && tabs[tabId].iframe && tabs[tabId].iframe.src.includes('embed.html')) {
                //if (tabs[tabId].url!==decodedUrl) {
                tabs[tabId].url = decodedUrl;
                tabs[tabId].isFirst = false;
                    tabs[tabId].url = decodedUrl;
                    tabs[tabId].isFirst = false;
                    if (document.activeElement !== urlInput) {
                        document.getElementById('urlInput').value=decodedUrl;
                        if (document.getElementById('urlInput').style.display==='none') {
                            urlDisplay.innerHTML = formatUrl(decodedUrl);
                        }
                    }
                    updLIC(decodedUrl);
                    updBmBtn();
                    updNavBtns();
                    const tab = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
                    if (tab&&pageTitle) {
                        tab.querySelector('.tab-tl').textContent=pageTitle;
                        tabs[tabId].title = pageTitle;
                    }
                    try {
                        let urlObj= new URL(decodedUrl);
                        const faviconUrl = `${urlObj.origin}/favicon.ico`;
                        const tab = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
                        if (tab) {
                            const favCont = tab.querySelector('.tab-fav');
                            const favImg= document.createElement('img');
                            favImg.src=faviconUrl;
                            favImg.style.width = '16px';
                            favImg.style.height='16px';
                            favImg.style.objectFit='contain';
                            favImg.onload=()=>{
                                favCont.innerHTML = '';
                                favCont.appendChild(favImg);
                            };
                            favImg.onerror = ()=>{
                                favCont.innerHTML='<i data-lucide="globe"></i>';
                                lucide.createIcons();
                            };
                        }
                    } catch (e) {}
                //}
            }
        }
    }
});

document.getElementById('cloakItem').addEventListener('click',()=>{
    drMenu.classList.remove('show');
    cloakSite();
});

function cloakSite() {
    const win = window.open('about:blank','_blank');
    const iframe = win.document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;';
    iframe.src=window.location.href;
    win.document.body.appendChild(iframe);
    win.document.body.style.margin='0';
    win.document.body.style.overflow='hidden';
    window.close();
}

// shortcuts stuff
document.querySelectorAll('.shortcut').forEach(shortcut => {
    shortcut.addEventListener('click', () => {
        const title = shortcut.querySelector('.s-title').textContent.toLowerCase();
        if (title === 'bookmarks') {
            loadWebsiteInternal('./bookmarks.html', 'Bookmarks');
        } else if (title === 'games') {
            loadWebsiteInternal('./games.html', 'Games');
        } else if (title === 'apps') {
            //same here
            alert("not implemented yet (check out bookmarks though) :(");
        } else if (title === 'settings') {
            loadWebsiteInternal('./settings.html','Settings');
        }
    });
});