import test from 'node:test';
import assert from 'node:assert/strict';

const extensionId = 'worker-test';
const hostUrl = `chrome-extension://${extensionId}/host.html`;
const token = 'session-token-at-least-sixteen';
const defaults = {version: 1, shortcuts: [{id: 'example', title: 'Example', url: 'https://example.com/'}]};
let importNumber = 0;

function event() {
  const listeners = [];
  return {listeners, addListener(listener) { listeners.push(listener); }};
}

function storageArea(values) {
  return {
    async get(key) {
      if (typeof key === 'string') return structuredClone({[key]: values[key]});
      return structuredClone(values);
    },
    async set(value) { Object.assign(values, structuredClone(value)); }
  };
}

async function setup(t) {
  const previousChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const previousFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  t.after(async () => {
    // Let the worker's fire-and-forget startup reconciliation finish first.
    await new Promise(resolve => setImmediate(resolve));
    if (previousChrome) Object.defineProperty(globalThis, 'chrome', previousChrome);
    else delete globalThis.chrome;
    if (previousFetch) Object.defineProperty(globalThis, 'fetch', previousFetch);
    else delete globalThis.fetch;
  });
  const tabs = new Map([
    [1, {id: 1, windowId: 10, url: hostUrl, active: false}],
    [2, {id: 2, windowId: 10, url: 'chrome://newtab/', active: true}],
    [3, {id: 3, windowId: 10, url: hostUrl, active: false}],
    [4, {id:4,windowId:10,url:`chrome-extension://${extensionId}/source.html`,active:false}]
  ]);
  const windows = new Map([[10, {id: 10, type: 'normal', state: 'normal', focused: true}]]);
  const session = {}, local = {}, createdTabs = [], updatedWindows = [], broadcasts = [], contexts = [{documentId:"ready-source",frameId:0,tabId:4,contextType:"TAB",documentUrl:`chrome-extension://${extensionId}/source.html`}], creations = [], badges = [], availability = [], reloads = [];
  const snapshot = populate => structuredClone([...windows.values()].map(window => {
    if (!populate || window.tabs !== undefined) return window;
    return {...window, tabs: [...tabs.values()].filter(tab => tab.windowId === window.id)};
  }));
  const api = {
    runtime: {
      id: extensionId,
      getURL: path => `chrome-extension://${extensionId}/${path}`,
      onMessage: event(),onInstalled:event(),onStartup:event(),
      getContexts(filter,callback){const found=structuredClone(contexts.filter(c=>(!filter.documentUrls||filter.documentUrls.includes(c.documentUrl))&&(!filter.documentIds||filter.documentIds.includes(c.documentId))&&(!filter.contextTypes||filter.contextTypes.includes(c.contextType))));if(callback){callback(found);return;}return Promise.resolve(found);},
      async sendMessage(message) { broadcasts.push(structuredClone(message)); return {ok:true,tabId:message.tabId}; }
    },
    storage: {session: storageArea(session), local: storageArea(local)},
    action: {onClicked: event(),async setBadgeText(value){badges.push(value);},async setTitle(){},async disable(){availability.push(false);},async enable(){availability.push(true);}},
    windows: {
      onCreated:event(),onRemoved: event(), onFocusChanged: event(), onBoundsChanged: event(),
      async getAll(options = {}) { return snapshot(options.populate); },
      async get(id, options = {}) {
        const value = snapshot(options.populate).find(window => window.id === id);
        if (!value) throw Error('Window missing');
        return value;
      },
      async update(id, changes) {
        if (!windows.has(id)) throw Error('Window missing');
        updatedWindows.push([id, structuredClone(changes)]);
        Object.assign(windows.get(id), structuredClone(changes));
        return structuredClone(windows.get(id));
      }
    },
    tabs: {
      onActivated: event(), onUpdated: event(), onAttached: event(), onDetached: event(), onRemoved: event(),
      async reload(id){reloads.push(id);tabs.get(id).status="loading";},
      async get(id) {
        if (!tabs.has(id)) throw Error('Tab missing');
        return structuredClone(tabs.get(id));
      },
      async query(query) {
        return structuredClone([...tabs.values()].filter(tab =>
          (query.url === undefined || query.url === tab.url) &&
          (query.windowId === undefined || query.windowId === tab.windowId) &&
          (query.active === undefined || query.active === tab.active)));
      },
      async update(id, changes) {
        if (!tabs.has(id)) throw Error('Tab missing');
        Object.assign(tabs.get(id), structuredClone(changes));
        return structuredClone(tabs.get(id));
      },
      async create(properties) {
        createdTabs.push(structuredClone(properties));
        if(properties.active!==false)for(const tab of tabs.values())if(tab.windowId===(properties.windowId??10))tab.active=false;
        const tab = {id: Math.max(...tabs.keys()) + 1, windowId: 10, active:true,...properties};
        tabs.set(tab.id, tab);
        return structuredClone(tab);
      }
    }
  };
  globalThis.chrome = api;
  globalThis.fetch = async url => {
    assert.equal(url, api.runtime.getURL('shortcuts.json'));
    return {async json() { return structuredClone(defaults); }};
  };
  await import(`../extension/worker.js?worker-test=${++importNumber}`);
  assert.equal(api.runtime.onMessage.listeners.length, 1);
  const listener = api.runtime.onMessage.listeners[0];
  const sender = (id = 1) => ({id: extensionId, url: hostUrl, tab: structuredClone(tabs.get(id))});
  async function message(value, source = sender()) {
    let complete;
    const response = new Promise(resolve => { complete = resolve; });
    const retained = listener(value, source, complete);
    if (retained === false) return undefined;
    assert.equal(retained, true, 'asynchronous runtime response channel stays open');
    return response;
  }
  // Status also waits for controller initialization through the actual handler.
  assert.equal((await message({type: 'status'})).ok, true);
  return {api, tabs, windows, session, local, createdTabs, updatedWindows, broadcasts, contexts, creations, badges, availability,reloads,snapshot, sender, message};
}

