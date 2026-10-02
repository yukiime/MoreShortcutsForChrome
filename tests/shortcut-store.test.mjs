import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShortcutEdit } from '../extension/core.js';
const defaults = [{ id:'one', title:'One', url:'https://example.com/', icon:'1', color:'#123456' }, { id:'two', title:'Two', url:'https://example.org/', icon:'2', color:'#234567' }];
function fixture() {
  const data = {}; let fail = false;
  const api = { storage: { local: { get: async key => structuredClone({[key]:data[key]}), set: async value => { if (fail) throw Error('disk'); Object.assign(data, structuredClone(value)); } } } };
  return {api, data, fail: () => {fail=true;}};
}
test('normalizes bare domains and rejects explicit unsafe schemes, credentials and empty titles', () => {
  assert.deepEqual(normalizeShortcutEdit({title:' Example ',url:'example.com'}),{title:'Example',url:'https://example.com/'});
  for (const url of ['javascript:alert(1)','file:///tmp/test','data:text/html,test','https://user:pass@example.com/','https://','']) assert.throws(() => normalizeShortcutEdit({title:'One',url}));
  assert.throws(() => normalizeShortcutEdit({title:' ',url:'example.com'}));
});
test('edits survive store recreation and keep order, IDs and icons', async () => {
  const { createShortcutStore } = await import('../extension/shortcut-store.js');
  const f=fixture(), store=createShortcutStore(f.api,defaults);
  const result = await store.edit({id:'one',title:'Changed',url:'example.net',revision:0});
  assert.equal(result.revision,1); assert.equal(result.shortcuts[0].url,'https://example.net/');
  assert.equal(result.shortcuts[0].icon,'1'); assert.equal(result.shortcuts[1].id,'two');
  assert.deepEqual(await createShortcutStore(f.api,defaults).read(),result);
});
test('storage failure preserves document and stale concurrent revision cannot overwrite', async () => {
  const { createShortcutStore } = await import('../extension/shortcut-store.js');
  const f=fixture(), store=createShortcutStore(f.api,defaults);
  const results=await Promise.allSettled([store.edit({id:'one',title:'First',url:'example.net',revision:0}),store.edit({id:'one',title:'Second',url:'example.edu',revision:0})]);
  assert.equal(results[0].status,'fulfilled'); assert.equal(results[1].status,'rejected');
  f.fail(); await assert.rejects(store.edit({id:'one',title:'Lost',url:'example.edu',revision:1}));
  assert.equal((await store.read()).shortcuts[0].title,'First');
});
test('corrupt persisted documents fail instead of resetting personal data', async () => {
  const { createShortcutStore } = await import('../extension/shortcut-store.js');
  const f=fixture(); f.data.shortcutDocument={version:1,revision:-1,shortcuts:defaults};
  await assert.rejects(createShortcutStore(f.api,defaults).read());
});
test('preferences default off, persist across recreation, reject non-booleans and retain value on failure', async () => {
  const { createShortcutStore } = await import('../extension/shortcut-store.js');
  const f=fixture(), store=createShortcutStore(f.api,defaults);
  assert.deepEqual(await store.getPreferences(),{frequentSitesEnabled:false,autoOpenEnabled:false});
  await store.setPreferences({frequentSitesEnabled:true,autoOpenEnabled:false});
  assert.deepEqual(await createShortcutStore(f.api,defaults).getPreferences(),{frequentSitesEnabled:true,autoOpenEnabled:false});
  await assert.rejects(store.setPreferences({frequentSitesEnabled:'yes'}));
  await store.setPreferences({frequentSitesEnabled:false,autoOpenEnabled:false});
  assert.deepEqual(await createShortcutStore(f.api,defaults).getPreferences(),{frequentSitesEnabled:false,autoOpenEnabled:false});
  f.fail(); await assert.rejects(store.setPreferences({frequentSitesEnabled:true,autoOpenEnabled:false}));
  assert.deepEqual(await store.getPreferences(),{frequentSitesEnabled:false,autoOpenEnabled:false});
});
