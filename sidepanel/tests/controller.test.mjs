import test from 'node:test';
import assert from 'node:assert/strict';
import { createController, disableAllPanels } from '../extension/controller.js';

// Chrome API boundary double. It cannot prove Chrome's UI, gesture or restoration behavior.
function fixture(tabs = [
  { id: 7, windowId: 3, index: 1, active: true, url: 'chrome://newtab/' },
  { id: 8, windowId: 4, index: 0, active: true, url: 'https://example.org/' }
]) {
  const options = new Map(), effects = [];
  const api = {
    runtime: { id: 'abc', getURL: path => `chrome-extension://abc/${path}` },
    tabs: {
      get: async id => { const tab = tabs.find(t => t.id === id); if (!tab) throw new Error('No tab'); return { ...tab }; },
      query: async query => { effects.push(['query', query]); return tabs.filter(t => (query.windowId === undefined || t.windowId === query.windowId) && (!query.active || t.active)).map(t => ({ ...t })); },
      update: async (id, update) => { effects.push(['update', id, update]); Object.assign(tabs.find(t => t.id === id), update); },
      create: async details => { effects.push(['create', details]); return { id: 99, ...details }; }
    },
    sidePanel: {
      getOptions: async ({ tabId }) => options.get(tabId) ?? { enabled: false, path: 'panel.html' },
      setOptions: async value => { effects.push(['options', value]); options.set(value.tabId, { ...value }); },
      setPanelBehavior: async value => { effects.push(['behavior', value]); },
      close: async value => { effects.push(['close', value]); }
    },
    action: { enable: async () => {}, disable: async () => {}, setTitle: async () => {} }
  };
  const controller = createController(api, [{ id: 'one', title: 'Example', url: 'https://example.com/' }]);
  const sender = { id: 'abc', url: 'chrome-extension://abc/panel.html?tabId=7&windowId=3' };
  return { api, controller, options, effects, tabs, sender };
}

test('fresh worker rebuilds NTP eligibility with global panel disabled and no automatic open', async () => {
  const f = fixture();
  await f.controller.initialize();
  assert.equal(f.options.get(undefined)?.enabled, false);
  assert.equal(f.options.get(7)?.enabled, true);
  assert.equal(f.options.get(8)?.enabled, false);
  assert.match(f.options.get(7).path, /tabId=7&windowId=3/);
  assert.deepEqual(f.effects.find(e => e[0] === 'behavior'), ['behavior', { openPanelOnActionClick: false }]);
  const restarted = createController(f.api, []);
  await restarted.initialize();
  assert.equal(f.options.get(7)?.enabled, true);
});

test('switching tabs preserves the opened NTP configuration; same-tab pending navigation closes only its tab panel', async () => {
  const f = fixture();
  await f.controller.initialize();
  f.effects.length = 0;
  await f.controller.syncTab(8);
  assert.equal(f.effects.some(e => e[0] === 'close'), false);
  f.tabs[0].pendingUrl = 'https://example.net/';
  await f.controller.syncTab(7);
  assert.deepEqual(f.effects.find(e => e[0] === 'close'), ['close', { tabId: 7 }]);
  assert.equal(f.options.get(7).enabled, false);
  delete f.tabs[0].pendingUrl;
  await f.controller.syncTab(7);
  assert.equal(f.options.get(7).enabled, true);
});

test('an unexpected global opening is closed with windowId, never the tab close fallback', async () => {
  const f = fixture();
  await f.controller.panelOpened({ windowId: 3, path: 'panel.html' });
  assert.deepEqual(f.effects, [['close', { windowId: 3 }]]);
});

test('plain shortcut click replaces the bound active NTP even when a different window has an active tab', async () => {
  const f = fixture();
  await f.controller.navigate({ shortcutId: 'one', disposition: 'current' }, f.sender);
  assert.equal(f.tabs[0].url, 'https://example.com/');
  assert.equal(f.tabs[1].url, 'https://example.org/');
  assert.deepEqual(f.effects.find(e => e[0] === 'query'), ['query', { active: true, windowId: 3 }]);
});

test('modified click creates a background tab in the same explicit window', async () => {
  const f = fixture();
  await f.controller.navigate({ shortcutId: 'one', disposition: 'background' }, f.sender);
  assert.deepEqual(f.effects.find(e => e[0] === 'create'), ['create', { windowId: 3, index: 2, url: 'https://example.com/', active: false }]);
  assert.equal(f.tabs[0].url, 'chrome://newtab/');
});