function addPip(x, id = 20) {
  x.windows.set(id, {id, type: 'normal', alwaysOnTop: true, state: 'normal', focused: false, tabs: [{url: hostUrl}]});
}

async function activate(x) {
  assert.equal((await x.message({type: 'prepare', token})).ok, true);
  addPip(x);
  const result = await x.message({type: 'register', token});
  assert.equal(result.ok, true);
  return result.state;
}

// Each subtest awaits completion so global chrome/fetch cannot leak between workers.
test('worker runtime API boundary', {concurrency: false}, async t => {
  await t.test('denies external ids and non-host sources without side effects', async t => {
    const x = await setup(t);
    const sources = [
      {...x.sender(), id: 'other-extension'},
      {...x.sender(), url: 'https://example.com/host.html'},
      {...x.sender(), url: `chrome-extension://${extensionId}/other.html`},
      {...x.sender(), url: 'chrome-extension://other-extension/host.html'},
      {...x.sender(), tab: undefined}
    ];
    for (const source of sources) {
      for (const value of [{type: 'prepare', token}, {type: 'save', data: defaults}, {type: 'newtab'}]) {
        const result = await x.message(value, source);
        assert.equal(result.ok, false);
        assert.equal(typeof result.error, 'string');
      }
    }
    assert.deepEqual(x.session, {});
    assert.deepEqual(x.local, {});
    assert.deepEqual(x.createdTabs, []);
    assert.equal(await x.message({type: 'state', state: {hostTabId: 99}}, sources[0]), undefined);
    assert.equal((await x.message({type: 'status'})).state, null);
  });

  await t.test('prepare snapshots windows and register chooses the newly created normal PiP', async t => {
    const x = await setup(t);
    const before = x.snapshot(true).map(window => ({id: window.id}));
    assert.deepEqual(await x.message({type: 'prepare', token}), {ok: true});
    assert.deepEqual(x.session.attempt, {hostTabId: 1, token, before});
    x.windows.set(30, {id: 30, type: 'normal', state: 'normal', tabs: []});
    x.windows.set(40, {id: 40, type: 'popup', alwaysOnTop: true, state: 'normal', tabs: []});
    addPip(x);
    const result = await x.message({type: 'register', token});
    assert.equal(result.ok, true);
    assert.equal(result.state.hostTabId, 1);
    assert.equal(result.state.hostWindowId, 10);
    assert.equal(result.state.pipWindowId, 20);
    assert.equal(result.state.token, token);
    assert.deepEqual(result.state.target, {tabId: 2, windowId: 10});
    assert.equal(x.session.attempt, null);
    assert.equal(x.session.binding.pipWindowId, 20);
    assert.equal((await x.message({type: 'register', token})).ok, false, 'attempt is one-use');
  });

  await t.test('register requires the prepared token and source tab', async t => {
    const x = await setup(t);
    assert.equal((await x.message({type: 'register', token})).ok, false);
    assert.equal((await x.message({type: 'prepare', token})).ok, true);
    addPip(x);
    assert.equal((await x.message({type: 'register', token: 'different-token-at-least-sixteen'})).ok, false);
    assert.equal((await x.message({type: 'register', token}, x.sender(3))).ok, false);
    assert.equal((await x.message({type: 'status'})).state, null);
    assert.equal(x.session.attempt.token, token);
    assert.deepEqual(x.updatedWindows, []);
    assert.equal((await x.message({type: 'register', token})).ok, true);
  });

  await t.test('rejects unsafe shortcut JSON and persists a valid replacement', async t => {
    const x = await setup(t);
    for (const url of ['javascript:alert(1)', 'file:///tmp/example', 'https://user:password@example.com/']) {
      const data = {version: 1, shortcuts: [{id: 'unsafe', title: 'Unsafe', url}]};
      const result = await x.message({type: 'save', data});
      assert.equal(result.ok, false);
      assert.deepEqual(x.local, {});
      assert.deepEqual((await x.message({type: 'status'})).data, defaults);
    }
    const data = {version: 1, shortcuts: [{id: 'safe', title: 'Safe', url: 'https://example.org/'}]};
    assert.deepEqual(await x.message({type: 'save', data}), {ok: true});
    assert.deepEqual(x.local.shortcuts, data);
    assert.deepEqual((await x.message({type: 'status'})).data, data);
    await activate(x);
    assert.equal((await x.message({type: 'navigate', id: 'safe', mode: 'current', token})).ok, true);
    assert.equal(x.tabs.get(2).url, 'https://example.org/');
  });

  await t.test('newtab explicitly creates the native Chrome page', async t => {
    const x = await setup(t);
    assert.deepEqual(await x.message({type: 'newtab'}), {ok: true});
    assert.deepEqual(x.createdTabs, [{windowId: 10, url: 'chrome://newtab/'}]);
  });

  await t.test('active host A prevents shortcut editing from host B', async t => {
    const x = await setup(t);
    await activate(x);
    const data = {version: 1, shortcuts: [{id: 'replacement', title: 'Replacement', url: 'https://example.org/'}]};
    const result = await x.message({type: 'save', data, token}, x.sender(3));
    assert.equal(result.ok, false);
    assert.deepEqual(x.local, {});
    assert.deepEqual((await x.message({type: 'status'})).data, defaults);
    assert.equal(x.session.binding.hostTabId, 1);
    assert.equal((await x.message({type: 'save', data, token})).ok, true);
    assert.deepEqual(x.local.shortcuts, data);
  });

  await t.test('prepare refuses an already existing always-on-top PiP', async t => {
    const x = await setup(t);
    addPip(x);
    const result = await x.message({type: 'prepare', token});
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
    assert.equal(x.session.attempt, undefined);
    assert.equal((await x.message({type: 'status'})).state, null);
    assert.deepEqual(x.updatedWindows, []);
  });
  await t.test('blank PiP discovery keeps only structural evidence without foreign URLs', async t => {
    const x=await setup(t);
    await x.message({type:'prepare',token});
    x.windows.set(20,{id:20,type:'normal',alwaysOnTop:true,state:'normal',tabs:[{id:99,url:'about:blank'}]});
    assert.equal((await x.message({type:'register',token})).ok,true);
    const result=await x.message({type:'status'});
    assert.equal(result.discovery.after.find(w=>w.id===20).tabs[0].urlClass,'blank');
    assert.equal(JSON.stringify(result.discovery).includes('about:blank'),false);
    assert.deepEqual(result.discovery.before,[10]);
  });
});



