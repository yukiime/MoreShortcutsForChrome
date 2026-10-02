import test from 'node:test';
import assert from 'node:assert/strict';
import {panelFixture,flush,click,firstShortcut} from './helpers/dom.mjs';
async function setup(){const {mountPanel}=await import('../extension/panel-ui.js');const f=await panelFixture();await mountPanel(f.doc,f.api,{href:'chrome-extension://abc/panel.html?tabId=7&windowId=3'}).ready;return f;}
test('edit mode opens a side panel form without navigating and saves ID with original revision',async()=>{
  const f=await setup();click(f,'edit-mode');firstShortcut(f).dispatch('click');
  assert.equal(f.nodes.get('editor').hidden,false);assert.equal(f.calls.some(c=>c.type==='navigate'),false);
  f.nodes.get('edit-title').value='Changed';f.nodes.get('edit-url').value='https://example.net/';f.nodes.get('edit-title').dispatch('input');
  f.nodes.get('editor').dispatch('submit');await flush();
  assert.deepEqual(f.calls.find(c=>c.type==='shortcuts:edit'),{type:'shortcuts:edit',id:'one',title:'Changed',url:'https://example.net/',revision:0});
  assert.equal(f.nodes.get('editor').hidden,true);assert.match(firstShortcut(f).title,/Changed/);
});
test('failed save retains draft; cancel and Escape never write',async()=>{
  const f=await setup();click(f,'edit-mode');firstShortcut(f).dispatch('click');f.nodes.get('edit-title').value='Draft';f.nodes.get('edit-title').dispatch('input');f.failSave();f.nodes.get('editor').dispatch('submit');await flush();
  assert.equal(f.nodes.get('edit-title').value,'Draft');assert.equal(f.nodes.get('editor').hidden,false);assert.match(f.nodes.get('status').textContent,/disk failed/);
  click(f,'cancel-edit');firstShortcut(f).dispatch('click');f.doc.dispatch('keydown',{key:'Escape'});
  assert.equal(f.nodes.get('editor').hidden,true);assert.equal(f.calls.filter(c=>c.type==='shortcuts:edit').length,1);
});
test('another panel save preserves dirty draft and explicit version refresh enables a retry',async()=>{
  const f=await setup();click(f,'edit-mode');firstShortcut(f).dispatch('click');f.nodes.get('edit-title').value='Draft';f.nodes.get('edit-title').dispatch('input');
  f.data.revision=1;f.data.shortcuts[0].title='Remote';f.local.emit({shortcutDocument:{newValue:{version:1,...f.data}}},'local');await flush();
  assert.equal(f.nodes.get('edit-title').value,'Draft');assert.equal(f.nodes.get('refresh-version').hidden,false);
  click(f,'refresh-version');await flush();f.nodes.get('editor').dispatch('submit');await flush();assert.equal(f.calls.find(c=>c.type==='shortcuts:edit').revision,1);
});
test('frequent setting stays persistent across temporary collapse and resumes with shortcuts still visible',async()=>{
  const f=await setup();assert.equal(f.calls.some(c=>c.type==='frequent:get'),false);
  f.allow();f.nodes.get('frequent-enabled').checked=true;f.nodes.get('frequent-enabled').dispatch('change');await flush();
  assert.equal(f.nodes.get('frequent-section').hidden,false);assert.ok(firstShortcut(f));
  click(f,'collapse-frequent');await flush();assert.equal(f.nodes.get('frequent-section').hidden,true);
  assert.equal(f.calls.filter(c=>c.type==='preferences:set').length,1);
  f.doc.dispatch('visibilitychange');await flush();assert.equal(f.nodes.get('frequent-section').hidden,false);
  f.nodes.get('frequent-enabled').checked=false;f.nodes.get('frequent-enabled').dispatch('change');await flush();assert.equal(f.nodes.get('frequent-section').hidden,true);
});
test('permission request occurs immediately on real button callback and denial is displayed',async()=>{
  const f=await setup();f.nodes.get('frequent-enabled').checked=true;f.nodes.get('frequent-enabled').dispatch('change');await flush();
  click(f,'grant-history');assert.equal(f.calls.at(-1).type,'permission-request');await flush();assert.match(f.nodes.get('frequent-status').textContent,/授权|允许/);
});
test('closing during loading discards late responses and invalidation clears visible history',async()=>{
  const f=await setup();f.allow();let finish;
  const original=f.api.runtime.sendMessage;f.api.runtime.sendMessage=msg=>msg.type==='frequent:get'?new Promise(r=>finish=r):original(msg);
  f.nodes.get('frequent-enabled').checked=true;f.nodes.get('frequent-enabled').dispatch('change');await flush();
  click(f,'collapse-frequent');finish({ok:true,token:'late',sites:[{id:'private.test',title:'private.test',url:'https://private.test/',visitCount:8}]});await flush();
  assert.equal(f.nodes.get('frequent-section').hidden,true);assert.equal(f.nodes.get('frequent-list').children.length,0);
  f.messages.emit({type:'frequent:invalidated'},{id:'abc'});assert.equal(f.nodes.get('frequent-list').children.length,0);
});
test('external setting changes sync and query failures are shown as failures',async()=>{
  const f=await setup();f.allow();f.setPrefs({frequentSitesEnabled:true,autoOpenEnabled:false});const original=f.api.runtime.sendMessage;
  f.api.runtime.sendMessage=msg=>msg.type==='frequent:get'?Promise.resolve({ok:false,error:'incomplete scan'}):original(msg);
  f.local.emit({panelPreferences:{newValue:{version:1,frequentSitesEnabled:true}}},'local');await flush();
  assert.equal(f.nodes.get('frequent-enabled').checked,true);assert.match(f.nodes.get('frequent-status').textContent,/incomplete scan/);
});
