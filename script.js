import * as BareMux from "/sail/baremux/index.mjs";
import amethyst from './amethyst.js';

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

//MAKE SURE YOU CHANGE THESE. ANNOUNCEMENT VARS
//DEAR VET PLEASE QUOTE THE STRINGS
// haha no i wont
let anncId = 7;
let anncMsg = "Hey, we had to add popunder ads. I'm really sorry about this but we need funding to keep krypton running, and we hate ads just as much as you do. You can turn off ads in settings > privacy.";
let anncTitle = "Advertisement notice";

//notification stuff
const notifCont = document.createElement('div');
notifCont.className = 'notif-cont';
document.body.appendChild(notifCont);

function showNotif(title,body,duration=4000) {
    const notif=document.createElement('div');
    notif.className='notif';
    notif.innerHTML=`
    <div class="notif-tl">${title}</div>
    <div class="notif-body">${body}</div>
    <div class="notif-btrack">
        <div class="notif-bar" style="width:100%;transition-duration:${duration}ms;"></div>
    </div>`;
    notifCont.appendChild(notif);
    requestAnimationFrame(()=>{
        requestAnimationFrame(()=>{
            notif.querySelector('.notif-bar').style.width='0%';
        });
    });
    const dismiss = ()=>{
        notif.classList.add('hiding');
        setTimeout(()=>notif.remove(),300);
    };
    const timer = setTimeout(dismiss,duration);
    notif.addEventListener('click',()=>{
        clearTimeout(timer);
        dismiss();
    });
}

const { ScramjetController }=$scramjetLoadController();
const scramjet=new ScramjetController({
    files: {
        all:"/sail/scram/scramjet.all.js",
        wasm:"/sail/scram/scramjet.wasm.wasm",
        sync:"/sail/scram/scramjet.sync.js"
    },
    prefix:"/sail/go/"
});
scramjet.init();

let wasm_ready=null;
async function preloadWasm() {
    if (wasm_ready) return wasm_ready;
    wasm_ready=(async ()=>{
        try {
            const libcurl=await import('/sail/libcurl/index.mjs');
            if (typeof libcurl.load_wasm==='function') {
                await libcurl.load_wasm('/sail/scram/scramjet.wasm.wasm');
            } else if (typeof libcurl.default?.load_wasm==='function') {
                await libcurl.default.load_wasm('/sail/scram/scramjet.wasm.wasm');
            }
            sjInit=true;
            showNotif('Initialised','Scramjet initialised successfully!');
        } catch (e) {
            console.warn('wasm preload failed',e);
            throw e;
        }
    })();
    return wasm_ready;
}
preloadWasm();

let tabCount = 1;
let tabs = {};
let urlUpdInterval = null;
const urlContainer = document.querySelector('.url-intainer');
const urlInput = document.getElementById('urlInput');
const urlDisplay = document.createElement('div');
urlDisplay.className = 'url-display';
urlContainer.insertBefore(urlDisplay,urlInput.nextSibling);
let isNav = false;
let isInt = false;
let searchEng = 'https://duckduckgo.com/?q=%s';

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

document.addEventListener('click',()=>{
    isInt = true;
},{once:true});

window.addEventListener('beforeunload',(e)=>{
    if(isInt) {
        e.preventDefault();
        e.returnValue='';
    }
});

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
        let wispUrl = localStorage.getItem('krypton_wispUrl') || "wss://wisp.classroom.lat/";
        console.log("wisp url:", wispUrl);
        const conn = getConnection();
        if ((await connection.getTransport()!=="/epoxy/index.mjs")) {
            await connection.setTransport("/epoxy/index.mjs",[{wisp:wispUrl}]);
            console.log('epoxy set!');
        }
    } else if (pType==='scramjet') {
        if (!swReg) {
            await navigator.serviceWorker.register('/sail/sw.js');
            swReg=true;
        }
        await preloadWasm();
        const conn = getConnection();
        await conn.setTransport('/sail/libcurl/index.mjs',[{
            websocket: localStorage.getItem('krypton_wispUrl')||'wss://wisp.classroom.lat/',
            wasm:'/sail/scram/scramjet.wasm.wasm'
        }]);
    }
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
    if (urlUpdInterval) clearInterval(urlUpdInterval);
    urlUpdInterval = setInterval(()=>{
        try {
            const iframeSrc = iframe.contentWindow.location.href;
            const proxyType = getProxyType();
            let decodedUrl = null;
            if (proxyType==='scramjet'&&iframeSrc.includes('/sail/go')) {
                decodedUrl = scramjet.decodeUrl(iframeSrc);
            } else if (proxyType==='uv'&&iframeSrc.includes(__uv$config.prefix)) {
                const encodedUrl = iframeSrc.split(__uv$config.prefix)[1];
                decodedUrl=__uv$config.decodedUrl(encodedUrl);
            }
            if (decodedUrl) {
                if (tabs[tabId]&&tabs[tabId].url!==decodedUrl) {
                    updBmBtn();
                    tabs[tabId].isFirst=false;
                    if (!isNav) {
                        tabs[tabId].cgf = false;
                        updNavBtns();
                    }
                    updTabFavicon(iframe, tabId);
                    ATHistory(decodedUrl, decodedUrl);
                }
                tabs[tabId].url=decodedUrl;
                if (document.activeElement!==urlInput) {
                    document.getElementById('urlInput').value=decodedUrl;
                    if (urlInput.style.display==='none') {
                        urlDisplay.innerHTML = formatUrl(decodedUrl);
                    }
                }
                updLIC(decodedUrl);
                updTitle(iframe, tabId);
            }
        } catch (e) {
            if (tabs[tabId]?.url) updLIC(tabs[tabId].url);
        }
    },500);
}