const sourceSender=x=>({id:extensionId,url:`chrome-extension://${extensionId}/source.html`,documentId:'ready-source',tab:structuredClone(x.tabs.get(4))});
const click=x=>{x.api.action.onClicked.listeners[0]({id:2,windowId:10});return x.broadcasts.filter(m=>m.type==='launch').at(-1);};

test('one toolbar click creates an NTP and PiP without opening a visible control page', {concurrency:false},async t=>{
 const x=await setup(t);await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(x.createdTabs,[]);assert.equal(x.availability.at(-1),true);
 const launch=click(x),source=sourceSender(x);assert.equal(launch.target,'source');
 assert.equal((await x.message({type:'begin',launchId:launch.launchId},source)).ok,true);
 assert.equal((await x.message({type:'begin',launchId:launch.launchId},{...source,documentId:'fake'})).ok,false);
 addPip(x);x.windows.get(20).tabs=[];
 const registered=await x.message({type:'register',token:launch.launchId},source);assert.equal(registered.ok,true);
 assert.equal(registered.state.hostTabId,4);assert.equal(registered.state.sourceDocumentId,'ready-source');
 assert.deepEqual(x.createdTabs,[{windowId:10,url:'chrome://newtab/'}]);
 assert.equal(x.tabs.get(4).active,false);assert.equal(registered.state.target.tabId,5);
 assert.equal((await x.message({type:'register',token:launch.launchId},source)).ok,false);
});

