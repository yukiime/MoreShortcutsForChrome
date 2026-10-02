import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,defaults} from './helpers/api.mjs';
async function setup(){const {createPanelService}=await import('../extension/panel-service.js');const f=fixture();return {...f,service:createPanelService(f.api,defaults)};}
test('panel messages validate identity, path, active tab, window and pending URL before reading or editing',async()=>{
  for(const mutate of [f=>f.sender.id='other',f=>f.sender.url='chrome-extension://abc/diagnostics.html',f=>f.tabs[0].active=false,f=>f.tabs[0].windowId=4,f=>f.tabs[0].pendingUrl='https://example.org/']){
    const f=await setup();mutate(f);
    for(const type of ['shortcuts:get','shortcuts:edit','preferences:get','preferences:set','frequent:get'])await assert.rejects(f.service.handle({type,id:'one',title:'Changed',url:'example.net',revision:0,frequentSitesEnabled:true},f.sender));
    assert.equal(f.data.shortcutDocument,undefined);assert.equal(f.data.panelPreferences,undefined);assert.equal(f.searches(),0);
  }
});
test('worker edits persist and subsequent navigation uses saved URL',async()=>{
  const f=await setup();await f.service.handle({type:'shortcuts:edit',id:'one',title:'Changed',url:'example.net',revision:0},f.sender);
  await f.service.handle({type:'navigate',shortcutId:'one',disposition:'current'},f.sender);
  assert.equal(f.tabs[0].url,'https://example.net/');
});
test('disabled setting and denied history permission never query history',async()=>{
  const f=await setup();await assert.rejects(f.service.handle({type:'frequent:get'},f.sender));assert.equal(f.searches(),0);
  await f.service.handle({type:'preferences:set',frequentSitesEnabled:true},f.sender);f.revoke();
  await assert.rejects(f.service.handle({type:'frequent:get'},f.sender));assert.equal(f.searches(),0);
});
test('frequent navigation accepts only an unexpired token in its own window',async()=>{
  const f=await setup();await f.service.handle({type:'preferences:set',frequentSitesEnabled:true},f.sender);
  const result=await f.service.handle({type:'frequent:get'},f.sender);
  const request={type:'navigate',source:'frequent',shortcutId:'example.net',token:result.token,disposition:'background'};
  await assert.rejects(f.service.handle({...request,token:'wrong'},f.sender));
  await assert.rejects(f.service.handle(request,{id:'abc',url:'chrome-extension://abc/panel.html?tabId=8&windowId=4'}));
  await f.service.handle(request,f.sender);
  f.service.invalidateHistory();await assert.rejects(f.service.handle(request,f.sender));
});
test('permission removal, history deletion and closing the setting invalidate in-flight rankings',async()=>{
  for(const change of ['removed','deleted','disabled','closed']){
    const f=await setup();await f.service.handle({type:'preferences:set',frequentSitesEnabled:true},f.sender);
    let finish,started;const hasStarted=new Promise(r=>started=r);
    f.api.history.search=()=>{started();return new Promise(r=>finish=r);};
    const pending=f.service.handle({type:'frequent:get'},f.sender);await hasStarted;
    if(change==='disabled')await f.service.handle({type:'preferences:set',frequentSitesEnabled:false},f.sender);
    else if(change==='closed')await f.service.handle({type:'frequent:clear'},f.sender);
    else {if(change==='removed')f.revoke();f.service.invalidateHistory();}
    finish([{id:'h',url:'https://example.net/',visitCount:8}]);await assert.rejects(pending,/过期|关闭|授权/);
  }
});
test('history failure and moved target during the query do not return a usable ranking',async()=>{
  const f=await setup();await f.service.handle({type:'preferences:set',frequentSitesEnabled:true},f.sender);
  f.api.history.search=async()=>{throw Error('history failed');};await assert.rejects(f.service.handle({type:'frequent:get'},f.sender),/history failed/);
  f.api.history.search=async()=>{f.tabs[0].windowId=4;return [];};await assert.rejects(f.service.handle({type:'frequent:get'},f.sender));
});
