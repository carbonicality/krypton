/*
 *amethyst.js
 *extension runtime
 */

import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

const AMETHYST_DB='amethyst_extensions';
const AMETHYST_DB_VER=1;
const EXT_STORE='extensions';
const EXT_FILES_STORE='extension_files';
const EXT_STORAGE_STORE='extension_storage';

const _extensions={};
const _contentScriptReg=[];
const _msgListeners={};
const _tabMsgListeners={};
const _webReqListeners={};
const _cmdListeners={};
const _ports={};
const _contextMenus={};
const _alarms={};
const _bus=new BroadcastChannel('amethyst_bus');

let _db=null;
let _tabs=null;
let _loadWebsite=null;
let _showNotif=null;
let _getActiveTabId=null;

// indexedDB setup
async function openDB() {
    if (_db) return _db;
    return new Promise((resolve,reject)=>{
        const req=indexedDB.open(AMETHYST_DB,AMETHYST_DB_VER);
        req.onupgradeneeded=(e)=>{
            const db=e.target.result;
            if (!db.objectStoreNames.contains(EXT_STORE)) {
                db.createObjectStore(EXT_STORE,{keyPath:'id'});
            }
            if (!db.objectStoreNames.contains(EXT_FILES_STORE)) {
                db.createObjectStore(EXT_FILES_STORE);
            }
            if (!db.objectStoreNames.contains(EXT_STORAGE_STORE)) {
                db.createObjectStore(EXT_STORAGE_STORE);
            }
        };
        req.onsuccess=()=>{_db=req.result; resolve(_db);};
        req.onerror=()=>reject(req.error);
    });
}

async function dbGet(store,key) {
    const db=await openDB();
    return new Promise((res,rej)=>{
        const tx=db.transaction(store,'readonly');
        const req=tx.objectStore(store).get(key);
        req.onsuccess=()=>res(req.result);
        req.onerror=()=>rej(req.error);
    });
}

async function dbPut(store,key,value) {
    const db=await openDB();
    return new Promise((res,rej)=>{
        const tx=db.transaction(store,'readwrite');
        const req=(key===null)?tx.objectStore(store).put(value):tx.objectStore(store).put(value,key);
        req.onsuccess=()=>res(req.result);
        req.onerror=()=>rej(req.error);
    });
}

async function dbDelete(store,key) {
    const db=await openDB();
    return new Promise((res,rej)=>{
        const tx=db.transaction(store,'readwrite');
        const req=tx.objectStore(store).delete(key);
        req.onsuccess=()=>res();
        req.onerror=()=>rej(req.error);
    });
}

async function dbGetAll(store) {
    const db=await openDB();
    return new Promise((res,rej)=>{
        const tx=db.transaction(store,'readonly');
        const req=tx.objectStore(store).getAll();
        req.onsuccess=()=>res(req.result);
        req.onerror=()=>rej(req.error);
    });
}

async function dbGetAllKeys(store) {
    const db=await openDB();
    return new Promise((res,rej)=>{
        const tx=db.transaction(store,'readonly');
        const req=tx.objectStore(store).getAllKeys();
        req.onsuccess=()=>res(req.result);
        req.onerror=()=>rej(req.error);
    });
}

/*
 * crx zip unpacker
 * CRX2: magic(4)+version(4)+pubkey_len(4)+sig_len(4)+pubkey+sig+zip
 * CRX3: magic(4)+version(4)+header_size(4)+proto_header+zip
 */

function crx2zip(buffer) {
    const view=new DataView(buffer);
    const magic=String.fromCharCode(
        view.getUint8(0),view.getUint8(1),view.getUint8(2),view.getUint8(3)
    );
    if (magic !== 'Cr24') {
        return buffer; // assume raw zip (not crx)
    }
    const version=view.getUint32(4,true);
    let zipStart;
    if (version===2) {
        const pubKeyLen=view.getUint32(8,true);
        const sigLen=view.getUint32(12,true);
        zipStart=16+pubKeyLen+sigLen;
    } else if (version === 3) {
        const headerSize=view.getUint32(8,true);
        zipStart=12+headerSize;
    } else {
        throw new Error(`unknown CRX version: ${version}`);
    }
    return buffer.slice(zipStart);
}

function genExtId(name) {
    let hash=0;
    for (let i=0;i<name.length;i++) {
        hash=((hash<<5)-hash)+name.charCodeAt(i);
        hash|=0;
    }
    const chars='abcdefghijklmnopqrstuvwxyz';
    let id='';
    let n=Math.abs(hash);
    for (let i=0; i<32; i++) {
        id+=chars[n%26];
        n=Math.floor(n/26)+(i*7);
    }
    return id.substring(0,32);
}

/*
 *install extension from ArrayBuffer
 */
export async function installExtension(buffer,filename='extension.crx') {
    const zipBuffer=crx2zip(buffer);
    const zip=await JSZip.loadAsync(zipBuffer);
    const manifestFile=zip.file('manifest.json');
    if (!manifestFile) throw new Error('no manifest.json found in extension');
    const manifestText=await manifestFile.async('text');
    let manifest;
    try {
        manifest=JSON.parse(manifestText);
    } catch (e) {
        throw new Error('invalid manifest:'+e.message);
    }
    const extId=genExtId(manifest.name+(manifest.version||''));
    console.log(`[amethyst] installing ${manifest.name} v${manifest.version} (${extId})`);
    const files={};
    const fileOps=[];
    zip.forEach((path,file)=>{
        if (!file.dir) {
            fileOps.push(
                file.async('arraybuffer').then(async (ab)=>{
                    const key=`${extId}/${path}`;
                    await dbPut(EXT_FILES_STORE,key,ab);
                    files[path]=true;
                })
            );
        }
    });
    await Promise.all(fileOps);
    const extMeta={
        id:extId,
        manifest,
        enabled:true,
        installedAt:Date.now(),
        filename,
        fileList:Object.keys(files),
    };
    await dbPut(EXT_STORE,null,extMeta);
    await loadExtension(extMeta);
    console.log(`[amethyst] installed: ${manifest.name}`);
    return extId;
}

async function readExtFile(extId,path) {
    const key=`${extId}/${path}`;
    const ab=await dbGet(EXT_FILES_STORE,key);
    return ab||null;
}

async function readExtFileText(extId,path) {
    const ab=await readExtFile(extId,path);
    if (!ab) return null;
    return new TextDecoder().decode(ab);
}

async function readExtFileURL(extId,path) {
    const ab=await readExtFile(extId,path);
    if (!ab) return null;
    const mime=guessMime(path);
    return URL.createObjectURL(new Blob([ab],{type:mime}));
}

function guessMime(path) {
    const ext=path.split('.').pop().toLowerCase();
    const map={
        js:'application/javascript',
        mjs:'application/javascript',
        css:'text/css',
        html:'text/html',
        htm:'text/html',
        json:'application/json',
        png:'image/png',
        jpg:'image/jpeg',
        jpeg:'image/jpeg',
        gif:'image/gif',
        svg:'image/svg+xml',
        webp:'image/webp',
        ico:'image/x-icon',
        woff:'font/woff',
        woff2:'font/woff2',
        ttf:'font/ttf',
    };
    return map[ext]||'application/octet-stream';
}

//manifest helpers
function getMV(manifest) {
    return parseInt(manifest.manifest_version)||2;
}

function getBackgroundInfo(manifest) {
    const mv=getMV(manifest);
    if (mv===3) {
        //mv3, service worker
        const sw=manifest.background?.service_worker;
        return sw?{type:'worker',script:sw}:null;
    } else {
        //mv2, page or scripts
        if (manifest.background?.page) {
            return {type:'page',page:manifest.background.page};
        }
        if (manifest.background?.scripts?.length) {
            return {type:'scripts',scripts:manifest.background.scripts};
        }
        return null;
    }
}

//match a URL against a chrome extension match pattern
//supports <all_urls>, *://*/*, https://*.example.com/path*, etc.