test('source initialization creates only an inactive source tab and waits for readiness', {concurrency:false},async t=>{
 const x=await setup(t);await new Promise(resolve=>setImmediate(resolve));x.tabs.delete(4);x.contexts.length=0;
 x.api.tabs.onRemoved.listeners.at(-1)?.(4);
 // The dedicated source-removal listener is registered before reconciliation.
 x.api.tabs.onRemoved.listeners[0](4);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(x.createdTabs.length,1);assert.equal(x.createdTabs[0].active,false);
 assert.equal(x.createdTabs[0].url,`chrome-extension://${extensionId}/source.html`);
 assert.equal(x.availability.at(-1),false,'button stays disabled until source-ready');
 const tab=[...x.tabs.values()].find(t=>t.url.endsWith('/source.html'));
 x.contexts.push({tabId:tab.id,documentId:'new-source',contextType:'TAB',documentUrl:tab.url});
 assert.equal((await x.message({type:'source-ready'},{id:extensionId,url:tab.url,tab,documentId:'new-source'})).ok,true);
 assert.equal(x.availability.at(-1),true);
});

test('missing source reports failure without a foreground jump', {concurrency:false},async t=>{
 const x=await setup(t);x.contexts.length=0;click(x);await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(x.createdTabs,[]);assert.ok(x.badges.some(b=>b.text==='!'));
});

test('delayed earlier launch completion cannot erase a later failure', {concurrency:false},async t=>{
 const x=await setup(t);await new Promise(resolve=>setImmediate(resolve));let finish;
 x.api.runtime.sendMessage=message=>{x.broadcasts.push(message);if(message.type==='source-ping')return Promise.resolve({ok:true,tabId:message.tabId});return new Promise(resolve=>{finish=resolve;});};
 click(x);x.contexts.length=0;click(x);await new Promise(resolve=>setImmediate(resolve));
 const error=x.session.lastLaunch.error;finish({ok:true});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(x.session.lastLaunch.error,error);assert.equal(x.badges.at(-1).text,'!');
});

test('reuse opens NTP before visibility control and retries a paused restore', {concurrency:false},async t=>{
 const x=await setup(t),source=sourceSender(x);let launch=click(x);
 await x.message({type:'begin',launchId:launch.launchId},source);addPip(x);x.windows.get(20).tabs=[];
 const registered=await x.message({type:'register',token:launch.launchId},source);assert.equal(registered.ok,true);
 x.tabs.get(2).url='https://example.com/';for(const tab of x.tabs.values())tab.active=tab.id===2;
 const changes=x.updatedWindows.length;launch=click(x);
 assert.equal((await x.message({type:'begin',launchId:launch.launchId},source)).ok,true);
 assert.equal(x.updatedWindows.length,changes);
 const result=await x.message({type:'reuse',launchId:launch.launchId,token:registered.state.token},source);
 assert.equal(result.ok,true);assert.equal(result.state.visibility,'normal');
});

test('changing click during discovery cannot use a later window as an earlier target', {concurrency:false},async t=>{
 const x=await setup(t),source=sourceSender(x),first=click(x);const original=x.api.windows.getAll;let release,entered;
 const boundary=new Promise(resolve=>{entered=resolve;});
 x.api.windows.getAll=async options=>{if(options?.populate){entered();await new Promise(resolve=>{release=resolve;});}return original(options);};
 const beginning=x.message({type:'begin',launchId:first.launchId},source);await boundary;click(x);release();
 assert.equal((await beginning).ok,false);assert.equal(x.session.attempt,undefined);assert.deepEqual(x.createdTabs,[]);
});

test('concurrent register consumes one verified source click once', {concurrency:false},async t=>{
 const x=await setup(t),source=sourceSender(x),launch=click(x);
 await x.message({type:'begin',launchId:launch.launchId},source);addPip(x);x.windows.get(20).tabs=[];
 const results=await Promise.all([x.message({type:'register',token:launch.launchId},source),x.message({type:'register',token:launch.launchId},source)]);
 assert.equal(results.filter(r=>r.ok).length,1);assert.equal(x.createdTabs.length,1);
});

test('source navigation disables startup and prepares a replacement inactive tab', {concurrency:false},async t=>{
 const x=await setup(t);await new Promise(resolve=>setImmediate(resolve));
 x.tabs.get(4).url='https://example.com/';x.contexts[0].documentUrl='https://example.com/';
 for(const listener of x.api.tabs.onUpdated.listeners)listener(4,{status:'loading',url:x.tabs.get(4).url},x.tabs.get(4));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(x.availability.at(-1),false);assert.deepEqual(x.createdTabs,[{windowId:10,url:`chrome-extension://${extensionId}/source.html`,active:false}]);
});
test('completed unresponsive source is reloaded only once rather than keeping a dead disabled button', {concurrency:false},async t=>{
 const x=await setup(t);await new Promise(resolve=>setImmediate(resolve));x.tabs.get(4).status='complete';
 x.api.runtime.sendMessage=async()=>undefined;
 x.api.windows.onCreated.listeners[0]({id:30});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(x.reloads,[4]);assert.equal(x.availability.at(-1),false);
 x.tabs.get(4).status='complete';x.api.windows.onCreated.listeners[0]({id:30});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(x.reloads,[4]);assert.ok(x.session.lastLaunch.error);
});