test('stale, moved, foreign, non-NTP and unlisted navigation requests have no navigation side effects', async () => {
  for (const mutation of [
    f => { f.tabs[0].active = false; },
    f => { f.tabs[0].windowId = 4; },
    f => { f.sender.id = 'other'; },
    f => { f.sender.url = 'chrome-extension://abc/diagnostics.html'; },
    f => { f.tabs[0].pendingUrl = 'https://example.org/'; },
    f => { f.tabs[0].url = 'https://example.org/'; },
    f => { f.tabs.length = 0; }
  ]) {
    const f = fixture(); mutation(f);
    await assert.rejects(f.controller.navigate({ shortcutId: 'one', disposition: 'current' }, f.sender));
    assert.equal(f.effects.some(e => ['update', 'create'].includes(e[0])), false);
  }
  const f = fixture();
  await assert.rejects(f.controller.navigate({ shortcutId: 'unknown', disposition: 'current' }, f.sender));
  await assert.rejects(f.controller.navigate({ shortcutId: 'one', disposition: 'window' }, f.sender));
});

test('overlapping updates re-read the latest tab state instead of leaving a stale NTP panel enabled', async () => {
  const f = fixture();
  await f.controller.initialize();
  const first = f.controller.syncTab(7);
  f.tabs[0].pendingUrl = 'https://example.net/';
  const second = f.controller.syncTab(7);
  await Promise.all([first, second]);
  assert.equal(f.options.get(7).enabled, false);
});

test('a tab closing during startup does not strand the worker or prevent healthy NTP navigation', async () => {
  const f = fixture();
  const originalSetTitle = f.api.action.setTitle;
  f.api.action.setTitle = async details => {
    if (details.tabId === 8) { f.tabs.splice(1); throw new Error('No tab with id: 8'); }
    return originalSetTitle(details);
  };
  await f.controller.initialize();
  assert.equal(f.options.get(7).enabled, true);
  await f.controller.navigate({ shortcutId: 'one', disposition: 'current' }, f.sender);
  assert.equal(f.tabs[0].url, 'https://example.com/');
});

test('a tab moving windows or losing activation during the query is rejected before navigation', async () => {
  for (const mutate of [f => { f.tabs[0].windowId = 4; }, f => { f.tabs[0].active = false; }]) {
    const f = fixture();
    const originalQuery = f.api.tabs.query;
    f.api.tabs.query = async query => {
      const result = await originalQuery(query);
      mutate(f);
      return result;
    };
    await assert.rejects(f.controller.navigate({ shortcutId: 'one', disposition: 'current' }, f.sender));
    assert.equal(f.effects.some(e => ['update', 'create'].includes(e[0])), false);
  }
});

test('two simultaneous current-tab clicks cannot overwrite an already navigated page', async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f.controller.navigate({ shortcutId: 'one', disposition: 'current' }, f.sender),
    f.controller.navigate({ shortcutId: 'one', disposition: 'current' }, f.sender)
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal(f.effects.filter(e => e[0] === 'update').length, 1);
});

test('fatal startup cleanup disables prior tab-specific options as well as the global default', async () => {
  const f = fixture();
  await f.controller.initialize();
  assert.equal(f.options.get(7).enabled, true);
  await disableAllPanels(f.api);
  assert.equal(f.options.get(undefined).enabled, false);
  assert.equal(f.options.get(7).enabled, false);
  assert.equal(f.options.get(8).enabled, false);
});

test('navigation reads persisted edits inside the tab queue', async () => {
  const f=fixture();
  const controller=createController(f.api, [], async()=>{}, async()=>[{id:'one',url:'https://example.net/'}]);
  await controller.navigate({shortcutId:'one',disposition:'current'},f.sender);
  assert.equal(f.tabs[0].url,'https://example.net/');
});
test('panel reads and edits reject inactive, moved, foreign and pending-navigation contexts', async () => {
  for (const mutate of [f=>f.tabs[0].active=false, f=>f.tabs[0].windowId=4, f=>f.sender.id='other', f=>f.sender.url='chrome-extension://abc/diagnostics.html', f=>f.tabs[0].pendingUrl='https://example.org/']) {
    const f=fixture(); mutate(f); let called=false;
    await assert.rejects(f.controller.withPanelContext(f.sender,async()=>{called=true;}));
    assert.equal(called,false);
  }
});
test('panel operation can revalidate after asynchronous storage reads before committing', async () => {
  const f=fixture(); let written=false;
  await assert.rejects(f.controller.withPanelContext(f.sender,async(_,validate)=>{
    f.tabs[0].pendingUrl='https://example.org/'; await validate(); written=true;
  }));
  assert.equal(written,false);
});