function matchPattern(pattern,url) {
    if (pattern==='<all_urls>') return true;
    try {
        const u=new URL(url);
        const [scheme,rest]=pattern.split('://');
        if (scheme!=='*'&&scheme!==u.protocol.replace(':','')) return false;
        const slashIdx=rest.indexOf('/');
        const host=slashIdx===-1?rest:rest.slice(0,slashIdx);
        const path=slashIdx===-1?'/*':rest.slice(slashIdx);
        const hostRe=new RegExp('^'+host.replace(/\*/g,'[^.]*')+'$');
        if (!hostRe.test(u.hostname)) return false;
        const pathRe=new RegExp('^'+path.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$');
        return pathRe.test(u.pathname+u.search);
    } catch (e) {return false;}
}

/*
 *build the chrome.* 'shim' script text for injection into the target page
 *this will run in the target context. it will use postMessage to talk back.
 */

function buildChromeShim(extId,tabId,isBackground) {
    return `(function() {
    const __win=typeof window!=='undefined'?window:self;
    if (__win.__amethyst_shim_loaded) return;
    __win.__amethyst_shim_loaded=true;

    const __extId=${JSON.stringify(extId)};
    const __tabId=${JSON.stringify(tabId)};
    const __isBG=${JSON.stringify(isBackground)};
    const __listeners={};
    let __msgIdCounter=0;
    const __pendingCallbacks={};
    const __portListeners={};
    let __portIdCounter=0;

    function __send(type,payload,callback) {
        const msgId=++__msgIdCounter;
        const msg={__amethyst:true,type,extId:__extId,tabId:__tabId,msgId,payload};
        if (callback) __pendingCallbacks[msgId]=callback;
        __win.parent!==__win?__win.parent.postMessage(msg,'*'):__win.postMessage(msg,'*');
    }
    
    __win.addEventListener('message',(e)=>{
        const d=e.data;
        if (!d||!d.__amethyst_reply) return;
        if (d.extId!==__extId) return;
        if (d.msgId&&__pendingCallbacks[d.msgId]) {
            __pendingCallbacks[d.msgId](d.result,d.error);
            delete __pendingCallbacks[d.msgId];
        }
        if (d.event) {
            const handlers=__listeners[d.event]||[];
            handlers.forEach(fn=>{
                try {fn(...(d.args||[]));} catch (ex) {}
            });
        }
    });

    function __mkEvent() {
        const listeners=[];
        return {
            addListener:(fn)=>listeners.push(fn),
            removeListener:(fn)=>{
                const i=listeners.indexOf(fn);
                if (i>-1) listeners.splice(i,1);
            },
            hasListener:(fn)=>listeners.includes(fn),
            _fire:(...args)=>listeners.forEach(fn=>{try{fn(...args);} catch(e) {} })
        };
    }

    //chrome.runtime
    const runtime={
        id: __extId,
        getManifest: ()=>{let m; __send('runtime.getManifest',{},r=>m=r); return m;},
        getURL:(path)=>'amethyst-ext://'+__extId+'/'+path.replace(/^\\//, ''),
        sendMessage:(extIdOrMsg,msgOrOpts,optsOrCb,maybeCb)=>{
            let targetExt,message,callback;
            if (typeof extIdOrMsg==='object') {
                message=extIdOrMsg;callback=msgOrOpts;
                targetExt=__extId;
            } else if (typeof extIdOrMsg==='string' && typeof msgOrOpts==='object') {
                targetExt=extIdOrMsg;message=msgOrOpts;callback=typeof optsOrCb==='function'?optsOrCb:maybeCb;
            } else {
                message=extIdOrMsg;callback=msgOrOpts;
                targetExt=__extId;
            }
            __send('runtime.sendMessage',{targetExt,message},callback||(()=>{}));
        },
        onMessage:__mkEvent(),
        onInstalled:__mkEvent(),
        onStartup:__mkEvent(),
        onConnect:__mkEvent(),
        connect: (connectInfo) =>{
            const portId='port_'+(++__portIdCounter);
            __send('runtime.connect',{portId,name:connectInfo?.name,extId:__extId});
            return __mkPort(portId,connectInfo?.name);
        },
        lastError:null,
        getPlatformInfo:(cb)=>cb&&cb({os:'linux',arch:'x86-64',nacl_arch:'x86_64'}),
        openOptionsPage:()=>__send('runtime.openOptionsPage',{}),
        setUninstallURL:()=>{},
        requestUpdateCheck:(cb)=>cb&&cb('no_update',{}),
    };
    __listeners['runtime.onMessage']=runtime.onMessage._fire;

    function __mkPort(portId,name) {
        const port={
            name:name||'',
            postMessage:(msg)=>__send('port.postMessage',{portId,msg}),
            disconnect:()=>__send('port.disconnect',{portId}),
            onMessage:__mkEvent(),
            onDisconnect:__mkEvent(),
        };
        __portListeners[portId]=port;
        return port;
    }
    
    //chrome.storage
    function __mkStorageArea(area) {
        function __sendP(type,payload,cb) {
            if (cb) {__send(type,payload,cb);return undefined;}
            return new Promise((res,rej)=>__send(type,payload,(r,err)=>err?rej(err):res(r)));
        }
        return {
            get:(keys,cb)=>__sendP('storage.get',{area,keys},cb),
            set:(items,cb)=>__sendP('storage.set',{area,items},cb),
            remove:(keys,cb)=>__sendP('storage.remove',{area,keys},cb),
            clear:(cb)=>__sendP('storage.clear',{area},cb),
            getBytesInUse:(keys,cb)=>cb?cb(0):Promise.resolve(0),
        };
    }
    const storage={
        local:__mkStorageArea('local'),
        sync:__mkStorageArea('sync'),
        session:__mkStorageArea('session'),
        managed:__mkStorageArea('managed'),
        onChanged:__mkEvent(),
    };

    //chrome.tabs
    const tabs={
        query:(queryInfo,cb)=>__send('tabs.query',queryInfo,cb),
        get:(tabId,cb)=>__send('tabs.get',{tabId},cb),
        create:(createProps,cb)=>__send('tabs.create',createProps,cb),
        update:(tabId,updateProps,cb)=>__send('tabs.update',{tabId,updateProps},cb),
        remove:(tabIds,cb)=>__send('tabs.remove',{tabIds},(r)=>cb&&cb()),
        sendMessage:(tabId,message,opts,cb)=>{
            const callback=typeof opts==='function'?opts:cb;
            __send('tabs.sendMessage',{tabId,message},callback);
        },
        getCurrent:(cb)=>__send('tabs.getCurrent',{},cb),
        onCreated:__mkEvent(),
        onUpdated:__mkEvent(),
        onRemoved:__mkEvent(),
        onActivated:__mkEvent(),
        executeScript:(tabIdOrDetails,details,cb)=>{
            const actualTabId=typeof tabIdOrDetails==='number'?tabIdOrDetails:__tabId;
            const actualDetails=typeof tabIdOrDetails==='object'?tabIdOrDetails:details;
            const callback=typeof details==='function'?details:cb;
            __send('tabs.executeScript',{tabId:actualTabId,details:actualDetails},callback);
        },
        insertCSS:(tabIdOrDetails,details,cb)=>{
            const actualTabId=typeof tabIdOrDetails==='number'?tabIdOrDetails:__tabId;
            const actualDetails=typeof tabIdOrDetails==='object'?tabIdOrDetails:details;
            __send('tabs.insertCSS',{tabId:actualTabId,details:actualDetails},cb);
        },
        captureVisibleTab:(windowId,opts,cb)=>{
            const callback=typeof windowId==='function'?windowId:typeof opts==='function'?opts:cb;
            __send('tabs.captureVisibleTab',{},callback);
        },
        TAB_ID_NONE:-1,
    };

    //chrome.windows
    const windows={
        getCurrent:(cb)=>cb&&cb({id:1,focused:true,type:'normal',state:'normal'}),
        getAll:(cb)=>cb&&cb([{id:1,focused:true,type:'normal',state:'normal'}]),
        create:(createData,cb)=>__send('windows.create',createData,cb),
        onFocusChanged:__mkEvent(),
        WINDOW_ID_NONE:-1,
        WINDOW_ID_CURRENT:-2,
    };

    //chrome.extension
    const extension={
        getURL:runtime.getURL,
        getBackgroundPage:()=>null,
        isAllowedIncognitoAccess:(cb)=>cb&&cb(false),
        isAllowedFileSchemeAccess:(cb)=>cb&&cb(false),
        onMessage:runtime.onMessage,
        onMessageExternal:__mkEvent(),
        sendMessage:runtime.sendMessage,
    };

    //chrome.i18n
    const i18n={
        getMessage:(messageName,substitutions)=>{
            let result;
            __send('i18n.getMessage',{messageName,substitutions},r=>result=r);
            return result||messageName;
        },
        getUILanguage:()=>(typeof navigator!=='undefined'?navigator.language:null)||'en',
        detectLanguage:(text,cb)=>cb&&cb({isReliable:false,languages:[]}),
        getAcceptLanguage:(cb)=>cb&&cb([(typeof navigator!=='undefined'?navigator.language:null)||'en']),
    };

    //chrome.contextMenus
    const contextMenus={
        create:(props,cb)=>{__send('contextMenus.create',props,cb);return props.id||Math.random().toString(36).slice(2)},
        update:(id,props,cb)=>__send('contextMenus.update',{id,props},cb),
        remove:(id,cb)=>__send('contextMenus.remove',{id},cb),
        removeAll:(cb)=>__send('contextMenus.removeAll',{},cb),
        onClicked:__mkEvent(),
    };

    //chrome.notifications
    const notifications={
        create:(notifId,options,cb)=>{
            const id=notifId||('notif_'+Date.now());
            __send('notifications.create',{notifId:id,options},cb);
            return id;
        },
        update:(notifId,options,cb)=>__send('notifications.update',{notifId,options},cb),
        clear:(notifId,cb)=>__send('notifications.clear',{notifId},cb),
        getAll:(cb)=>__send('notifications.getAll',{},cb),
        onClicked:__mkEvent(),
        onClosed:__mkEvent(),
        onButtonClicked:__mkEvent(),
    };

    //chrome.cookies
    const cookies={
        get:(details,cb)=>__send('cookies.get',details,cb),
        getAll:(details,cb)=>__send('cookies.getAll',details,cb),
        set:(details,cb)=>__send('cookies.set',details,cb),
        remove:(details,cb)=>__send('cookies.remove',details,cb),
        onChanged:__mkEvent(),
    };

    //chrome.webRequest
    function __mkWebReqEvent(eventName) {
        return {
            addListener: (fn,filter,extraInfoSpec) => {
                __send('webRequest.addListener',{eventName,filter,extraInfoSpec});
                __listeners[eventName]=__listeners[eventName]||[];
                __listeners[eventName].push(fn);
            },
            removeListener: (fn)=>{
                const arr=__listeners[eventName]||[];
                const i=arr.indexOf(fn);
                if (i>-1) arr.splice(i,1);
            },
            hasListener:(fn)=>(__listeners[eventName]||[]).includes(fn),
        };
    }
    const webRequest={
        onBeforeRequest:__mkWebReqEvent('webRequest.onBeforeRequest'),
        onBeforeSendHeaders:__mkWebReqEvent('webRequest.onBeforeSendHeaders'),
        onSendHeaders:__mkWebReqEvent('webRequest.onSendHeaders'),
        onHeadersReceived:__mkWebReqEvent('webRequest.onHeadersReceived'),
        onCompleted:__mkWebReqEvent('webRequest.onCompleted'),
        onErrorOccurred:__mkWebReqEvent('webRequest.onErrorOccurred'),
        onBeforeRedirect:__mkWebReqEvent('webRequest.onBeforeRedirect'),
        handlerBehaviorChanged:(cb)=>cb&&cb(),
    };

    //chrome.declarativeNetRequest
    const declarativeNetRequest={
        updateDynamicRules:(options,cb)=>__send('dnr.updateDynamicRules',options,cb),
        getDynamicRules:(cb)=>__send('dnr.getDynamicRules',{},cb),
        updateSessionRules:(options,cb)=>__send('dnr.updateSessionRules',options,cb),
        getSessionRules:(cb)=>__send('dnr.getSessionRules',{},cb),
        isRegexSupported:(regexOptions,cb)=>cb&&({isSupported:true}),
        testMatchOutcome:(request,cb)=>__send('dnr.testMatchOutcome',request,cb),
        MAX_NUMBER_OF_RULES:30000,
        MAX_NUMBER_OF_DYNAMIC_RULES:5000,
        GUARANTEED_MINIMUM_STATIC_RULES:30000,
    };
    
    //chrome.scripting (MV3)
    const scripting={
        executeScript:(injection,cb)=>__send('scripting.executeScript',injection,cb),
        insertCSS:(injection,cb)=>__send('scripting.insertCSS',injection,cb),
        removeCSS:(injection,cb)=>__send('scripting.removeCSS',injection,cb),
        registerContentScripts:(scripts,cb)=>__send('scripting.registerContentScripts',{scripts},cb),
        unregisterContentScripts:(filter,cb)=>__send('scripting.unregisterContentScripts',filter,cb),
        getRegisteredContentScripts:(filter,cb)=>__send('scripting.getRegisteredContentScripts',filter,cb),
    };

    //chrome.action
    function __mkAction() {
        return {
            setIcon:(details,cb)=>__send('action.setIcon',details,cb),
            setTitle:(details,cb)=>__send('action.setTitle',details,cb),
            setBadgeText:(details,cb)=>__send('action.setBadgeText',details,cb),
            setBadgeBackgroundColor:(details,cb)=>__send('action.setBadgeBackground',details,cb),
            getBadgeText:(details,cb)=>__send('action.getBadgeText',details,cb),
            enable:(tabId,cb)=>__send('action.enable',{tabId},cb),
            disable:(tabId,cb)=>__send('action.disable',{tabId},cb),
            onClicked:__mkEvent(),
            openPopup:(options,cb)=>__send('action.openPopup',options||{},cb),
            setPopup:(details,cb)=>__send('action.setPopup',details,cb),
            getPopup:(details,cb)=>__send('action.getPopup',details,cb),
        };
    }
    const action=__mkAction();
    const browserAction=__mkAction();
    const pageAction=__mkAction();

    //chrome.alarms
    const alarms={
        create:(name,alarmInfo)=>__send('alarms.create',{name,alarmInfo}),
        get:(name,cb)=>__send('alarms.get',{name},cb),
        getAll:(cb)=>__send('alarms.getAll',{},cb),
        clear:(name,cb)=>__send('alarms.clear',{name},(r)=>cb&&cb(r)),
        clearAll:(cb)=>__send('alarms.clearAll',{},(r)=>cb&&cb(r)),
        onAlarm:__mkEvent(),
    };

    //chrome.permissions
    const permissions={
        request:(perms,cb)=>cb&&cb(true),
        contains:(perms,cb)=>cb&&cb(true),
        getAll:(cb)=>cb&&cb({permissions:[],origins:[]}),
        remove:(perms,cb)=>cb&&cb(true),
        onAdded:__mkEvent(),
        onRemoved:__mkEvent(),
    };

    //chrome.history
    const history={
        search:(query,cb)=>__send('history.search',query,cb),
        getVisits:(details,cb)=>__send('history.getVisits',details,cb),
        addUrl:(details,cb)=>__send('history.addUrl',details,cb),
        deleteUrl:(details,cb)=>__send('history.deleteUrl',details,cb),
        deleteAll:(cb)=>__send('history.deleteAll',{},cb),
        onVisited:__mkEvent(),
        onVisitRemoved:__mkEvent(),
    };

    //chrome.bookmarks
    const bookmarks={
        get:(idOrList,cb)=>__send('bookmarks.get',{ids:idOrList},cb),
        getTree:(cb)=>__send('bookmarks.getTree',{},cb),
        search:(query,cb)=>__send('bookmarks.search',{query},cb),
        create:(bookmark,cb)=>__send('bookmarks.create',bookmark,cb),
        remove:(id,cb)=>__send('bookmarks.remove',{id},cb),
        onCreated:__mkEvent(),
        onRemoved:__mkEvent(),
        onChanged:__mkEvent(),
    };

    //chrome.downloads
    const downloads={
        download:(options,cb)=>__send('downloads.download',options,cb),
        search:(query,cb)=>__send('downloads.search',query,cb),
        pause:(id,cb)=>cb&&cb(),
        resume:(id,cb)=>cb&&cb(),
        cancel:(id,cb)=>cb&&cb(),
        onCreated:__mkEvent(),
        onChanged:__mkEvent(),
    };

    //chrome.identity
    const identity={
        getAuthToken:(details,cb)=>cb&&cb(undefined),
        launchWebAuthFlow:(details,cb)=>__send('identity.launchWebAuthFlow',details,cb),
        getRedirectURL:(path)=>'https://amethyst.invalid/'+__extId+'/'+(path||''),
        removeCachedAuthToken:(details,cb)=>cb&&cb(),
    };

    //chrome.commands
    const commands={
        getAll:(cb)=>__send('commands.getAll',{},cb),
        onCommand:__mkEvent(),
    };
    __listeners['commands.onCommand']=commands.onCommand._fire;

    //chrome.omnibox
    const omnibox={
        setDefaultSuggestion:(suggestion)=>__send('omnibox.setDefaultSuggestion',suggestion),
        onInputStarted:__mkEvent(),
        onInputChanged:__mkEvent(),
        onInputEntered:__mkEvent(),
        onInputCancelled:__mkEvent(),
    };

    //chrome.contentSettings
    const contentSettings={};

    //chrome.proxy
    const proxy={
        settings:{
            get:(details,cb)=>cb&&cb({value:{mode:'direct'},levelOfControl:'controlled_by_this_extension'}),
            set:(details,cb)=>cb&&cb(),
            clear:(details,cb)=>cb&&cb(),
        },
        onProxyError:__mkEvent(),
    };

    //chrome.system
    const system={
        cpu:{getInfo:(cb)=>cb&&cb({numOfProcessors:4,'arch-name':'x86-64',modelName:'Amethyst vCPU',features:[]})},
        memory:{getInfo:(cb)=>cb&&cb({capacity:8*1024*1024*1024,availableCapacity:4*1024*1024*1024})},
        storage:{getInfo:(cb)=>cb&&cb([])},
        display:{getInfo:(cb)=>cb&&cb([{id:'0',isPrimary:true,isInternal:false,isEnabled:true,bounds:{left:0,top:0,width:typeof screen!=='undefined'?screen.width:1920,height:typeof screen!=='undefined'?screen.height:1080}}])},
    };

    //chrome.power
    const power={
        requestKeepAwake:(level)=>{},
        releaseKeepAwake:()=>{},
    };

    //chrome.management
    const management={
        getSelf:(cb)=>__send('management.getSelf',{},cb),
        getAll:(cb)=>__send('management.getAll',{},cb),
        setEnabled:(id,enabled,cb)=>__send('management.setEnabled',{id,enabled},cb),
        uninstallSelf:(options,cb)=>__send('management.uninstallSelf',options||{},cb),
        onEnabled:__mkEvent(),
        onDisabled:__mkEvent(),
    };

    //chrome.webNavigation
    const webNavigation={
        getFrame:(details,cb)=>cb&&cb(null),
        getAllFrames:(details,cb)=>cb&&cb([]),
        onBeforeNavigate:__mkEvent(),
        onCommitted:__mkEvent(),
        onCompleted:__mkEvent(),
        onDOMContentLoaded:__mkEvent(),
        onErrorOccurred:__mkEvent(),
        onHistoryStateUpdated:__mkEvent(),
        onReferenceFragmentUpdated:__mkEvent(),
    };

    //chrome.tts
    const __ss=typeof speechSynthesis!=='undefined'?speechSynthesis:null;
    const tts={
        speak:(utterance,options,cb)=>{
            if (__ss){
                const u=new SpeechSynthesisUtterance(utterance);
                if (options?.lang)u.lang=options.lang;
                if (options?.rate)u.rate=options.rate;
                if (options?.pitch)u.pitch=options.pitch;
                if (options?.volume)u.volume=options.volume;
                __ss.speak(u);
            }
            cb&&cb();
        },
        stop:()=>__ss&&__ss.cancel(),
        isSpeaking:(cb)=>cb&&cb(__ss?__ss.speaking:false),
        getVoices:(cb)=>cb&&cb(__ss?__ss.getVoices().map(v=>({voiceName:v.name,lang:v.lang,remote:false,extensionId:''})):[]),
        onEvent:__mkEvent(),
    };

    //chrome.clipboard
    const clipboard={
        setImageData:(imageData,type,cb)=>cb&&cb(),
    };

    //chrome.fontSettings
    const fontSettings={
        getFont:(details,cb)=>cb&&cb({fontId:'Arial',levelOfControl:'controllable_by_this_extension'}),
        setFont:(details,cb)=>cb&&cb(),
        clearFont:(details,cb)=>cb&&cb(),
        onFontChanged:__mkEvent(),
    };

    //pipe
    __win.addEventListener('message',(e)=>{
        const d=e.data;
        if (!d||!d.__amethyst_reply||d.extId!==__extId) return;
        if (d.event==='runtime.onMessage'&&d.args) {
            const [message,sender]=d.args;
            const sendResponse=(resp)=>{
                __win.parent!==win?__win.parent.postMessage({__amethyst:true,type:'runtime.sendResponse',extId:__extId,tabId:__tabId,msgId:d.msgId,payload:{response:resp}},'*'):null;
            };
            runtime.onMessage._fire(message,sender,sendResponse);
        }
    });

    //build chrome obj
    __win.chrome={
        runtime,storage,tabs,windows,extension,i18n,contextMenus,notifications,cookies,webRequest,declarativeNetRequest,scripting,action,browserAction,pageAction,alarms,permissions,history,bookmarks,downloads,identity,commands,omnibox,contentSettings,proxy,system,power,management,webNavigation,tts,clipboard,fontSettings,
        app: {
            getDetails:()=>null,
            isInstalled:false,
            InstallState:{DISABLED:'disabled',INSTALLED:'installed',NOT_INSTALLED:'not_installed'},
            RunningState:{CANNOT_RUN:'cannot_run',READY_TO_RUN:'ready_to_run',RUNNING:'running'},
        },
        csi:()=>{},
        loadTimes:()=>({}),
    };

    const __origFetch=self.fetch;
    self.fetch=function(input,...args) {
        const url=typeof input==='string'?input:input?.url||'';
        if (url.startsWith('amethyst-ext://')){
            return new Promise((res,rej)=>{
                __send('fetch.extResource',{url},async (result)=>{
                    if (!result) {rej(new Error('not found'));return;}
                    const bytes=atob(result.data);
                    const arr=new Uint8Array(bytes.length);
                    for (let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
                    res(new Response(arr.buffer,{status:200,headers:{'Content-Type':result.mime}}));
                });
            });
        }
        return __origFetch.call(self,input,...args);
    };

    if (typeof XMLHttpRequest!=='undefined') {
        const __origXHROpen=XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open=function(method,url,...rest) {
            if (typeof url==='string'&&url.startsWith('amethyst-ext://')) {
                this.__amethystExtUrl=url;
            }
            return __origXHROpen.call(this,method,url,...rest);
        };
        const __origXHRSend=XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send=function(body) {
            if (this.__amethystExtUrl) {
                const xhr=this;
                __send('fetch.extResource',{url:this.__amethystExtUrl},(result)=>{
                    if (!result) {
                        Object.defineProperty(xhr,'status',{value:404});
                        xhr.dispatchEvent(new Event('error'));
                        return;
                    }
                    const bytes=atob(result.data);
                    const arr=new Uint8Array(bytes.length);
                    for (let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
                    Object.defineProperty(xhr,'status',{value:200});
                    Object.defineProperty(xhr,'response',{value:arr.buffer});
                    Object.defineProperty(xhr,'responseText',{value:new TextDecoder().decode(arr)});
                    xhr.dispatchEvent(new Event('load'));
                });
                return;
            }
            return __origXHRSend.call(this,body);
        };
    }

    __win.browser=__win.chrome;
    if (typeof self !== 'undefined' && self !== __win) {
        self.chrome=__win.chrome;
        self.browser=__win.chrome;
    }
    })();`;
}

/*
 *shim message handler
 *handle a message posted from the chrome shim
 *translates the shim's requests into amethyst operations
 */
async function handleShimMessage(event) {
    const d=event.data;
    if (!d||!d.__amethyst) return;
    const {type,extId,tabId,msgId,payload}=d;
    const source=event.source;

    function reply(result,error){
        if (!source) return;
        try {
            source.postMessage({__amethyst_reply:true,extId,tabId,msgId,result,error},'*');
        } catch (e) {}
    }

    function fireEvent(targetExtId,eventName,args) {
        const ext=_extensions[targetExtId];
        if (ext?.bgFrame) {
            try {
                ext.bgFrame.contentWindow?.postMessage({
                    __amethyst_reply:true,extId:targetExtId,tabId:null,msgId:null,
                    event:eventName,args
                },'*');
            } catch (e) {}
        }
    }

    switch(type) {
        //storage
        case 'storage.get': {
            const {area,keys}=payload;
            const result={};
            const allKeys=await dbGetAllKeys(EXT_STORAGE_STORE);
            const prefix=`${extId}/${area}/`;
            const relevantKeys=allKeys.filter(k=>k.startsWith(prefix));
            for (const k of relevantKeys) {
                const shortKey=k.slice(prefix.length);
                let include=false;
                if (keys===null||keys===undefined) include=true;
                else if (typeof keys==='string') include=shortKey===keys;
                else if (Array.isArray(keys)) include=keys.includes(shortKey);
                else if (typeof keys==='object') include=shortKey in keys;
                if (include) result[shortKey]=await dbGet(EXT_STORAGE_STORE,k);
            }
            if (typeof keys==='object'&&!Array.isArray(keys)&&keys!==null) {
                Object.entries(keys).forEach(([k,v])=>{
                    if (!(k in result)) result[k]=v;
                });
            }
            reply(result);
            break;
        }
        case 'storage.set': {
            const {area,items} = payload;
            for (const [key,value] of Object.entries(items)) {
                await dbPut(EXT_STORAGE_STORE,`${extId}/${area}/${key}`,value);
            }
            reply({});
            break;
        }
        case 'storage.remove': {
            const {area,keys}=payload;
            const arr=Array.isArray(keys)?keys:[keys];
            for (const key of arr) {
                await dbDelete(EXT_STORAGE_STORE,`${extId}/${area}/${key}`);
            }
            reply({});
            break;
        }
        case 'storage.clear': {
            const {area}=payload;
            const allKeys=await dbGetAllKeys(EXT_STORAGE_STORE);
            const prefix=`${extId}/${area}/`;
            for (const k of allKeys.filter(k=>k.startsWith(prefix))) {
                await dbDelete(EXT_STORAGE_STORE,k);
            }
            reply({});
            break;
        }
        
        //runtime
        case 'runtime.getManifest': {
            reply(_extensions[extId]?.manifest||{});
            break;
        }
        case 'runtime.sendMessage': {
            const {targetExt,message}=payload;
            const target=_extensions[targetExt||extId];
            if (!target?.bgFrame&&!target?.bgWorker) {reply(null);break;}

            const sender={
                tab:_buildTabObj(tabId),
                id:extId,
                frameId:0,
                url:_tabs?.[tabId]?.url||''
            };

            const msg={
                __amethyst_reply:true,
                extId:targetExt||extId,
                tabId,
                msgId:null,
                event:'runtime.onMessage',
                args:[message,sender,(resp)=>reply(resp)]
            };
            if (target.bgWorker) {
                try {target.bgWorker.postMessage(msg);} catch (e) {reply(null);}
            } else if (target.bgFrame?.contentWindow) {
                try {target.bgFrame.contentWindow.postMessage(msg,'*');} catch (e) {reply(null);}
            } else {
                reply(null);
            }
            break;
        }
        case 'runtime.openOptionsPage': {
            const ext=_extensions[extId];
            const optionsPage=ext?.manifest?.options_page||ext?.manifest.options_ui?.page;
            if (optionsPage) {
                const url=await readExtFileURL(extId,optionsPage);
                if (url&&_loadWebsite) _loadWebsite(url);
            }
            reply({});
            break;
        }
        
        //tabs
        case 'tabs.query': {
            const result=Object.entries(_tabs||{}).map(([id,t])=>_buildTabObj(id)).filter(Boolean);
            const q=payload;
            const filtered=result.filter(tab=>{
                if (q.active!==undefined&&q.active!==(tab.id==_getActiveTabId?.())) return false;
                if (q.url&&!tab.url?.includes(q.url)) return false;
                return true;
            });
            reply(filtered);
            break;
        }
        case 'tabs.get': {
            reply(_buildTabObj(payload.tabId));
            break;
        }
        case 'tabs.getCurrent': {
            reply(_buildTabObj(tabId));
            break;
        }
        case 'tabs.create': {
            if (_loadWebsite) _loadWebsite(payload.url||'');
            reply(_buildTabObj(tabId));
            break;
        }
        case 'tabs.update': {
            if (payload.updateProps?.url&&_loadWebsite) _loadWebsite(payload.updateProps.url);
            reply(_buildTabObj(payload.tabId||tabId));
            break;
        }
        case 'tabs.sendMessage': {
            const targetTabId=payload.tabId;
            const tabListeners=_tabMsgListeners[targetTabId]||[];
            tabListeners.forEach(fn=>{
                try {
                    fn(payload.message,{tab:_buildTabObj(tabId),id:extId},reply);
                } catch(e) {}
            });
            if (!tabListeners.length) reply(null);
            break;
        }
        case 'tabs.executeScript': {
            const iframe=_getIframe(payload.tabId||tabId);
            if (!iframe) {reply(null);break;}
            const details=payload.details||{};
            if (details.code) {
                try {
                    const result=iframe.contentWindow?.eval(details.code);
                    reply([result]);
                } catch (e) {reply(null);}
            } else if (details.file) {
                const code=await readExtFileText(extId,details.file);
                if (code) {
                    injectScript(iframe,code,extId);
                    reply([null]);
                } else {reply(null);}
            }
            break;
        }
        case 'tabs.insertCSS': {
            const iframe=_getIframe(payload.tabId||tabId);
            if (!iframe) {
                reply(null);
                break;
            }
            const details=payload.details||{};
            if (details.code) {
                injectCSS(iframe,details.code);
            } else if (details.file) {
                const css=await readExtFileText(extId,details.file);
                if (css) injectCSS(iframe,css);
            }
            reply(null);
            break;
        }
        case 'tabs.captureVisibleTab': {
            const iframe=_getIframe(tabId);
            reply(null);
            break;
        }

        //scripting (mv3)
        case 'scripting.executeScript': {
            const {target,func,args:scriptArgs,files}=payload;
            const tId=target?.tabId||tabId;
            const iframe=_getIframe(tId);
            if (!iframe) {reply(null);break;}
            if (func) {
                try {
                    const fn=new Function('return ('+func.toString()+')')()(... (scriptArgs||[]));
                    reply([{result:fn}]);
                } catch (e) {reply(null);}
            } else if (files?.length) {
                for (const file of files) {
                    const code=await readExtFileText(extId,file);
                    if (code) injectScript(iframe,code,extId);
                }
                reply([{result:null}]);
            } else {reply(null);}
            break;
        }
        case 'scripting.insertCSS': {
            const {target,css,files}=payload;
            const tId=target?.tabId||tabId;
            const iframe=_getIframe(tId);
            if (!iframe) {reply(null);break;}
            if (css) injectCSS(iframe,css);
            if (files?.length) {
                for (const file of files) {
                    const code=await readExtFileText(extId,file);
                    if (code) injectCSS(iframe,code);
                }
            }
            reply(null);
            break;
        }
        
        //action/browserAction
        case 'action.setBadgeText': {
            const {text}=payload;
            const ext=_extensions[extId];
            if (ext) ext._badgeText=text||'';
            _updateExtButton(extId);
            reply(null);
            break;
        }
        case 'action.setBadgeBackground': {
            const ext=_extensions[extId];
            if (ext) ext._badgeColor=payload.color;
            _updateExtButton(extId);
            reply(null);
            break;
        }
        case 'action.setIcon': {
            const ext=_extensions[extId];
            if (payload.imageData) {
                if (ext) ext._iconDataUrl=typeof payload.imageData==='object'?Object.values(payload.imageData)[0]:payload.imageData;
            } else if (payload.path) {
                const p =typeof payload.path==='object'?Object.values(payload.path)[0]:payload.path;
                const url=await readExtFileURL(extId,p);
                if (url&&ext) ext._iconUrl=url;
            }
            _updateExtButton(extId);
            reply(null);
            break;
        }
        case 'action.setTitle': {
            const ext=_extensions[extId];
            if (ext) ext._title=payload.title;
            _updateExtButton(extId);
            reply(null);
            break;
        }
        case 'action.setPopup': {
            const ext=_extensions[extId];
            if (ext) ext._popupPage=payload.popup;
            reply(null);
            break;
        }
        case 'action.openPopup': {
            openExtensionPopup(extId);
            reply(null);
            break;
        }

        //notifications
        case 'notifications.create': {
            const {options}=payload;
            if (_showNotif) _showNotif(options.title||'Extension',options.message||'');
            reply(payload.notifId);
            break;
        }
        case 'notifications.clear': {
            reply(true);
            break;
        }

        //cookies 
        case 'cookies.get': {
            const iframe=_getIframe(tabId);
            let val=null;
            if (iframe) {
                try {
                    const all=iframe.contentDocument?.cookie?.split(';')||[];
                    const found=all.find(c=>c.trim().startsWith(payload.name+'='));
                    if (found) {
                        const value=found.split('=').slice(1).join('=').trim();
                        val={name:payload.name,value,domain:payload.domain||'',path:'/'};
                    }
                } catch (e) {}
            }
            reply(val);
            break;
        }
        case 'cookies.set': {
            const iframe=_getIframe(tabId);
            if (iframe) {
                try {
                    let c=`${payload.name}=${payload.value}`;
                    if (payload.path) c+=`;path=${payload.path}`;
                    if (payload.domain) c+=`;domain=${payload.domain}`;
                    iframe.contentDocument.cookie=c;
                } catch (e) {}
            }
            reply(null);
            break;
        }
        case 'cookies.getAll': {
            reply([]);
            break;
        }

        //i18n
        case 'i18n.getMessage': {
            const {messageName,substitutions}=payload;
            const ext=_extensions[extId];
            const msg=ext?._messages?.[messageName];
            if (!msg) {reply('');break;}
            let text=msg.message||'';
            if (substitutions){
                const subs=Array.isArray(substitutions)?substitutions:[substitutions];
                subs.forEach((s,i)=>{text=text.replace(new RegExp('\\$'+(i+1),'g'),s);});
            }
            reply(text);
            break;
        }
        
        //contextMenus
        case 'contextMenus.create': {
            if (!_contextMenus[extId]) _contextMenus[extId]=[];
            _contextMenus[extId].push(payload);
            reply(payload.id);
            break;
        }
        case 'contextMenus.removeAll': {
            _contextMenus[extId]=[];
            reply(null);
            break;
        }

        //alarms
        case 'alarms.create': {
            if (!_alarms[extId]) _alarms[extId]={};
            const {name,alarmInfo}=payload;
            const alarmName=name||'';
            const existing=_alarms[extId][alarmName];
            if (existing?.timer) clearInterval(existing.timer);
            const delayMs=(alarmInfo?.delayInMinutes||0)*60000;
            const periodMs=(alarmInfo?.periodInMinutes)?alarmInfo.periodInMinutes*60000:null;
            const scheduledTime=Date.now()+delayMs;
            const fire=()=>{fireEvent(extId,'alarms.onAlarm',[{name:alarmName,scheduledTime,periodInMinutes:alarmInfo?.periodInMinutes}]);};
            let timer;
            if (periodMs) {
                timer=setTimeout(()=>{fire();setInterval(fire,periodMs);},delayMs);
            } else {
                timer=setTimeout(fire,delayMs);
            }
            _alarms[extId][alarmName]={alarmInfo,scheduledTime,timer};
            reply(null);
            break;
        }
        case 'alarms.get': {
            const alarm=_alarms[extId]?.[payload.name||''];
            reply(alarm?{name:payload.name||'',scheduledTime:alarm.scheduledTime,periodInMinutes:alarm.alarmInfo?.periodInMinutes}:null);
            break;
        }
        case 'alarms.getAll': {
            const all = Object.entries(_alarms[extId]||{}).map(([name,a])=>({
                name,scheduledTime:a.scheduledTime,periodInMinutes:a.alarmInfo?.periodInMinutes
            }));
            reply(all);
            break;
        }
        case 'alarms.clear': {
            const alarm=_alarms[extId]?.[payload.name||''];
            if (alarm?.timer) clearInterval(alarm.timer);
            if (_alarms[extId]) delete _alarms[extId][payload.name||''];
            reply(true);
            break;
        }

        //history
        case 'history.search': {
            const kryptonHistory=JSON.parse(localStorage.getItem('krypton_history')||'[]');
            const q=(payload.text||'').toLowerCase();
            const results=kryptonHistory
                .filter(h=>h.url?.toLowerCase().includes(q)||h.title?.toLowerCase().includes(q))
                .slice(0,payload.maxResults||100)
                .map(h=>({id:h.timestamp?.toString(),url:h.url,title:h.title,lastVisitTime:h.timestamp,visitCount:1}));
                reply(results);
                break;
        }
        case 'history.addUrl': {
            reply(null);
            break;
        }

        //bookmarks
        case 'bookmarks.getTree': {
            const bms=JSON.parse(localStorage.getItem('krypton_bookmarks')||'[]');
            const tree=[{
                id: '0', title:'Bookmarks bar',children:bms.map((b,i)=>({
                    id:String(i), title:b.title||b.url,url:b.url,parentId:'0'
                }))
            }];
            reply(tree);
            break;
        }
        case 'bookmarks.search': {
            const bms=JSON.parse(localStorage.getItem('krypton_bookmarks')||'[]');
            const q=typeof payload.query==='string'?payload.query.toLowerCase():'';
            reply(bms.filter(b=>b.url?.toLowerCase().includes(q)||b.title?.toLowerCase().includes(q))
                    .map((b,i)=>({id:String(i),title:b.title||'',url:b.url,parentId:'0'})));
            break;
        }
        case 'bookmarks.create': {
            const bms=JSON.parse(localStorage.getItem('krypton_bookmarks')||'[]');
            bms.push({url:payload.url,title:payload.title||payload.url});
            localStorage.setItem('krypton_bookmarks',JSON.stringify(bms));
            reply({id:String(bms.length-1),...payload});
            break;
        }

        //downloads
        case 'downloads.download': {
            const a=document.createElement('a');
            a.href=payload.url;
            if (payload.filename) a.download=payload.filename;
            else a.download='';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            reply(1);
            break;
        }

        //webRequest listeners
        case 'webRequest.addListener': {
            const {eventName,filter}=payload;
            if(!_webReqListeners[eventName]) _webReqListeners[eventName]=[];
            _webReqListeners[eventName].push({extId,filter});
            reply(null);
            break;
        }

        //declarativeNetRequest
        case 'dnr.updateDynamicRules': {
            const {addRules,removeRuleIds}=payload;
            if (!_extensions[extId]) break;
            const ext=_extensions[extId];
            if(!ext._dnrRules) ext._dnrRules=[];
            if (removeRuleIds) ext._dnrRules=ext._dnrRules.filter(r=>!removeRuleIds.includes(r.id));
            if (addRules) ext._dnrRules.push(...addRules);
            reply(null);
            break;
        }
        case 'dnr.getDynamicRules': {
            reply(_extensions[extId]?._dnrRules||[]);
            break;
        }

        //management
        case 'management.getSelf': {
            const ext=_extensions[extId];
            reply({id:extId,name:ext?.manifest?.name||'',version:ext?.manifest?.version||'',enabled:true,type:'extension'});
            break;
        }
        case 'management.getAll': {
            const all=Object.entries(_extensions).map(([id,ext])=>({
                id,name:ext.manifest?.name||'',version:ext.manifest?.version||'',enabled:ext.enabled,type:'extension'
            }));
            reply(all);
            break;
        }

        case 'fetch.extResource': {
            const url=payload.url;
            const match=url.match(/^amethyst-ext:\/\/([^/]+)\/(.+)$/);
            if (!match) {reply(null);break;}
            const [,resourceExtId,path]=match;
            const ab=await readExtFile(resourceExtId,path);
            if (!ab) {reply(null);break;}
            const bytes=new Uint8Array(ab);
            let bin='';
            for (let i=0;i<bytes.length;i+=8192) {
                bin+=String.fromCharCode(...bytes.subarray(i,i+8192));
            }
            reply({data:btoa(bin),mime:guessMime(path)});
            break;
        }

        //commands
        case 'commands.getAll': {
            const cmds=_extensions[extId]?.manifest?.commands||{};
            reply(Object.entries(cmds).map(([name,cmd])=>({
                name,description:cmd.description||'',shortcut:cmd.suggested_key?.default||''
            })));
            break;
        }

        default:
            reply(null);
    }
}

//helper utilities
function _buildTabObj(tabId) {
    if (!_tabs||!tabId) return null;
    const t=_tabs[tabId];
    if (!t) return null;
    return {
        id:parseInt(tabId),
        index:parseInt(tabId)-1,
        windowId:1,
        highlighted:true,
        active:tabId==_getActiveTabId?.(),
        pinned:false,
        audible:false,
        discarded:false,
        autoDiscardable:false,
        mutedInfo:{muted:false},
        url:t.url||'',
        title:t.title||'',
        favIconUrl:'',
        status:'complete',
        incognito:false,
        width:800,
        height:600,
    };
}

function _getIframe(tabId) {
    if (!_tabs||!tabId) return null;
    const t=_tabs[tabId];
    return t?.iframe||null;
}

function injectScript(iframe,code,extId) {
    try {
        const doc=iframe.contentDocument;
        if (!doc) return;
        const script=doc.createElement('script');
        script.textContent=code;
        (doc.head||doc.documentElement).appendChild(script);
    } catch (e) {
        console.warn('[amethyst] injectScript failed: ',e);
    }
}

function injectCSS(iframe,css) {
    try {
        const doc=iframe.contentDocument;
        if (!doc) return;
        const style=doc.createElement('style');
        style.textContent=css;
        (doc.head||doc.documentElement).appendChild(style);
    } catch (e) {
        console.warn('[amethyst] injectCSS failed: ',e);
    }
}

//background script runner
async function startBackground(extId) {
    const ext=_extensions[extId];
    if (!ext) return;
    const bgInfo=getBackgroundInfo(ext.manifest);
    if (!bgInfo) return;
    if (ext.bgFrame) {
        ext.bgFrame.remove();
        ext.bgFrame=null;
    }
    const bgFrame=document.createElement('iframe');
    bgFrame.style.cssText='position:fixed;width:0;height:0;border:none;opacity:0;pointer-events:none;z-index:-1;';
    bgFrame.setAttribute('sandbox','allow-scripts allow-same-origin');
    document.body.appendChild(bgFrame);
    ext.bgFrame=bgFrame;
    const shimCode=buildChromeShim(extId,null,true);
    if (bgInfo.type==='page') {
        const htmlContent=await readExtFileText(extId,bgInfo.page);
        if (!htmlContent) return;
        const injected=htmlContent.replace(
            /(<head[^>]*>)/i,
            `$1<script>${shimCode}<\/script>`
        );
        const rewritten=await rewriteExtHtml(extId, injected);
        const blob=new Blob([rewritten],{type:'text/html'});
        bgFrame.src=URL.createObjectURL(blob);
    } else if (bgInfo.type==='scripts') {
        let scriptTags='';
        for (const scriptPath of bgInfo.scripts) {
            const code=await readExtFileText(extId,scriptPath);
            if (code) {
                const safeCode=(await wrapExtScript(extId,code)).replace(/<\/script>/gi,'<\\/script>');
                scriptTags+=`<script>${safeCode}<\/script>\n`;
            }
        }
        const html=`<!DOCTYPE html><html><head>
        <script>${shimCode}</script>
        ${scriptTags}
        </head><body></body></html>`;
        const blob=new Blob([html],{type:'text/html'});
        bgFrame.src=URL.createObjectURL(blob);
    } else if (bgInfo.type==='worker') {
        bgFrame.remove();
        ext.bgFrame=null;
        const code=await readExtFileText(extId,bgInfo.script);
        if (!code) return;
        const workerCode=shimCode+'\n'+await wrapExtScript(extId,code);
        const blob=new Blob([workerCode],{type:'application/javascript'});
        const workerUrl=URL.createObjectURL(blob);
        try {
            const worker=new Worker(workerUrl);
            ext.bgWorker=worker;
            worker.addEventListener('message',(e)=>{
                handleShimMessage({data:e.data,source:{postMessage:(msg)=>worker.postMessage(msg)}});
            });
            setTimeout(()=>{
                ext.bgWorker?.postMessage({__amethyst_reply:true,extId,tabId:null,msgId:null,event:'runtime.onInstalled',args:[{reason:'install'}]});
                ext.bgWorker?.postMessage({__amethyst_reply:true,extId,tabId:null,msgId:null,event:'runtime.onStartup',args:[]});
            },100);
        } catch (e) {
            console.warn('[amethyst] worker start failed, falling back to iframe: ',e);
        }
    }
    
    bgFrame?.addEventListener('load',()=>{
        setTimeout(()=>{
            fireEvent2Ext(extId,'runtime.onInstalled',[{reason:'install'}]);
            fireEvent2Ext(extId,'runtime.onStartup',[]);
        },100);
    });
}

function fireEvent2Ext(extId,eventName,args) {
    const ext=_extensions[extId];
    if (!ext) return;
    const msg={__amethyst_reply:true,extId,tabId:null,msgId:null,event:eventName,args};
    if (ext.bgWorker) {
        try {ext.bgWorker.postMessage(msg);} catch (e) {}
    } else if (ext.bgFrame?.contentWindow) {
        try {ext.bgFrame.contentWindow.postMessage(msg,'*');} catch (e) {}
    }
}

//content script injector
export async function injectContentScripts(iframe,tabId,url) {
    if (!url||url==='krypton://new-tab') return;
    const shimCode={};
    const matching=_contentScriptReg.filter(cs=>cs.matches.some(p=>matchPattern(p,url)));
    if (!matching.length) return;
    console.log('[amethyst] url: ',url,'registered: ',_contentScriptReg.length,'matched: ',matching.length);
    await new Promise(res=>{
        if (iframe.contentDocument?.readyState==='complete'||iframe.contentDocument?.readyState==='interactive') {
            res();
        } else {
            iframe.addEventListener('load',res,{once:true});
        }
    });
    const byRunAt={document_start:[],document_end:[],document_idle:[]};
    for (const cs of matching) {
        const runAt=cs.runAt||'document_idle';
        byRunAt[runAt]?.push(cs);
    }
    async function injectGroup(group) {
        for (const cs of group) {
            if (!shimCode[cs.extId]) {
                shimCode[cs.extId]=buildChromeShim(cs.extId,tabId,false);
            }
            injectScript(iframe,shimCode[cs.extId],cs.extId);
            if (!_tabMsgListeners[tabId]) _tabMsgListeners[tabId]=[];
            const extId=cs.extId;
            _tabMsgListeners[tabId].push((message,sender,sendResponse)=>{
                try {
                    iframe.contentWindow?.postMessage({
                        __amethyst_reply:true,
                        extId,
                        tabId,
                        msgId:null,
                        event:'runtime.onMessage',
                        args:[message.sender,(resp)=>sendResponse(resp)]
                    },'*');
                } catch (e) {}
            });
            if (cs.css?.length) {
                for (const cssFile of cs.css) {
                    const css=await readExtFileText(cs.extId,cssFile);
                    if (css) injectCSS(iframe,css);
                }
            }
            if (cs.js?.length) {
                for (const jsFile of cs.js) {
                    const code=await readExtFileText(cs.extId,jsFile);
                    if(code){
                        const wrapped=await wrapExtScript(cs.extId,code);
                        injectScript(iframe,wrapped,cs.extId);
                    }
                }
            }
        }
    }
    await injectGroup(byRunAt.document_start);
    if (byRunAt.document_end.length) {
        iframe.addEventListener('load',async()=>{
            await injectGroup(byRunAt.document_end);
        },{once:true});
    }
    if (byRunAt.document_idle.length) {
        iframe.addEventListener('load',async()=>{
            setTimeout(async ()=>{
                await injectGroup(byRunAt.document_idle);
            },200);
        },{once:true});
    }

    for (const extId of [...new Set(matching.map(cs=>cs.extId))]) {
        fireEvent2Ext(extId,'tabs.onCompleted',[parseInt(tabId),{status:'loading'},_buildTabObj(tabId)]);
        iframe.addEventListener('load',()=>{
            fireEvent2Ext(extId,'tabs.onUpdated',[parseInt(tabId),{status:'complete'},_buildTabObj(tabId)]);
        },{once:true});
    }
}

//extension resource rewriter
async function rewriteExtHtml(extId,html) {
    const scriptRe=/<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
    const cssRe=/<link\s+[^>]*href=["']([^"']+\.css)["'][^>]*>/gi;
    let result=html;
    const scriptMatches=[...html.matchAll(scriptRe)];
    for (const m of scriptMatches) {
        const path=m[1].replace(/^\//,'');
        const code=await readExtFileText(extId, path);
        if (code) {
            const safeCode=code.replace(/<\/script>/gi,'<\\/script>');
            result=result.replace(m[0],`<script>${safeCode}<\/script>`);
        }
    }
    const cssMatches=[...result.matchAll(cssRe)];
    for (const m of cssMatches) {
        const path=m[1].replace(/^\//,'');
        const css=await readExtFileText(extId,path);
        if (css) {
            result=result.replace(m[0],`<style>${css}</style>`);
        }
    }
    return result;
}

async function wrapExtScript(extId,code) {
    return code;
}

//popup system
let _activePopup=null;

export async function openExtPopup(extId) {
    const ext=_extensions[extId];
    if (!ext) return;
    closeExtPopup();
    const popupPage=ext._popupPage
    ||ext.manifest?.action?.default_popup
    ||ext.manifest?.browser_action?.default_popup
    ||ext.manifest?.page_action?.default_popup;
    if (!popupPage) return;
    let htmlContent=await readExtFileText(extId,popupPage);
    if (!htmlContent) return;
    const shimCode=buildChromeShim(extId,_getActiveTabId?.(),false);
    htmlContent=htmlContent.replace(
        /(<head[^>]*>)/i,
        `$1<script>${shimCode}<\/script>`
    );
    htmlContent=await rewriteExtHtml(extId,htmlContent);
    const blob=new Blob([htmlContent],{type:'text/html'});
    const blobUrl=URL.createObjectURL(blob);
    const btn=document.querySelector(`[data-amethyst-extid="${extId}"]`);
    const rect=btn?.getBoundingClientRect()||{left:0,bottom:40,width:0};
    const wrapper=document.createElement('div');
    wrapper.id='amethyst-popup-wrapper';
    wrapper.style.cssText=`
    position:fixed;
    top:${rect.bottom+4}px;
    right:${window.innerWidth-rect.right}px;
    z-index:99999999999;
    background:#0f0f0f;
    border:1px solid #1a1a1a;
    border-radius:8px;
    box-shadow:0 8px 32px rgba(0,0,0,0.6);
    overflow:hidden;
    animation:amethystPopIn 0.5s cubic-bezier(0.34,1.56,0.64,1);`;

    if (!document.getElementById('amethyst-popup-style')) {
        const style=document.createElement('style');
        style.id='amethyst-popup-style';
        style.textContent=`
        @keyframes amethystPopIn {
            from {opacity:0;transform:translateY(-8px) scale(0.95);}
            to {opacity:1;transform:translateY(0) scale(1);}
        }`;
        document.head.appendChild(style);
    }

    const frame=document.createElement('iframe');
    frame.src=blobUrl;
    frame.style.cssText='border:none;display:block;min-width:200px;min-height:100px;max-width:800px;max-height:600px;';
    frame.addEventListener('load',()=>{
        try {
            const body = frame.contentDocument?.body;
            if (body) {
                const w=Math.min(Math.max(body.scrollWidth+2,200),800);
                const h=Math.min(Math.max(body.scrollHeight+2,100),600);
                frame.style.width=w+'px';
                frame.style.height=h+'px';
            }
        } catch (e) {}
    });
    wrapper.appendChild(frame);
    document.body.appendChild(wrapper);
    _activePopup=wrapper;

    setTimeout(()=>{
        document.addEventListener('click', _handlePopupOClick,{once:true});
    },50);
}

function _handlePopupOClick(e) {
    if (_activePopup&&!_activePopup.contains(e.target)) {
        closeExtPopup();
    }
}

export function closeExtPopup() {
    if (_activePopup) {
        _activePopup.remove();
        _activePopup=null;
    }
    document.removeEventListener('click',_handlePopupOClick);
}

//toolbar btn renderer
function _getDefaultIcon(manifest) {
    const icons=manifest.action?.default_icon
    ||manifest.browser_action?.default_icon
    ||manifest.page_action?.default_icon
    ||manifest.icons;
    if (!icons) return null;
    if (typeof icons==='string') return icons;
    const sizes=Object.keys(icons).map(Number).sort((a,b)=>b-a);
    return icons[sizes[0]]||icons[Object.keys(icons)[0]];
}

async function renderExtButton(extId) {
    const ext=_extensions[extId];
    if (!ext) return;
    const addressBar=document.querySelector('.address-bar');
    if (!addressBar) return;
    
    document.querySelector(`[data-amethyst-extid="${extId}"]`)?.remove();

    const btn=document.createElement('button');
    btn.className='nav-btn amethyst-ext-btn';
    btn.dataset.amethystExtid=extId;
    btn.title=ext._title||ext.manifest?.action?.default_title||ext.manifest?.browser_action?.default_title||ext.manifest?.name||'Extension';
    btn.style.position='relative';

    const iconPath=ext._iconUrl||(async () => {
        const defaultIconPath=_getDefaultIcon(ext.manifest);
        if (defaultIconPath) {
            return await readExtFileURL(extId,defaultIconPath);
        }
        return null;
    })();

    const iconEl=document.createElement('div');
    iconEl.style.cssText='width:16px;height:16px;display:flex;align-items:center;justify-content:center;';
    const resolvedIconUrl=ext._iconUrl||await (async () => {
        const p = _getDefaultIcon(ext.manifest);
        return p?readExtFileURL(extId,p):null;
    })();

    if (resolvedIconUrl) {
        const img=document.createElement('img');
        img.src=resolvedIconUrl;
        img.style.cssText='width:14px;height:14px;object-fit:contain;';
        img.onerror=()=>{iconEl.innerHTML='<i data-lucide="puzzle"></i>';iconEl.style.fontSize='12px';};
        iconEl.appendChild(img);
    } else {
        iconEl.innerHTML='<i data-lucide="puzzle"></i>';
        iconEl.style.fontSize='12px';
    }
    btn.appendChild(iconEl);
    if (ext._badgeText) {
        const badge=document.createElement('div');
        badge.style.cssText=`
        position:absolute;
        bottom:2px;
        right:2px;
        background:${ext._badgeColor||'#ef4444'};
        color:${ext._badgeColor?'#000':'#fff'};
        font-size:8px;
        font-weight:700;
        padding:1px 3px;
        border-radius:4px;
        font-weight:'Geist';
        min-width:8px;
        text-align:center;
        line-height:1.2;
        pointer-events:none;`;
        badge.textContent=ext._badgeText;
        btn.appendChild(badge);
    }

    btn.addEventListener('click',(e)=>{
        e.stopPropagation();
        fireEvent2Ext(extId,'action.onClicked',[_buildTabObj(_getActiveTabId?.())]);
        fireEvent2Ext(extId,'browserAction.onClicked',[_buildTabObj(_getActiveTabId?.())]);
        openExtPopup(extId);
    });

    const menuWpr=addressBar.querySelector('.menu-wpr');
    if (menuWpr) addressBar.insertBefore(btn,menuWpr);
    else addressBar.appendChild(btn);

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _updateExtButton(extId) {
    renderExtButton(extId);
}

//context menu injection
export function injectContextMenu(iframe,tabId,url) {
    iframe.addEventListener('load',()=>{
        try {
            const doc=iframe.contentDocument;
            if (!doc) return;
            const code=`
            document.addEventListener('contextmenu',function(e) {
                e.preventDefault();
                window.parent.postMessage({
                    __amethyst_contextmenu:true,
                    x:e.clientX,y:e.clientY,
                    targetTag:e.target.tagName,
                    targetSrc:e.target.src || e.target.href || '',
                    selectedText:window.getSelection().toString(),
                    pageUrl:location.href,
                    tabId:${JSON.stringify(tabId)},
                },'*');
            });`;
            const script=doc.createElement('script');
            script.textContent=code;
            (doc.head||doc.documentElement).appendChild(script);
        } catch (e) {}
    });
}

function showContextMenu(x,y,items) {
    document.getElementById('amethyst-ctx-menu')?.remove();
    if (!items.length) return;
    const menu=document.createElement('div');
    menu.id='amethyst-ctx-menu';
    menu.style.cssText=`
    position:fixed;
    top:${y}px;
    left:${x}px;
    background:#0f0f0f;
    border:1px solid #1a1a1a;
    border-radius:6px;
    min-width:160px;
    z-index:99999999999;
    box-shadow:0 8px 24px rgba(0,0,0,0.5);
    overflow:hidden;
    padding:4px 0;
    animation:amethystPopIn 0.12s ease;
    font-family:'Geist',sans-serif;`;
    for (const item of items) {
        if (item.type==='separator') {
            const sep=document.createElement('div');
            sep.style.cssText='height:1px;background:#1a1a1a;margin:4px 0;';
            menu.appendChild(sep);
            continue;
        }
        const el=document.createElement('div');
        el.style.cssText='padding: 8px 14px;font-size:13px;color:#e0e0e0;cursor:pointer;transition:background 0.15s;';
        el.textContent=item.title;
        el.addEventListener('mouseover',()=>el.style.background='#1a1a1a');
        el.addEventListener('mouseout',()=>el.style.background='');
        el.addEventListener('click',()=>{
            item.onclick?.();
            menu.remove();
        });
        menu.appendChild(el);
    }
    document.body.appendChild(menu);
    document.addEventListener('click',()=>menu.remove(),{once:true});
    document.addEventListener('contextmenu',()=>menu.remove(),{once:true});
}

window.addEventListener('message',(e)=>{
    if (!e.data?.__amethyst_contextmenu) return;
    const {x,y,tabId,selectedText,targetTag,targetSrc,pageUrl}=e.data;
    const menuItems=[];
    const info={
        menuItemId:'',
        editable:false,
        pageUrl,
        selectionText:selectedText,
        srcUrl:targetTag==='IMG'||targetTag==='VIDEO'?targetSrc:undefined,
        linkUrl:targetTag==='A'?targetSrc:undefined,
    };

    for (const [extId,items] of Object.entries(_contextMenus)) {
        for (const item of items) {
            const contexts=item.contexts||['all'];
            let relevant=contexts.includes('all')||contexts.includes('page');
            if (selectedText&&contexts.includes('selection')) relevant=true;
            if (info.linkUrl&&contexts.includes('link')) relevant=true;
            if (info.srcUrl&&contexts.includes('image')) relevant=true;

            if (relevant) {
                menuItems.push({
                    title:item.title,
                    onclick:()=>{
                        const clickInfo = {...info,menuItemId:item.id};
                        fireEvent2Ext(extId,'contextMenus.onClicked',[clickInfo,_buildTabObj(tabId)]);
                        if (item.onclick) item.onclick(clickInfo,_buildTabObj(tabId));
                    }
                });
            }
        }
        if (menuItems.length) menuItems.push({type:'separator'});
    }
    if (menuItems.length) {
        if (menuItems[menuItems.length-1]?.type==='separator') menuItems.pop();
        showContextMenu(x,y,menuItems);
    }
});

// dnr engine
export function checkDNR(requestUrl,initiatorUrl,resourceType) {
    for (const[extId,ext] of Object.entries(_extensions)) {
        if (!ext.enabled) continue;
        const rules=[
            ...(ext._dnrRules||[]),
            ...(ext._staticRules||[])
        ];
        for (const rule of rules) {
            const cond=rule.condition||{};
            if (cond.urlFilter) {
                const pattern=cond.urlFilter
                    .replace(/[.+^${}()|[\]\\]/g,'\\$&')
                    .replace(/\*/g,'.*')
                    .replace(/\|\|/g,'(?:https?://)(?:[^/]*\\.)?')
                    .replace(/\^/g,'[/?&#]');
                try {
                    if (!new RegExp(pattern,'i').test(requestUrl)) continue;
                } catch (e) {continue;}
            }
            if (cond.regexFilter) {
                try {
                    if (!new RegExp(cond.regexFilter,'i').test(requestUrl)) continue;
                } catch (e) {continue;}
            }
            if (cond.resourceTypes?.length) {
                if (!cond.resourceTypes.includes(resourceType)) continue;
            }
            if (cond.initiatorDomains?.length) {
                try {
                    const init=new URL(initiatorUrl).hostname;
                    if (!cond.initiatorDomains.some(d=>init===d||init.endsWith('.'+d))) continue;
                } catch (e) {continue;}
            }
            if (cond.excludedInitiatorDomains?.length) {
                try {
                    const init=new URL(initiatorUrl).hostname;
                    if (cond.excludedInitiatorDomains.some(d=>init===d||init.endsWith('.'+d))) continue;
                } catch (e) {}
            }
            const action=rule.action||{};
            if (action.type==='block') return {action:'block'};
            if (action.type==='redirect') {
                const redirectUrl=action.redirect?.url||action.redirect?.regexSubstitution;
                if (redirectUrl) return {action:'redirect',url:redirectUrl};
            }
            if (action.type==='upgradeScheme') {
                return {action:'redirect',url:requestUrl.replace(/^http:/,'https:')};
            }
            if (action.type==='modifyHeaders') {
                return {action:'modifyHeaders',headers:action.requestHeaders||[],responseHeaders:action.responseHeaders||[]};
            }
        }
    }
    return null;
}

//keyboard shortcut handler
function initKeyboardShortcuts() {
    document.addEventListener('keydown',(e)=>{
        for (const [extId,ext] of Object.entries(_extensions)) {
            if (!ext.enabled) continue;
            const commands=ext.manifest?.commands||{};
            for (const [cmdName,cmd] of Object.entries(commands)) {
                const shortcut=cmd.suggested_key?.default||cmd.suggested_key?.windows||'';
                if (!shortcut) continue;
                const parts=shortcut.toLowerCase().split('+').map(s=>s.trim());
                const needsCtrl=parts.includes('ctrl');
                const needsShift=parts.includes('shift');
                const needsAlt=parts.includes('alt');
                const key=parts.find(p=>!['ctrl','shift','alt','command'].includes(p));
                if (
                    (needsCtrl?e.ctrlKey||e.metaKey:true)&&
                    (needsShift?e.shiftKey:!e.shiftKey)&&
                    (needsAlt?e.altKey:!e.altKey)&&
                    key&&e.key.toLowerCase()===key
                ) {
                    e.preventDefault();
                    fireEvent2Ext(extId,'commands.onCommand',[cmdName]);
                }
            }
        }
    });
}

//extension loader
async function loadExtension(meta) {
    const {id:extId,manifest}=meta;
    _extensions[extId]={
        manifest,
        enabled:meta.enabled!==false,
        _badgeText:'',
        _badgeColor:null,
        _iconUrl:null,
        _title:null,
        _popupPage:null,
        _dnrRules:[],
        _staticRules:[],
        _messages:{},
        bgFrame:null,
        bgWorker:null,
    };
    const ext=_extensions[extId];
    await loadMessages(extId,manifest);

    const contentScripts=manifest.content_scripts||[];
    for (const cs of contentScripts) {
        _contentScriptReg.push({
            extId,
            matches:cs.matches||[],
            excludeMatches:cs.exclude_matches||[],
            js:cs.js||[],
            css:cs.css||[],
            runAt:cs.run_at||'document_idle',
            allFrames:cs.all_frames||false,
        });
    }
    //load static DNR
    if (manifest.declarative_net_request?.rule_resources) {
        for (const ruleSet of manifest.declarative_net_request.rule_resources) {
            if (ruleSet.enabled!==false&&ruleSet.path) {
                const rules=await readExtFileText(extId,ruleSet.path);
                if (rules) {
                    try {
                        ext._staticRules.push(...JSON.parse(rules));
                    } catch (e) {
                        console.warn('[amethyst] failed to parse rule set: ',ruleSet.path,e);
                    }
                }
            }
        }
    }
    await renderExtButton(extId);
    if (ext.enabled) {
        await startBackground(extId);
    }
}

async function loadMessages(extId,manifest) {
    const ext=_extensions[extId];
    const defaultLocale=manifest.default_locale||'en';
    const msgPath=`_locales/${defaultLocale}/messages.json`;
    const msgText=await readExtFileText(extId,msgPath);
    if (msgText) {
        try {
            ext._messages=JSON.parse(msgText);
        } catch (e) {}
    }
    if (!Object.keys(ext._messages).length&&defaultLocale!=='en') {
        const enText=await readExtFileText(extId,'_locales/en/messages.json');
        if (enText) {
            try {ext._messages=JSON.parse(enText);} catch (e) {}
        }
    }
}

//ext manager ui
export function openExtManager() {
    document.getElementById('amethyst-manager')?.remove();
    const overlay=document.createElement('div');
    overlay.id='amethyst-manager';

    overlay.style.cssText=`
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.85);
    backdrop-filter:blur(8px);
    z-index:999999999999;
    display:flex;
    align-items:center;
    justify-content:center;
    font-family:'Geist',sans-serif;
    animation:fadeIn 0.2s ease;`;

    const panel=document.createElement('div');
    panel.style.cssText=`
    background:#0a0a0a;
    border:1px solid #1a1a1a;
    border-radius:12px;
    width:520px;
    max-width:95vw;
    max-height:80vh;
    display:flex;
    flex-direction:column;
    overflow:hidden;
    box-shadow:0 20px 60px rgba(0,0,0,0.6);`;

    const header=document.createElement('div');
    header.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #1a1a1a;flex-shrink:0;';
    header.innerHTML=`
    
    <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:28px;height:28px;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;"><i data-lucide="gem"></i></div>
        <div>
            <div style="font-size:14px;font-weight:600;color:#e0e0e0;">amethyst</div>
            <div style="font-size:11px;color:#505050;">extension runtime</div>
        </div>
    </div>
    <button id="amethyst-mgr-close" style="background:transparent;border:none;color:#808080;cursor:pointer;font-size:18px;padding:4px;border-radius:4px;"><i data-lucide="x"></i></button>
    `;

    const installArea=document.createElement('div');
    installArea.style.cssText='padding:12px 20px;border-bottom:1px solid #1a1a1a;flex-shrink:0;';
    installArea.innerHTML=`
    <div style="display:flex;gap:8px;align-items:center;">
        <label for="amethyst-crx-input" style="flex:1;">
            <div style="background:#0f0f0f;border:1px dashed #2a2a2a;border-radius:8px;padding:10px 14px;cursor:pointer;transition:border-color:0.2s;text-align:center;font-size:12px;color:#505050;" id="amethyst-drop-zone">
                Drop crx or zip here or click to browse
            </div>
            <input type="file" id="amethyst-crx-input"accept=".crx,.zip" style="display:none;">
        </label>
    </div>`;
    
    const list=document.createElement('div');
    list.id='amethyst-ext-list';
    list.style.cssText='flex:1;overflow-y:auto;padding:12px 20px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;scrollbar-color:#2a2a2a transparent;';

    panel.appendChild(header);
    panel.appendChild(installArea);
    panel.appendChild(list);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    _refreshExtList(list);

    document.getElementById('amethyst-mgr-close').addEventListener('click',()=>overlay.remove());
    overlay.addEventListener('click',(e)=>{if (e.target===overlay)overlay.remove();});

    const fileInput=document.getElementById('amethyst-crx-input');
    const dropZone=document.getElementById('amethyst-drop-zone');

    fileInput.addEventListener('change',async (e)=>{
        const file=e.target.files[0];
        if (!file) return;
        await _handleInstallFile(file,list);
    });

    dropZone.addEventListener('dragover',(e)=>{e.preventDefault();dropZone.style.borderColor='#a78bfa';});
    dropZone.addEventListener('dragleave',()=>{dropZone.style.borderColor='#2a2a2a';});
    dropZone.addEventListener('drop',async (e)=>{
        e.preventDefault();
        dropZone.style.borderColor='#2a2a2a';
        const file=e.dataTransfer.files[0];
        if (file) await _handleInstallFile(file,list);
    });
}

async function _handleInstallFile(file,list) {
    const dropZone=document.getElementById('amethyst-drop-zone');
    if (dropZone) {
        dropZone.textContent=`Installing ${file.name}...`;
        dropZone.style.color='#a78bfa';
    }
    try {
        const buffer=await file.arrayBuffer();
        const extId =await installExtension(buffer,file.name);
        const ext=_extensions[extId];
        if (_showNotif) _showNotif('Extension installed',`${ext?.manifest?.name||file.name} is now active.`);
        _refreshExtList(list);
    } catch (err) {
        if (_showNotif) _showNotif('Install failed',err.message);
        console.error('[amethyst] install error: ',err);
    }
    if (dropZone) {
        dropZone.textContent='Drop crx or zip here, or click to browse';
        dropZone.style.color='#505050';
    }
}

function _refreshExtList(list) {
    list.innerHTML='';
    const exts=Object.entries(_extensions);
    if(!exts.length) {
        list.innerHTML='<div style="color:#505050;font-size:12px;text-align:center;padding:20px;">No extensions installed. Drop a .crx or .zip to install one.</div>';
        return;
    }
    for (const [extId,ext] of exts) {
        const card=document.createElement('div');
        card.style.cssText=`
        background:#0f0f0f;
        border:1px solid #1a1a1a;
        border-radius:8px;
        padding:12px 14px;
        display:flex;
        align-items:center;
        gap:12px;
        transition:border-color 0.2s;`;

        card.addEventListener('mouseover',()=>card.style.borderColor='#2a2a2a');
        card.addEventListener('mouseout',()=>card.style.borderColor='#1a1a1a');

        const iconEl=document.createElement('div');
        iconEl.style.cssText=`
        width:36px;
        height:36px;
        flex-shrink:0;
        border-radius:8px;
        overflow:hidden;
        background:#1a1a1a;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:18px;`;
        
        const iconPath=_getDefaultIcon(ext.manifest);
        if (iconPath) {
            readExtFileURL(extId,iconPath).then(url=>{
                if (url) {
                    const img=document.createElement('img');
                    img.src=url;
                    img.style.cssText='width:100%;height:100%;object-fit:contain;';
                    iconEl.innerHTML='';
                    iconEl.appendChild(img);
                }
            });
        } else {
            iconEl.innerHTML='<i data-lucide="puzzle"></i>';
        }
        const info = document.createElement('div');
        info.style.cssText=`flex:1;min-width:0;`;
        info.innerHTML=`
        <div style="font-size:13px;font-weight:500;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ext.manifest.name||'Unknown'}</div>
        <div style="font-size:11px;color:#505050;margin-top:2px;">v${ext.manifest.version||'?'} - MV${getMV(ext.manifest)}</div>`;
        
        const actions=document.createElement('div');
        actions.style.cssText='display:flex;gap:6px;flex-shrink:0;';

        const toggleBtn = document.createElement('button');
        toggleBtn.style.cssText=`
        padding:4px 10px;
        border-radius:4px;
        font-size:11px;
        font-family:'Geist';
        cursor:pointer;
        border:1px solid ${ext.enabled?'#1a3a1a':'#2a2a2a'};
        background: ${ext.enabled?'rgba(34,197,94,0.1)':'transparent'};
        color:${ext.enabled?'#22c55e':'#808080'};
        transition: all 0.2s;`;
        toggleBtn.textContent=ext.enabled?'On':'Off';
        toggleBtn.addEventListener('click',async ()=>{
            ext.enabled=!ext.enabled;
            const stored=await dbGet(EXT_STORE,extId);
            if (stored) {stored.enabled=ext.enabled;await dbPut(EXT_STORE,null,stored);}
            if (ext.enabled) {
                await startBackground(extId);
                await renderExtButton(extId);
            } else {
                ext.bgFrame?.remove();
                ext.bgFrame=null;
                document.querySelector(`[data-amethyst-extid="${extId}"]`)?.remove();
            }
            _refreshExtList(list);
        });

        const removeBtn = document.createElement('button');
        removeBtn.style.cssText="padding:4px 10px;border-radius:4px;font-size:11px;font-family:'Geist';cursor:pointer;border:1px solid rgba(239,68,68,0.2);background:transparent;color:#ef4444;transition:all 0.2s;";
        removeBtn.textContent='Remove';
        removeBtn.addEventListener('click', async ()=>{
            await uninstallExtension(extId);
            _refreshExtList(list);
        });

        actions.appendChild(toggleBtn);
        actions.appendChild(removeBtn);
        card.appendChild(iconEl);
        card.appendChild(info);
        card.appendChild(actions);
        list.appendChild(card);
    }
}

//uninstall
export async function uninstallExtension(extId) {
    const ext=_extensions[extId];
    if (!ext) return;

    ext.bgFrame?.remove();
    ext.bgWorker?.terminate();

    document.querySelector(`[data-amethyst-extid="${extId}"]`)?.remove();

    const toRemove=_contentScriptReg.filter(cs=>cs.extId===extId);
    toRemove.forEach(cs=>{
        const i=_contentScriptReg.indexOf(cs);
        if (i>-1) _contentScriptReg.splice(i,1);
    });

    delete _extensions[extId];
    delete _contextMenus[extId];
    delete _alarms[extId];

    await dbDelete(EXT_STORE,extId);
    const allFileKeys=await dbGetAllKeys(EXT_FILES_STORE);
    for (const k of allFileKeys.filter(k=>k.startsWith(extId+'/'))) {
        await dbDelete(EXT_FILES_STORE,k);
    }
    const allStorageKeys=await dbGetAllKeys(EXT_STORAGE_STORE);
    for (const k of allStorageKeys.filter(k=>k.startsWith(extId+'/'))) {
        await dbDelete(EXT_STORAGE_STORE,k);
    }

    console.log('[amethyst] uninstalled ',extId);
}

//get all installed exts
export function getInstalledExts() {
    return Object.entries(_extensions).map(([id,ext])=>({
        id,
        name:ext.manifest?.name,
        version:ext.manifest?.version,
        enabled:ext.enabled,
        manifest:ext.manifest,
    }));
}

//init
export async function init(opts={}) {
    _tabs=opts.tabs||{};
    _loadWebsite=opts.loadWebsite||null;
    _showNotif=opts.showNotif||null;
    _getActiveTabId=opts.getActiveTabId||null;

    window.addEventListener('message',handleShimMessage);

    const stored=await dbGetAll(EXT_STORE);
    for (const meta of stored) {
        try {
            await loadExtension(meta);
        } catch (e) {
            console.error('[amethyst] failed to load extension: ',meta.id,e);
        }
    }
    initKeyboardShortcuts();
    _hook();
    console.log(`[amethyst] ready, ${stored.length} extension(s) loaded`);
}

function _hook() {
    const drMenu=document.getElementById('drMenu');
    if (!drMenu) return;

    const existing=document.getElementById('amethystExtItem');
    if (existing) return;

    const item=document.createElement('div');
    item.id='amethystExtItem';
    item.className='menu-item';
    item.innerHTML=`
    <i data-lucide="puzzle"></i>
    <span>Extensions</span>`;
    item.addEventListener('click',()=>{
        drMenu.classList.remove('show');
        openExtManager();
    });

    const aboutItem=document.getElementById('aboutItem');
    if (aboutItem) drMenu.insertBefore(item,aboutItem);
    else drMenu.appendChild(item);
    lucide.createIcons();
}

const amethyst={
    init,
    installExtension,
    uninstallExtension,
    injectContentScripts,
    injectContextMenu,
    openExtPopup,
    closeExtPopup,
    getInstalledExts,   
    checkDNR,
};

export default amethyst;