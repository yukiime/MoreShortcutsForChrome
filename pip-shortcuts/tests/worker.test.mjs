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
    [3, {id: 3, windowId: 10, url: hostUrl, active: false}]
  ]);
  const windows = new Map([[10, {id: 10, type: 'normal', state: 'normal', focused: true}]]);
  const session = {}, local = {}, createdTabs = [], updatedWindows = [], broadcasts = [];
  const snapshot = populate => structuredClone([...windows.values()].map(window => {
    if (!populate || window.tabs !== undefined) return window;
    return {...window, tabs: [...tabs.values()].filter(tab => tab.windowId === window.id)};
  }));
  const api = {
    runtime: {
      id: extensionId,
      getURL: path => `chrome-extension://${extensionId}/${path}`,
      onMessage: event(),
      async sendMessage(message) { broadcasts.push(structuredClone(message)); }
    },
    storage: {session: storageArea(session), local: storageArea(local)},
    action: {onClicked: event()},
    windows: {
      onRemoved: event(), onFocusChanged: event(), onBoundsChanged: event(),
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
      async get(id) {
        if (!tabs.has(id)) throw Error('Tab missing');
        return structuredClone(tabs.get(id));
      },
      async query(query) {
        return structuredClone([...tabs.values()].filter(tab =>
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
        const tab = {id: Math.max(...tabs.keys()) + 1, windowId: 10, ...properties};
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
  return {api, tabs, windows, session, local, createdTabs, updatedWindows, broadcasts, snapshot, sender, message};
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