function addTL(tab) {
    tab.addEventListener('click', (e) => {
        if (e.target.closest('.tab-cl')) {
            if (document.querySelectorAll('.tab').length > 1) {
                const tabId = tab.dataset.tabId;
                const wasActive = tab.classList.contains('active');
                const allTabs = [...document.querySelectorAll('.tab')];
                allTabs.forEach(t => {
                    t.style.width=t.getBoundingClientRect().width+'px';
                    t.style.minWidth ='unset';
                    t.style.maxWidth='unset';
                    t.style.transition='width 0.2s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease';
                });
                tab.style.width='0px';
                tab.style.opacity='0';
                tab.style.overflow='hidden';
                tab.style.padding='0';
                setTimeout(() => {
                    const prevTab = tab.previousElementSibling;
                    const nextTab = tab.nextElementSibling;
                    if (tabs[tabId].iframe) {
                        tabs[tabId].iframe.remove();
                    }
                    delete tabs[tabId];
                    tab.remove();
                    document.querySelectorAll('.tab').forEach(t => {
                        t.style.width='';
                        t.style.minWidth='';
                        t.style.maxWidth='';
                        t.style.transition='';
                    });
                    if (wasActive) {
                        const target = (nextTab?.classList.contains('tab') && nextTab) || (prevTab?.classList.contains('tab')&&prevTab) || document.querySelector('.tab');
                        if (target) {
                            target.classList.add('active');
                            swTab(target.dataset.tabId);
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

tabs[1] = {
    url:'krypton://new-tab',
    title: 'New Tab',
    iframe: null,
    isFirst: true,
    cgf: false
};
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

function search(input, template=searchEng) {
    try {
        return new URL(input).toString();
    } catch (err) {}
    try {
        let url = new URL(`http://${input}`);
        if (url.hostname.includes('.')) return url.toString();
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
    if (url.toLowerCase()=='krypton://apps') {
        loadWebsiteInternal('./apps.html','Apps');
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
        src=scramjet.encodeUrl(fixedurl);
    } else {
        src=__uv$config.prefix+__uv$config.encodeUrl(fixedurl);
    }
    console.log('fullurl:',fixedurl);
    console.log('proxy url',src);
    console.log('proxy type',proxyType);
    wScreen.style.display = 'none';
    if (tabs[tabId] && tabs[tabId].iframe) {
        tabs[tabId].iframe.src = src;
        tabs[tabId].url = fixedurl;
        monitorLoad(tabs[tabId].iframe,tabId);
        tabs[tabId].iframe.addEventListener('load',()=>{
            amethyst.injectContentScripts(tabs[tabId].iframe,tabId,fixedurl);
            amethyst.injectContextMenu(tabs[tabId].iframe,tabId,fixedurl);
        },{once:true});
    } else {
        const iframe = document.createElement('iframe');
        iframe.className = 'bframe';
        iframe.src = src;
        iframe.dataset.tabId = tabId;
        cArea.appendChild(iframe);
        setupIntercept(iframe,tabId);
        iframe.addEventListener('load',()=>{
            let currentUrl=tabs[tabId]?.url;
            try {
                const iframeSrc=iframe.contentWindow.location.href;
                const proxyType=getProxyType();
                if (proxyType==='scramjet'&&iframeSrc.includes('/sail/go')) {
                    currentUrl=scramjet.decodeUrl(iframeSrc);
                } else if (proxyType==='uv'&&iframeSrc.includes(__uv$config.prefix)) {
                    currentUrl=__uv$config.decodeUrl(iframeSrc.split(__uv$config.prefix)[1]);
                }
            } catch (e) {}
            if (currentUrl&&!currentUrl.startsWith('krypton://')) {
                amethyst.injectContentScripts(iframe,tabId,currentUrl);
                amethyst.injectContextMenu(iframe,tabId,currentUrl);
            }
        });
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

await amethyst.init({
    tabs,
    loadWebsite,
    showNotif,
    getActiveTabId:()=>document.querySelector('.tab.active')?.dataset.tabId,
});

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

document.getElementById('settingsItem').addEventListener('click',()=>{
    drMenu.classList.remove('show');
    loadWebsiteInternal('./settings.html','Settings');
});

document.getElementById('discordItem').addEventListener('click',()=>{
    window.location.href='https://discord.gg/ZM6mR678wQ';
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

document.getElementById('devtoolsItem').addEventListener('click',()=>{
    drMenu.classList.remove('show');
    if (!window.eruda) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/eruda';
        script.onload=()=>{
            eruda.init();
            eruda._entryBtn.hide();
            eruda.show();
        }
        document.head.appendChild(script);
    } else {
        const isVis = document.querySelector('#eruda').style.display!=='none';
        isVis?eruda.hide():eruda.show();
    }
});

function initOnboarding() {
    if (localStorage.getItem('krypton_onboarded')) return;
    const overlay = document.getElementById('onboardOvr');
    const steps=overlay.querySelectorAll('.ob-step');
    const dotsEl=document.getElementById('obDots');
    const nextBtn =document.getElementById('obNext');
    const skipBtn = document.getElementById('obSkip');
    let current = 0;
    steps.forEach((_,i)=>{
        const dot = document.createElement('div');
        dot.className = 'ob-dot'+(i===0?' active':'');
        dotsEl.appendChild(dot);
    });
    function goTo(idx){
        steps[current].classList.remove('active');
        dotsEl.children[current].classList.remove('active');
        current = idx;
        steps[current].classList.add('active');
        dotsEl.children[current].classList.add('active');
        nextBtn.textContent = current === steps.length-1?"let's go!":'next';
        lucide.createIcons();
    }
    function finish() {
        overlay.classList.remove('show');
        setTimeout(()=>overlay.style.display='none',400);
        localStorage.setItem('krypton_onboarded','true');
    }
    nextBtn.addEventListener('click',()=>{
        if (current < steps.length-1) goTo(current+1);
        else finish();
    });
    skipBtn.addEventListener('click',finish);
    overlay.style.display='flex';
    requestAnimationFrame(()=>overlay.classList.add('show'));
    lucide.createIcons();
}
initOnboarding();

function showAnnc(title,msg,id) {
    if (localStorage.getItem(`krypton_annc_${id}`)) return;
    const ovr = document.getElementById('anncOvr');
    document.getElementById('anncTitle').textContent=title;
    document.getElementById('anncMsg').textContent=msg;
    ovr.style.display = 'flex';
    requestAnimationFrame(()=>ovr.classList.add('show'));
    lucide.createIcons();
    document.getElementById('anncOk').onclick=()=>{
        ovr.classList.remove('show');
        setTimeout(()=>ovr.style.display='none',400);
        localStorage.setItem(`krypton_annc_${id}`,'true');
    };
}
showAnnc(anncTitle,anncMsg,anncId);

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
        kryptonUrl = 'krypton://games';
    } else if (url === './settings.html') {
        kryptonUrl = 'krypton://settings';
    } else if (url === './apps.html') {
        kryptonUrl = 'krypton://apps';
    } else if (url === './ai.html') {
        kryptonUrl = 'krypton://ai'
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
    if (event.data.type ==='app-load-url') {
        loadWebsite(event.data.url);
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
        if (title === 'ai') {
            loadWebsiteInternal('./ai.html', 'AI');
        } else if (title === 'games') {
            loadWebsiteInternal('./games.html', 'Games');
        } else if (title === 'apps') {
            loadWebsiteInternal('./apps.html','Apps');
        } else if (title === 'settings') {
            loadWebsiteInternal('./settings.html','Settings');
        } else if (title === 'movies') { 
            loadWebsite('https://cineby.gd/'); 
        } else if (title === 'music') {
            loadWebsite('https://monochrome.samidy.com/');
        }
    });
});

//search eng stuff
const engBtn = document.getElementById('engineBtn');
const engDr = document.getElementById('engineDr');

engBtn.addEventListener('click',(e)=>{
    e.stopPropagation();
    engineDr.classList.toggle('open');
    engineBtn.querySelector('.model-chv').style.transform = engineDr.classList.contains('open')?'rotate(180deg)':'';
});

engDr.querySelectorAll('.engine-opt').forEach(opt => {
    opt.addEventListener('click',()=>{
        engDr.querySelectorAll('.engine-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        searchEng = opt.dataset.engine;
        document.getElementById('engineBadge').textContent = opt.textContent.trim();
        engDr.classList.remove('open');
        engBtn.querySelector('.model-chv').style.transform='';
    });
});

function doSearch() {
    const query=document.querySelector('.search-input').value.trim();
    if (!query) return;
    const url = searchEng.replace('%s',encodeURIComponent(query));
    loadWebsite(url);
}

document.querySelector('.search-input').addEventListener('keypress',(e)=>{
    if (e.key==='Enter') doSearch();
});

document.getElementById('searchSendBtn').addEventListener('click',doSearch);

//suggestions
let suggTimeout = null;
let activeSuggIdx = -1;

const suggContainer = document.createElement('div');
suggContainer.className = 'url-suggestions';
suggContainer.style.display='none';
document.querySelector('.address-bar').appendChild(suggContainer);

function hideSugg() {
    suggContainer.style.display='none';
    suggContainer.innerHTML='';
    activeSuggIdx=-1;
}

async function fetchSuggestions(query) {
    if (!query.trim()) {
        hideSugg();
        return;
    }
    try {
        const u = new URL(query);
        if (u.protocol === 'https:'|| u.protocol==='http:') {
            hideSugg();
            return;
        }
    } catch (_) {}
    if (query.includes('.') && !query.includes(' ')) {
        hideSugg();
        return;
    }
    try {
        const res = await fetch(`https://suggestions-pxy.carbonical80.workers.dev/?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const suggestions = data[1]?.slice(0,8)||[];
        renderSuggs(suggestions,query);
    } catch (e) {
        hideSugg();
    }
}

function renderSuggs(suggestions,query) {
    suggContainer.innerHTML='';
    activeSuggIdx = -1;
    const allSuggs = [query,...suggestions.filter(s=>s!==query)];
    if (!allSuggs.length) {
        suggContainer.style.display='none';
        return;
    }
    allSuggs.forEach((s,i)=>{
        const item = document.createElement('div');
        item.className='url-sugg-item';
        item.innerHTML = `<i data-lucide="search"></i><span>${s}</span>`;
        item.addEventListener('mousedown', (e)=>{
            e.preventDefault();
            urlInput.value=s;
            hideSugg();
            loadWebsite(s);
        });
        suggContainer.appendChild(item);
    });
    lucide.createIcons();
    suggContainer.style.display='block';
}

urlInput.addEventListener('input',()=>{
    clearTimeout(suggTimeout);
    const val = urlInput.value;
    if (!val.trim()) {
        hideSugg();
        return;
    }
    suggTimeout = setTimeout(()=>fetchSuggestions(val),10);
});

urlInput.addEventListener('keydown',(e)=>{
    const items = suggContainer.querySelectorAll('.url-sugg-item');
    if (!items.length) return;
    if (e.key==='ArrowDown') {
        e.preventDefault();
        activeSuggIdx = Math.min(activeSuggIdx+1,items.length-1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSuggIdx = Math.max(activeSuggIdx-1,-1);
    } else if (e.key==='Escape') {
        hideSugg();
        return;
    } else {
        return;
    }
    items.forEach((el,i)=>el.classList.toggle('active',i===activeSuggIdx));
    if (activeSuggIdx >= 0) {
        urlInput.value=items[activeSuggIdx].querySelector('span').textContent;
    }
});

urlInput.addEventListener('blur',()=>{
    setTimeout(hideSugg,150);
});

urlInput.addEventListener('focus',()=>{
    const val = urlInput.value;
    if (val.trim()) fetchSuggestions(val);
});

let wSuggTimeout = null;
let wActiveSuggIdx = -1;

const wSuggContainer = document.createElement('div');
wSuggContainer.className = 'wscreen-suggestions';
wSuggContainer.style.display = 'none';
document.querySelector('.search-box').appendChild(wSuggContainer);

function hideWSugg() {
    wSuggContainer.style.display = 'none';
    wSuggContainer.innerHTML='';
    document.querySelector('.search-box').classList.remove('sugg-open');
    wActiveSuggIdx = -1;
}

function renderWSuggs(suggestions, query) {
    wSuggContainer.innerHTML = '';
    wActiveSuggIdx = -1;
    const allSuggs = [query, ...suggestions.filter(s => s!==query)];
    if (!allSuggs.length) {
        wSuggContainer.style.display='none';
        return;
    }
    allSuggs.forEach((s) => {
        const item = document.createElement('div');
        item.className = 'wscreen-sugg-item';
        item.innerHTML = `<i data-lucide="search"></i><span>${s}</span>`;
        item.addEventListener('mousedown',(e) => {
            e.preventDefault();
            searchInput.value=s;
            hideWSugg();
            loadWebsite(s);
        });
        wSuggContainer.appendChild(item);
    });
    lucide.createIcons();
    document.querySelector('.search-box').classList.add('sugg-open');
    wSuggContainer.style.display='block';
}

async function fetchWSuggestions(query) {
    if (!query.trim()) {
        hideWSugg();
        return;
    }
    try {
        const u = new URL(query);
        if (u.protocol === 'https:'|| u.protocol==='http:') {
            hideWSugg();
            return;
        }
    } catch (_) {}
    if (query.includes('.') && !query.includes(' ')) {
        hideWSugg();
        return;
    }
    try {
        const res = await fetch(`https://suggestions-pxy.carbonical80.workers.dev/?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        console.log(data);
        const suggestions = data[1]?.slice(0,8)||[];
        renderWSuggs(data[1]?.slice(0,8)||[],query);
    } catch (e) {
        hideWSugg();
    }
}

searchInput.addEventListener('input',()=>{
    clearTimeout(wSuggTimeout);
    const val = searchInput.value;
    if (!val.trim()) {
        hideWSugg();
        return;
    }
    wSuggTimeout = setTimeout(()=>fetchWSuggestions(val),10);
});

searchInput.addEventListener('focus',()=>{
    const val = searchInput.value;
    if (val.trim()) fetchWSuggestions(val);
});

searchInput.addEventListener('keydown',(e)=>{
    const items = wSuggContainer.querySelectorAll('.wscreen-sugg-item');
    if (!items.length) return;
    if (e.key==='ArrowDown') {
        e.preventDefault();
        wActiveSuggIdx = Math.min(wActiveSuggIdx+1,items.length-1);
    } else if (e.key==='ArrowUp') {
        e.preventDefault();
        wActiveSuggIdx=Math.max(wActiveSuggIdx-1,-1);
    } else if (e.key === 'Escape') {
        hideWSugg();
        return;
    } else {return;}
    items.forEach((el,i)=>el.classList.toggle('active',i===wActiveSuggIdx));
    if (wActiveSuggIdx >= 0) {
        searchInput.value = items[wActiveSuggIdx].querySelector('span').textContent;
    }
});

searchInput.addEventListener('blur',()=>setTimeout(hideWSugg,200));

// tor functionality
let torEnabled = localStorage.getItem('krypton_wispUrl') === 'wss://tor.classroom.lat/';
const torBtn = document.getElementById('torBtn');

if (torEnabled) {
    const svg=torBtn.querySelector('svg');
    if (svg) svg.style.color='#60a5fa';
}

torBtn.addEventListener('click',async ()=>{
    torEnabled = !torEnabled;
    const wispUrl = torEnabled ? 'wss://tor.classroom.lat/' : 'wss://wisp.classroom.lat/';
    localStorage.setItem('krypton_wispUrl',wispUrl);

    try {
        const conn = getConnection();
        const pType = getProxyType();
        if (pType==='scramjet') {
            await conn.setTransport('/sail/libcurl/index.mjs',[{
                websocket: wispUrl,
                wasm: '/sail/scram/scramjet.wasm.wasm'
            }]);
        } else {
            await conn.setTransport('/epoxy/index.mjs',[{wisp:wispUrl}]);
        }
    } catch (e) {
        console.error('failed to switch transport:',e);
    }
    const svg = torBtn.querySelector('svg');
    if (svg) svg.style.color = torEnabled ? '#60a5fa' : '#808080';
    showNotif(
        torEnabled ? 'Tor enabled' : 'Tor disabled',
        torEnabled ? 'Traffic will now route through Tor. Pages will load slower. Note than .onion links will not open.' : 'Switched back to normal mode.'
    );
});

//ping indicator
const pingEl = document.createElement('div');
pingEl.className = 'ping-ind';
pingEl.innerHTML = '<div class="ping-dot"></div><span id="pingVal">--ms</span>';
document.body.appendChild(pingEl);

async function measurePing() {
    const wispUrl = localStorage.getItem('krypton_wispUrl')||'wss://wisp.classroom.lat/';
    const httpUrl = wispUrl.replace('wss://','https://').replace('ws://','http://').replace(/\/$/,'');
    const start = performance.now();
    try {
        await fetch(httpUrl,{method:'HEAD',mode:'no-cors',cache:'no-store'});
        const ping=Math.round(performance.now()-start);
        const valEl =document.getElementById('pingVal');
        valEl.textContent = `${ping}ms`;
        pingEl.classList.remove('warn','bad');
        if (ping > 300) pingEl.classList.add('bad');
        else if (ping > 150) pingEl.classList.add('warn');
    } catch {
        document.getElementById('pingVal').textContent='offline';
        pingEl.classList.add('bad');
    }
}

measurePing();
setInterval(measurePing, 5000);

// cloud sync
const SYNC_API = 'https://classroom.lat/sync/api';

function getSyncToken() {
    return localStorage.getItem('krypton_syncToken');
}

function getSyncUser() {
    return localStorage.getItem('krypton_syncUser');
}

async function saveIDBFS() {
    const dbList = await indexedDB.databases();
    const gameDbs = dbList.filter(db => db.name.includes('/idbfs') || db.name.includes('idbfs'));
    const result = {};
    for (const dbInfo of gameDbs) {
        try {
            const db = await new Promise((res, rej) => {
                const req = indexedDB.open(dbInfo.name);
                req.onsuccess = () => res(req.result);
                req.onerror = () => rej(req.error);
            });
            result[dbInfo.name] = {};
            for (const storeName of db.objectStoreNames) {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const data = await new Promise((res, rej) => {
                    const req = store.getAll();
                    req.onsuccess = () => res(req.result);
                    req.onerror = () => rej(req.error);
                });
                const keys = await new Promise((res, rej) => {
                    const req = store.getAllKeys();
                    req.onsuccess = () => res(req.result);
                    req.onerror = () => rej(req.error);
                });
                result[dbInfo.name][storeName] = keys.map((key, i) => {
                    let value = data[i];
                    if (value instanceof ArrayBuffer) {
                        value = { __type: 'ArrayBuffer', data: btoa(String.fromCharCode(...new Uint8Array(value))) };
                    } else if (ArrayBuffer.isView(value)) {
                        value = { __type: 'ArrayBufferView', data: btoa(String.fromCharCode(...new Uint8Array(value.buffer))) };
                    }
                    return { key, value };
                });
            }
            db.close();
        } catch (e) {
            console.warn(dbInfo.name, e);
        }
    }
    localStorage.setItem('krypton_game_saves', JSON.stringify(result));
    console.log('game saved via IDBFS');
}
//expose
window.saveIDBFS=saveIDBFS;

function ab2b64(buffer) {
    const bytes=new Uint8Array(buffer);
    let bin='';
    for (let i=0;i<bytes.length;i+=8192) {
        bin+=String.fromCharCode(...bytes.subarray(i,i+8192));
    }
    return btoa(bin);
}

async function exportIndexedDB() {
    const dbList =await indexedDB.databases();
    const result={};
    const skipDbs=['/idbfs','idbfs','$scramjet','scramjet','amethyst_extensions'];
    for (const dbInfo of dbList) {
        if (skipDbs.some(skip=>dbInfo.name.includes(skip))) continue;
        try {
            await new Promise(res=>setTimeout(res,50));
            const db=await new Promise((res,rej)=>{
                const req=indexedDB.open(dbInfo.name);
                req.onsuccess=()=>res(req.result);
                req.onerror=()=>rej(req.error);
            });
            result[dbInfo.name]={};
            for (const storeName of db.objectStoreNames) {
                const tx=db.transaction(storeName,'readonly');
                const store=tx.objectStore(storeName);
                const data=await new Promise((res,rej)=>{
                    const req=store.getAll();
                    req.onsuccess=()=>res(req.result);
                    req.onerror=()=>rej(req.error);
                });
                const keys=await new Promise((res,rej)=>{
                    const req=store.getAllKeys();
                    req.onsuccess=()=>res(req.result);
                    req.onerror=()=>rej(req.error);
                });
                result[dbInfo.name][storeName]=keys.map((key,i)=>{
                    let value=data[i];
                    if (value instanceof ArrayBuffer) {
                        value={__type:'ArrayBuffer',data:ab2b64(value)};
                    } else if (ArrayBuffer.isView(value)) {
                        value={__type:'ArrayBufferView',data:ab2b64(value)};
                    }
                    return {key,value};
                });
            }
            db.close();
            await new Promise(res=>setTimeout(res,50));
        } catch (e) {
            console.warn('could not export db',dbInfo.name,e);
        }
    }
    return result;
}

async function importIndexedDB(data) {
    for (const [dbName,stores] of Object.entries(data)) {
        try {
            const existingDb=await new Promise((res,rej)=>{
                const req=indexedDB.open(dbName);
                req.onsuccess=()=>{res(req.result);}
                req.onerror=()=>rej(req.error);
            });
            const version=existingDb.version;
            const storeNames=[...existingDb.objectStoreNames];
            existingDb.close();
            const db = await new Promise((res,rej)=>{
                const req=indexedDB.open(dbName,version);
                req.onsuccess=()=>res(req.result);
                req.onerror=()=>rej(req.error);
                req.onupgradeneeded=(e)=>{
                    const db = e.target.result;
                    for (const storeName of Object.keys(stores)) {
                        if (!db.objectStoreNames.contains(storeName)) {
                            db.createObjectStore(storeName);
                        }
                    }
                };
            });
            for (const [storeName,entries] of Object.entries(stores)) {
                if (!db.objectStoreNames.contains(storeName)) continue;
                try {
                    const tx = db.transaction(storeName,'readwrite');
                    const store = tx.objectStore(storeName);
                    await new Promise((res,rej)=>{
                        const req=store.clear();
                        req.onsuccess=()=>res();
                        req.onerror=()=>rej(req.error);
                    });
                    for (const {key,value} of entries) {
                        store.put(value,key);
                    }
                    await new Promise((res,rej)=>{
                        tx.oncomplete=res;
                        tx.onerror=()=>rej(tx.error);
                    });
                } catch (e) {
                    console.warn('could not import store:',storeName,e);
                }
            }
            db.close();
        } catch (e) {
            console.warn('could not import db',dbName,e);
        }
    }
}

async function restoreGameSaves() {
    const saved=localStorage.getItem('krypton_game_saves');
    if (!saved) return;
    const data=JSON.parse(saved);
    await importIndexedDB(data);
    console.log('game saves restored');
}

async function collectSyncData() {
    const data = {};
    for (let i=0;i<localStorage.length;i++) {
        const key = localStorage.key(i);
        if (key==='krypton_syncToken' || key==='krypton_syncUser') continue;
        data[key] = localStorage.getItem(key);
    }
    data['__idb__']=await exportIndexedDB();
    return data;
}

async function applySyncData(data) {
    Object.entries(data).forEach(([key,value])=>{
        if (key==='krypton_syncToken'||key==='krypton_syncUser') return;
        localStorage.setItem(key,value);
    });
    if (data['__idb__']) {
        await importIndexedDB(data['__idb__']);
    }
}

async function pushSync() {
    const token=getSyncToken();
    if (!token) return;
    await new Promise(res=>setTimeout(res,2000));
    syncBtn.className='sync-btn syncing';
    syncBtn.innerHTML='<i data-lucide="loader-2"></i><span>Syncing...</span>';
    lucide.createIcons();
    try {
        const res = await fetch(`${SYNC_API}/sync/push`,{
            method:'POST',
            headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
            body: JSON.stringify({data:await collectSyncData()})
        });
        if (!res.ok) throw new Error();
        localStorage.setItem('krypton_lastSync',Date.now());
        syncBtn.className = 'sync-btn synced';
        syncBtn.innerHTML = '<i data-lucide="cloud"></i><span>'+getSyncUser()+'</span>';
        lucide.createIcons();
    } catch {
        syncBtn.className='sync-btn error';
        syncBtn.innerHTML='<i data-lucide="cloud-off"></i><span>Sync failed</span>';
        lucide.createIcons();
        showNotif('Sync failed','Could not reach sync server.');
    }
}

async function pullSync() {
    const token = getSyncToken();
    if (!token) return;
    try {
        const res=await fetch(`${SYNC_API}/sync/pull`, {
            headers:{'Authorization':`Bearer ${token}`}
        });
        const json = await res.json();
        if (json.data) {
            await applySyncData(json.data);
            bookmarks=JSON.parse(localStorage.getItem('krypton_bookmarks')||'[]');
            history=JSON.parse(localStorage.getItem('krypton_history')||'[]');
            renderBms();
            await restoreGameSaves();
        }
        return json.updated_at;
    } catch {
        showNotif('Sync failed','Failed to pull data from the server.');
    }
}

const syncBtn = document.createElement('div');
syncBtn.className='sync-btn';
document.body.appendChild(syncBtn);

function updSyncBtn() {
    const user = getSyncUser();
    if (user) {
        syncBtn.className='sync-btn synced';
        syncBtn.innerHTML=`<i data-lucide="cloud"></i><span>${user}</span>`;
    } else {
        syncBtn.className='sync-btn';
        syncBtn.innerHTML='<i data-lucide="cloud"></i><span>Sign in to cloud sync</span>';
    }
    lucide.createIcons();
}
updSyncBtn();
syncBtn.addEventListener('click',openSyncOvr);

const syncOvr = document.createElement('div');
syncOvr.className='sync-ovr';
document.body.appendChild(syncOvr);

function openSyncOvr() {
    syncOvr.style.display='flex';
    requestAnimationFrame(()=>syncOvr.classList.add('show'));
    getSyncUser()?renderLoggedIn():renderAuthForm('login');
}

function closeSyncOvr() {
    syncOvr.classList.remove('show');
    setTimeout(()=>{syncOvr.style.display='none';},300);
}

syncOvr.addEventListener('click',(e)=>{
    if (e.target===syncOvr) closeSyncOvr();
});

function renderAuthForm(mode) {
    const isLogin=mode==='login';
    syncOvr.innerHTML=`
    <div class="sync-overlay">
        <div class="sync-overlay-hdr">
            <div class="sync-overlay-htop">
                <div class="sync-overlay-icon"><i data-lucide="cloud"></i></div>
                <button class="sync-overlay-close" id="syncClose"><i data-lucide="x"></i></button>
            </div>
            <h2>${isLogin?'Welcome back':'Create account'}</h2>
            <p class="sync-overlay-sub">${isLogin ? 'Sign in to sync your data across devices.':'Create a free cloud sync account to sync your data across devices.'}</p>
        </div>
        <div style="padding:24px;">
            <div class="sync-err" id="syncErr"></div>
            <div class="sync-field-wrap">
                <input class="sync-field" id="syncUser" type="text" placeholder="Username" autocomplete="off" spellcheck="false">
                <i data-lucide="user"></i>
            </div>
            <div class="sync-field-wrap">
                <input class="sync-field" id="syncPass" type="password" placeholder="Password">
                <i data-lucide="lock"></i>
            </div>
            <button class="sync-submit" id="syncSubmit">${isLogin?'Sign in':'Create account'}</button>
            <div class="sync-divider"><span>or</span></div>
            <div class="sync-toggle">
                ${isLogin?"Don't have an account? <span class='sync-toggle-link' id='syncSwitch'>Sign up for free</span>":"Already have an account? <span class='sync-toggle-link' id='syncSwitch'>Sign in</span>"}
            </div>
        </div>
    </div>`;
    lucide.createIcons();
    document.getElementById('syncClose').addEventListener('click',closeSyncOvr);
    document.getElementById('syncSwitch').addEventListener('click',()=>renderAuthForm(isLogin?'register':'login'));
    const submit=document.getElementById('syncSubmit');
    const errEl = document.getElementById('syncErr');
    async function doSubmit() {
        const username=document.getElementById('syncUser').value.trim();
        const password=document.getElementById('syncPass').value;
        if (!username||!password) {
            errEl.innerHTML='<i data-lucide="alert-circle"></i>Please fill in all fields.';
            lucide.createIcons();
            return;
        }
        submit.textContent='Please wait...';
        submit.disabled=true;
        errEl.innerHTML='';
        try {
            const res = await fetch(`${SYNC_API}${isLogin?'/login':'/register'}`,{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({username,password})
            });
            const json = await res.json();
            if (!res.ok) {
                errEl.innerHTML=`<i data-lucide="alert-circle"></i>${json.error||'Something went wrong.'}`;
                lucide.createIcons();
                submit.disabled=false;
                submit.textContent=isLogin?'Sign in':'Create account';
                return;
            }
            if (isLogin) {
                localStorage.setItem('krypton_syncToken',json.token);
                localStorage.setItem('krypton_syncUser',json.username);
                updSyncBtn();
                closeSyncOvr();
                showNotif('Signed in!',`Welcome back, ${json.username}!`);
                await pullSync();
                setInterval(pushSync,120000);
            } else {
                showNotif('Account created!','You can now sign in.');
                renderAuthForm('login');
            }
        } catch {
            errEl.innerHTML=`<i data-lucide="alert-circle"></i>Could not reach cloud sync server.`;
            lucide.createIcons();
            submit.disabled=false;
            submit.textContent=isLogin?'Sign in':'Create account';
        }
    }
    submit.addEventListener('click',doSubmit);
    document.getElementById('syncPass').addEventListener('keypress',(e)=>{
        if (e.key==='Enter') doSubmit();
    });
    setTimeout(()=>document.getElementById('syncUser')?.focus(),100);
}

function renderLoggedIn() {
    const user = getSyncUser();
    const lastSync=localStorage.getItem('krypton_lastSync');
    const lastSyncStr=lastSync ? new Date(parseInt(lastSync)).toLocaleString(undefined,{month:'short',hour:'2-digit',minute:'2-digit'}):'Never';
    syncOvr.innerHTML=`
    <div class="sync-overlay">
        <div class="sync-overlay-hdr">
            <div class="sync-overlay-htop">
                <div class="sync-overlay-icon"><i data-lucide="cloud"></i></div>
                <button class="sync-overlay-close" id="syncClose"><i data-lucide="x"></i></button>
            </div>
            <h2>Cloud sync</h2>
            <p class="sync-overlay-sub">Your data syncs automatically every 2 minutes.</p>
        </div>
        <div style="padding:24px;">
            <div class="sync-user-card">
                <div class="sync-avatar">${user[0].toUpperCase()}</div>
                <div class="sync-user-info">
                    <h3>${user}</h3>
                </div>
            </div>
            <div class="sync-actions">
                <button class="sync-action-btn" id="syncPushBtn">
                    <i data-lucide="upload-cloud"></i>Push - upload now
                </button>
                <button class="sync-action-btn" id="syncPullBtn">
                    <i data-lucide="download-cloud"></i>Pull - restore from cloud
                </button>
                <button class="sync-action-btn" id="syncSignOut">
                    <i data-lucide="log-out"></i>Sign out
                </button>
                <button class="sync-action-btn danger" id="syncDelAcct">
                    <i data-lucide="trash-2"></i>Delete account
                </button>
            </div>
            <div class="sync-last-sync">Last synced: <span>${lastSyncStr}</span></div>
        </div>
    </div>`;
    lucide.createIcons();
    document.getElementById('syncClose').addEventListener('click',closeSyncOvr);
    document.getElementById('syncPushBtn').addEventListener('click',async ()=>{
        closeSyncOvr();
        await pushSync();
    });
    document.getElementById('syncPullBtn').addEventListener('click',async()=>{
        closeSyncOvr();
        await pullSync();
    });
    document.getElementById('syncSignOut').addEventListener('click',()=>{
        localStorage.removeItem('krypton_syncToken');
        localStorage.removeItem('krypton_syncUser');
        updSyncBtn();
        closeSyncOvr();
        showNotif('Signed out','You have been signed out of cloud sync.');
    });
    document.getElementById('syncDelAcct').addEventListener('click', async ()=>{
        if (!confirm('Delete your cloud sync account and saved data? This is irreversible.')) return;
        try {
            await fetch(`${SYNC_API}/account`,{
                method:'DELETE',
                headers:{'Authorization':`Bearer ${getSyncToken()}`}
            });
        } catch {};
        localStorage.removeItem('krypton_syncToken');
        localStorage.removeItem('krypton_syncUser');
        updSyncBtn();
        closeSyncOvr();
        showNotif('Account deleted', 'Your account and cloud data has been deleted.');
    });
}

if (getSyncToken()) {
    pullSync().then(()=>pushSync());
    setInterval(pushSync,120000);
}

//ai
const WORKER='https://yellow-forest-f6c4.carbonical80.workers.dev/api';
const MODEL='google/gemini-3-flash-preview';

let aiHistory=[];
let aiAbortCtr=null;
let aiAgentRunning=false;

document.getElementById('aiBtn').addEventListener('click',()=>{
    const sidebar = document.getElementById('aiSidebar');
    const btn=document.getElementById('aiBtn');
    sidebar.classList.toggle('open');
    btn.classList.toggle('active');
});

document.getElementById('aiSidebarClose').addEventListener('click',()=>{
    document.getElementById('aiSidebar').classList.remove('open');
    document.getElementById('aiBtn').classList.remove('active');
});

function appendAIMsg(text,type) {
    const msgs=document.getElementById('aiMsgs');
    const el=document.createElement('div');
    el.className='ai-msg '+type;
    if (type==='ai') {
        el.innerHTML=marked.parse(text);
    } else {
        el.textContent=text;
    }
    msgs.appendChild(el);
    msgs.scrollTop=msgs.scrollHeight;
    return el;
}

function setAIRunning(running) {
    aiAgentRunning=running;
    const btn=document.getElementById('aiSendBtn');
    if (running) {
        btn.innerHTML='<i data-lucide="square"></i>';
        btn.classList.add('running');
    } else {
        btn.innerHTML='<i data-lucide="send"></i>';
        btn.classList.remove('running');
    }
    lucide.createIcons();
}

function stopAIAgent() {
    if (aiAbortCtr) {
        aiAbortCtr.abort();
        aiAbortCtr=null;
    }
    const activeTab=document.querySelector('.tab.active');
    if (activeTab) {
        const tabId=activeTab.dataset.tabId;
        const iframe=tabs[tabId]?.iframe;
        try {
            if (iframe && iframe.contentWindow?.pageAgent) {
                iframe.contentWindow.pageAgent.dispose();
                iframe.contentWindow.pageAgent=null;
            }
        } catch (e) {}
    }
    document.querySelectorAll('.ai-msg.thinking').forEach(el => el.remove());
    appendAIMsg('Stopped.','ai');
    setAIRunning(false);
}

async function askAI(question,pageContent,pageUrl,history,signal) {
    const messages=[
        ...history.map(m=>({role:m.role,content:m.content})),
        {
            role:'user',
            content:(pageUrl?`current page URL: ${pageUrl}\n\npage content:\n${pageContent||''}\n\nuser question:` : '') + question
        }
    ];
    const res=await fetch(WORKER,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:MODEL,messages}),
        signal
    });
    const rawText=await res.text();
    let data;
    try {
        data = JSON.parse(rawText);
    } catch (e) {
        throw new Error('Invalid response from AI.');
    }
    if (data.error) throw new Error(error.data.message);
    return data.choices?.[0]?.message?.content||'No response.';
}

function injectPA(frameDoc,frameWin,goal,signal) {
    return new Promise((resolve,reject)=>{
        if (signal?.aborted) return reject(new DOMException('Aborted','AbortError'));
        signal?.addEventListener('abort',()=>{
            window.removeEventListener('message',msgHandler);
            try {
                if (frameWin.pageAgent) {
                    frameWin.pageAgent.dispose();
                    frameWin.pageAgent=null;
                }
            } catch (e) {}
            reject(new DOMException('Aborted','AbortError'));
        });
        const nukeCode=`(function(){
            function nuke(){var el=document.getElementById('page-agent-runtime_agent-panel');if(el&&el.parentNode)el.parentNode.removeChild(el);}
            setInterval(nuke,50);
            new MutationObserver(nuke).observe(document.documentElement,{childList:true,subtree:true});
        })();`;
        const runCode=`
        window.__runAgent=function(goal) {
            return new Promise(function(res,rej) {
                try {
                    if (window.pageAgent) {
                        window.pageAgent.dispose();
                        window.pageAgent=null;
                    }
                    var a = new PageAgent({
                        model:'${MODEL}',
                        baseURL:'${WORKER}',
                        apiKey:'dummykey',
                        language:'en-US',
                        instructions: {
                            system: 'You are a browser assistant. Read the current page and complete tasks the user requests. Use get_browser_state to read the page, then use available tools to interact with it.' 
                        }
                    });
                    window.pageAgent=a;
                    if (a.panel&&a.panel.hide) a.panel.hide();
                    a.addEventListener('activity',function(e) {
                        window.parent.postMessage({type:'agent_activity',activity:e.detail},'*');
                    });
                    a.execute(goal).then(function(result) {
                        window.parent.postMessage({type:'agent_done',data:result.data,success:result.success},'*');
                        res(result);
                    }).catch(function(err) {
                        window.parent.postMessage({type:'agent_error',message:err.message},'*');
                        rej(err);
                    });
                } catch (e) {
                    window.parent.postMessage({type:'agent_error',message:e.message},'*');
                    rej(e);
                }
            });
        };
        window.__runAgent(${JSON.stringify(goal)});`;

        function msgHandler(e) {
            if (e.source!==frameWin) return;
            if (e.data.type==='agent_done') {
                window.removeEventListener('message',msgHandler);
                document.querySelectorAll('.ai-msg.thinking').forEach(el=>el.remove());
                if (e.data.data?.trim()) appendAIMsg(e.data.data,'ai');
                else if (!e.data.success) appendAIMsg("The agent could not complete the task.",'ai');
                resolve();
            } else if (e.data.type==='agent_error') {
                window.removeEventListener('message',msgHandler);
                document.querySelectorAll('.ai-msg.thinking').forEach(el=>el.remove());
                appendAIMsg('Agent error: '+e.data.message,'ai');
                reject(new Error(e.data.message));
            } else if (e.data.type==='agent_activity') {
                const act = e.data.activity;
                document.querySelectorAll('.ai-msg.thinking').forEach(el=>el.remove());
                if (act.type==='thinking') appendAIMsg('Thinking...','thinking');
                else if(act.type==='executing') appendAIMsg('Running: '+act.tool+'...','thinking');
            }
        }
        window.addEventListener('message',msgHandler);
        const nukeScript=frameDoc.createElement('script');
        nukeScript.textContent=nukeCode;
        frameDoc.head.appendChild(nukeScript);
        if (frameWin.__agentLoaded) {
            const s=frameDoc.createElement('script');
            s.textContent=runCode;
            frameDoc.head.appendChild(s);
            return;
        }
        const script=frameDoc.createElement('script');
        script.src='https://cdn.jsdelivr.net/npm/page-agent@1.7.1/dist/iife/page-agent.demo.js';
        script.crossOrigin='true';
        script.onload=()=>{
            frameWin.__agentLoaded=true;
            const s = frameDoc.createElement('script');
            s.textContent=runCode;
            frameDoc.head.appendChild(s);
        };
        script.onerror=()=>reject(new Error('failed to load PageAgent'));
        frameDoc.head.appendChild(script);
    });
}

async function sendAIMessage() {
    if (aiAgentRunning) {
        stopAIAgent();
        return;
    }
    const input=document.getElementById('aiInput');
    const text=input.value.trim();
    if (!text) return;
    input.value='';
    input.style.height='auto';
    appendAIMsg(text,'user');
    const activeTab=document.querySelector('.tab.active');
    const tabId=activeTab?.dataset.tabId;
    const iframe=tabs[tabId]?.iframe;
    const pageLoaded=iframe&&tabs[tabId]?.url&&tabs[tabId].url!=='krypton://new-tab';
    setAIRunning(true);
    aiAbortCtr=new AbortController();
    const signal=aiAbortCtr.signal;
    if (pageLoaded) {
        let frameDoc,frameWin;
        try {
            frameDoc=iframe.contentDocument;
            frameWin=iframe.contentWindow;
        } catch (e) {frameDoc=null;}
        if (frameDoc&&frameDoc.body) {
            const thinking=appendAIMsg('Agent starting...','thinking');
            try {
                await injectPA(frameDoc,frameWin,text,signal);
                thinking.remove();
                document.querySelectorAll('.ai-msg.thinking').forEach(el=>el.remove());
            } catch (err) {
                thinking.remove();
                document.querySelectorAll('.ai-msg.thinking').forEach(el=>el.remove());
                if (err.name!=='AbortError') appendAIMsg('Agent error: '+err.message,'ai');
            }
            setAIRunning(false);
            return;
        }
    }
    aiHistory.push({role:'user',content:text});
    const thinking=appendAIMsg('Thinking...','thinking');
    try {
        const reply=await askAI(text,null,null,aiHistory.slice(0,-1),signal);
        thinking.remove();
        appendAIMsg(reply,'ai');
        aiHistory.push({role:'assistant',content:reply});
    } catch (err) {
        thinking.remove();
        aiHistory.pop();
        if (err.name!=='AbortError') appendAIMsg('Error: '+err.message,'ai');
    }
    setAIRunning(false);
}

document.getElementById('aiSendBtn').addEventListener('click',sendAIMessage);

document.getElementById('aiInput').addEventListener('keydown',(e)=>{
    if (e.key==='Enter'&&!e.shiftKey) {
        e.preventDefault();
        sendAIMessage();
    }
});

document.getElementById('aiInput').addEventListener('input',function() {
    this.style.height='auto';
    this.style.height=Math.min(this.scrollHeight,100)+'px';
});