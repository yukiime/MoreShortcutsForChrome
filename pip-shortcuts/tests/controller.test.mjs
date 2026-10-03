import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../extension/controller.js';
const url='chrome-extension://test/host.html';
const binding={hostTabId:1,hostWindowId:10,pipWindowId:20,token:'token'};
function setup(saved=null){
 const tabs=new Map([[1,{id:1,windowId:10,url,active:false}],[2,{id:2,windowId:10,url:'chrome://newtab/',active:true}]]);
 const windows=new Map([[10,{id:10,type:'normal',focused:true,state:'normal'}],[20,{id:20,type:'normal',alwaysOnTop:true,focused:false,state:'normal',tabs:[]}]]);
 const writes=[],nav=[],session={binding:saved};
 const api={runtime:{getURL:p=>'chrome-extension://test/'+p},storage:{session:{get:async()=>structuredClone(session),set:async data=>Object.assign(session,structuredClone(data))}},windows:{getAll:async()=>structuredClone([...windows.values()]),get:async id=>{if(!windows.has(id))throw Error('missing window');return structuredClone(windows.get(id));},update:async(id,change)=>{writes.push([id,change]);Object.assign(windows.get(id),change);return structuredClone(windows.get(id));}},tabs:{get:async id=>{if(!tabs.has(id))throw Error('missing tab');return structuredClone(tabs.get(id));},query:async q=>structuredClone([...tabs.values()].filter(t=>t.windowId===q.windowId&&(!q.active||t.active))),update:async(id,change)=>{nav.push(['update',id,change]);Object.assign(tabs.get(id),change);},create:async change=>{nav.push(['create',change]);}}};
 return {api,tabs,windows,writes,nav,session,c:createController(api,[{id:'example',url:'https://example.com/'}])};
}
test('restores on NTP and minimizes on regular page without focus requests',async()=>{const x=setup();await x.c.register(binding);x.tabs.get(2).url='https://example.com/';await x.c.reconcile();assert.equal(x.windows.get(20).state,'minimized');x.tabs.get(2).url='chrome://newtab/';await x.c.reconcile();assert.equal(x.windows.get(20).state,'normal');assert.ok(x.writes.every(([,v])=>!('focused'in v)));});
test('PiP focus keeps target and allows current-tab navigation',async()=>{const x=setup();await x.c.register(binding);x.windows.get(10).focused=false;x.windows.get(20).focused=true;await x.c.reconcile(20);await x.c.openShortcut({id:'example',mode:'current',token:'token'});assert.equal(x.nav[0][1],2);assert.equal(x.nav[0][2].url,'https://example.com/');});
test('external application focus hides PiP and returning to Chrome restores the retained session',async()=>{
 const x=setup();await x.c.register(binding);x.windows.get(10).focused=false;
 for(const win of x.windows.values())win.focused=false;await x.c.reconcile(-1);await x.c.reconcile();
 assert.equal(x.windows.get(20).state,'minimized');
 assert.deepEqual(x.c.status().target,{tabId:2,windowId:10});
 x.windows.get(10).focused=true;await x.c.reconcile(10);
 assert.equal(x.windows.get(20).state,'normal');
 assert.equal(x.c.status().pipWindowId,20);
});

test('closing the active NTP hides without destroying the session and a new native tab restores it',async()=>{
 const x=setup();await x.c.register(binding);x.tabs.delete(2);x.tabs.get(1).active=true;
 await x.c.reconcile();assert.equal(x.windows.get(20).state,'minimized');
 assert.equal(x.c.status().pipWindowId,20);assert.equal(x.c.status().paused,false);
 x.tabs.get(1).active=false;x.tabs.set(3,{id:3,windowId:10,url:'chrome://newtab/',active:true});
 await x.c.reconcile();assert.equal(x.windows.get(20).state,'normal');
 assert.deepEqual(x.c.status().target,{tabId:3,windowId:10});
 assert.deepEqual(x.writes,[[20,{state:'minimized'}],[20,{state:'normal'}]]);
});

test('external focus still hides after the tracked Chrome tab navigates away from NTP',async()=>{
 const x=setup();await x.c.register(binding);for(const win of x.windows.values())win.focused=false;await x.c.reconcile(-1);
 x.tabs.get(2).pendingUrl='https://example.org/';await x.c.reconcile();
 assert.equal(x.windows.get(20).state,'minimized');assert.equal(x.c.status().target,null);
});

test('last selected Chrome window is retained across external focus and worker restoration',async()=>{
 const x=setup();x.windows.set(30,{id:30,type:'normal',state:'normal',focused:false});
 x.tabs.set(3,{id:3,windowId:30,url:'chrome://newtab/',active:true});
 await x.c.register(binding);x.windows.get(10).focused=false;x.windows.get(30).focused=true;
 await x.c.reconcile(30);x.windows.get(30).focused=false;for(const win of x.windows.values())win.focused=false;await x.c.reconcile(-1);
 assert.deepEqual(x.c.status().target,{tabId:3,windowId:30});
 const restarted=createController(x.api,[]);await restarted.ready;await restarted.reconcile();
 assert.deepEqual(restarted.status().target,{tabId:3,windowId:30});
 assert.equal(x.windows.get(20).state,'minimized');
});

test('external focus follows a newly active NTP in the same Chrome window rather than a stale tab',async()=>{
 const x=setup();await x.c.register(binding);for(const win of x.windows.values())win.focused=false;await x.c.reconcile(-1);
 x.tabs.get(2).active=false;x.tabs.set(3,{id:3,windowId:10,url:'chrome://newtab/',active:true});
 await x.c.reconcile();assert.deepEqual(x.c.status().target,{tabId:3,windowId:10});
 assert.equal(x.windows.get(20).state,'minimized');
});

test('rapid main-window then external focus retains the latest main window',async()=>{
 for(const page of ['https://example.org/','chrome://newtab/'])for(const viaPopup of [false,true]){
  const x=setup();await x.c.register(binding);
  x.windows.get(10).focused=false;
  x.windows.set(30,{id:30,type:'normal',state:'normal',focused:false});
  x.tabs.set(3,{id:3,windowId:30,url:page,active:true});
  const mainFocus=x.c.reconcile(30);
  x.windows.set(40,{id:40,type:'popup',state:'normal',focused:false});
  await Promise.all([mainFocus,...(viaPopup?[x.c.reconcile(40)]:[]),x.c.reconcile(-1)]);
  assert.equal(x.c.status().lastMainWindowId,30);
  assert.deepEqual(x.c.status().target,page==='chrome://newtab/'?{tabId:3,windowId:30}:null);
  assert.equal(x.windows.get(20).state,'minimized');
  const restarted=createController(x.api,[]);await restarted.ready;await restarted.reconcile();
  assert.equal(restarted.status().lastMainWindowId,30);
  assert.deepEqual(restarted.status().target,x.c.status().target);
 }
});

test('rapid PiP or popup focus then external focus does not replace the remembered main window',async()=>{
 for(const focusedId of [20,30]){
  const x=setup();await x.c.register(binding);x.windows.get(10).focused=false;
  x.windows.set(30,{id:30,type:'popup',state:'normal',focused:false});
  x.tabs.set(3,{id:3,windowId:30,url:'https://example.org/',active:true});
  await Promise.all([x.c.reconcile(focusedId),x.c.reconcile(-1)]);
  assert.equal(x.c.status().lastMainWindowId,10);
  assert.deepEqual(x.c.status().target,{tabId:2,windowId:10});
  assert.equal(x.windows.get(20).state,'minimized');
 }
});

test('completed popup reconciliation still remembers a preceding main-window focus',async()=>{
 const x=setup();await x.c.register(binding);x.windows.get(10).focused=false;
 x.windows.set(30,{id:30,type:'normal',state:'normal',focused:false});
 x.windows.set(40,{id:40,type:'popup',state:'normal',focused:false});
 x.tabs.set(3,{id:3,windowId:30,url:'https://example.org/',active:true});
 await Promise.all([x.c.reconcile(30),x.c.reconcile(40)]);
 for(const win of x.windows.values())win.focused=false;await x.c.reconcile(-1);
 assert.equal(x.c.status().lastMainWindowId,30);
 assert.equal(x.c.status().target,null);
 assert.equal(x.windows.get(20).state,'minimized');
});

test('minimized or closed tracked main window hides PiP during external focus',async()=>{
 for(const closed of [false,true]){
  const x=setup();await x.c.register(binding);for(const win of x.windows.values())win.focused=false;await x.c.reconcile(-1);
  if(closed)x.windows.delete(10);else x.windows.get(10).state='minimized';
  await x.c.reconcile();assert.equal(x.windows.get(20).state,'minimized');
 }
});
test('pending navigation rejects navigation and hides PiP',async()=>{const x=setup();await x.c.register(binding);x.tabs.get(2).pendingUrl='https://example.org/';await assert.rejects(x.c.openShortcut({id:'example',mode:'current',token:'token'}));assert.equal(x.nav.length,0);await x.c.reconcile();assert.equal(x.windows.get(20).state,'minimized');});
test('moved target cannot navigate another window',async()=>{const x=setup();await x.c.register(binding);x.tabs.get(2).windowId=30;await assert.rejects(x.c.openShortcut({id:'example',mode:'current',token:'token'}));assert.equal(x.nav.length,0);});
test('inactive target cannot navigate',async()=>{const x=setup();await x.c.register(binding);x.tabs.get(2).active=false;await assert.rejects(x.c.openShortcut({id:'example',mode:'current',token:'token'}));});
test('token and modes are checked before any navigation',async()=>{const x=setup();await x.c.register(binding);await assert.rejects(x.c.openShortcut({id:'example',mode:'current',token:'wrong'}));await assert.rejects(x.c.openShortcut({id:'example',mode:'evil',token:'token'}));assert.equal(x.nav.length,0);});
test('modified click creates tab in explicit target window',async()=>{const x=setup();await x.c.register(binding);await x.c.openShortcut({id:'example',mode:'background',token:'token'});assert.deepEqual(x.nav[0],['create',{windowId:10,url:'https://example.com/',active:false}]);});
test('foreign PiP URL rejected',async()=>{const x=setup();x.windows.get(20).tabs=[{url:'https://foreign.example/'}];await assert.rejects(x.c.register(binding));assert.equal(x.writes.length,0);});
test('restore session verifies source and window and keeps target',async()=>{const x=setup({...binding,target:{tabId:2,windowId:10},paused:false,error:null});await x.c.ready;assert.equal(x.c.status().pipWindowId,20);await x.c.reconcile();assert.equal(x.c.status().target.tabId,2);});
test('missing source clears restored state',async()=>{const x=setup(binding);x.tabs.delete(1);await x.c.ready;assert.equal(x.c.status(),null);assert.equal(x.session.binding,null);});
test('hide failure pauses controller with visible error',async()=>{const x=setup();await x.c.register(binding);x.api.windows.update=async()=>{throw Error('cannot minimize');};x.tabs.get(2).url='https://example.com/';await x.c.reconcile();assert.equal(x.c.status().paused,true);assert.match(x.c.status().error,/cannot minimize/);});
test('source navigation invalidates binding without manipulating other windows',async()=>{const x=setup();await x.c.register(binding);x.tabs.get(1).url='https://example.com/';await x.c.reconcile();assert.equal(x.c.status(),null);});
test('latest tab state wins rapid reconciliation',async()=>{const x=setup();await x.c.register(binding);const first=x.c.reconcile();x.tabs.get(2).url='https://example.com/';const second=x.c.reconcile();await Promise.all([first,second]);assert.equal(x.windows.get(20).state,'minimized');});
test('pause hides and resume rechecks NTP',async()=>{const x=setup();await x.c.register(binding);await x.c.setPaused(true);assert.equal(x.windows.get(20).state,'minimized');await x.c.setPaused(false);assert.equal(x.windows.get(20).state,'normal');});
test('foreign extension source is rejected',async()=>{const x=setup();x.tabs.get(1).url='chrome-extension://foreign/host.html';await assert.rejects(x.c.register(binding));assert.equal(x.writes.length,0);});
test('fulfilled no-op hiding is treated as compatibility failure',async()=>{const x=setup();await x.c.register(binding);x.api.windows.update=async id=>structuredClone(x.windows.get(id));x.tabs.get(2).url='https://example.com/';await x.c.reconcile();assert.equal(x.c.status().paused,true);assert.match(x.c.status().error,/minimized/);assert.equal(x.c.status().visibility,'normal');});
test('window-control failure latches until explicit resume',async()=>{const x=setup();await x.c.register(binding);let calls=0;x.api.windows.update=async()=>{calls++;throw Error('unsupported');};x.tabs.get(2).url='https://example.com/';await x.c.reconcile();await x.c.reconcile();assert.equal(calls,1);await x.c.setPaused(false);assert.equal(calls,2);});
test('focus change queued after click rejects stale navigation',async()=>{const x=setup();await x.c.register(binding);x.windows.set(30,{id:30,type:'normal',focused:true,state:'normal'});x.windows.get(10).focused=false;const click=x.c.openShortcut({id:'example',mode:'current',token:'token'});const change=x.c.reconcile(30);await assert.rejects(click);await change;assert.equal(x.nav.length,0);});
test('initial PiP focus retains the active NTP in its source window',async()=>{
 const x=setup();x.windows.get(10).focused=false;x.windows.get(20).focused=true;
 await x.c.register(binding);
 assert.deepEqual(x.c.status().target,{tabId:2,windowId:10});
 assert.equal(x.c.status().paused,false);
 assert.equal(x.writes.length,0);
 await x.c.openShortcut({id:'example',mode:'background',token:'token'});
 assert.equal(x.nav[0][1].windowId,10);
});
test('registration keeps its active NTP even if another app gains focus during initialization',async()=>{
 for(const during of [false,true]){
  const x=setup();x.windows.get(10).focused=false;x.windows.get(20).focused=true;
  if(during){const get=x.api.tabs.get;let fired=false;x.api.tabs.get=async id=>{const tab=await get(id);if(id===1&&!fired){fired=true;for(const win of x.windows.values())win.focused=false;x.c.reconcile(-1);}return tab;};}
  else {for(const win of x.windows.values())win.focused=false;await x.c.reconcile(-1);}
  await x.c.register(binding);await x.c.reconcile();
  assert.deepEqual(x.c.status().target,{tabId:2,windowId:10});
  assert.equal(x.c.status().visibility,'minimized');
 }
});


test('a stale update snapshot is checked against the live PiP state before reporting failure',async()=>{
 const x=setup();await x.c.register(binding);
 x.api.windows.update=async(id,changes)=>{const before=structuredClone(x.windows.get(id));Object.assign(x.windows.get(id),changes);return before;};
 x.tabs.get(2).url='https://example.com/';await x.c.reconcile();
 assert.equal(x.c.status().paused,false);
 assert.equal(x.c.status().visibility,'minimized');
});

test('a successful response cannot mask a live no-op and requests closure of its own PiP',async()=>{
 const x=setup();await x.c.register(binding);
 x.api.windows.update=async id=>({...x.windows.get(id),state:'minimized'});
 x.tabs.get(2).url='https://example.com/';await x.c.reconcile();
 assert.equal(x.c.status().closeRequested,true);
 assert.equal(x.c.status().visibility,'normal');
 assert.match(x.c.status().error,/重新点击/);
});

test('external focus after a latched restore failure still requests closing the overlay',async()=>{
 const x=setup();await x.c.register(binding);await x.c.setPaused(true);
 x.api.windows.update=async()=>{throw Error('unsupported');};
 await x.c.setPaused(false);assert.equal(x.c.status().closeRequested,false);
 x.windows.get(20).state='normal';for(const win of x.windows.values())win.focused=false;await x.c.reconcile(-1);
 assert.equal(x.c.status().closeRequested,true);
});

test('a newer focus event cancels stale hide failure before closing the PiP',async()=>{
 const x=setup();await x.c.register(binding);let newer;
 x.api.windows.update=async id=>{x.windows.get(10).focused=true;newer=x.c.reconcile(10);return structuredClone(x.windows.get(id));};
 for(const win of x.windows.values())win.focused=false;await x.c.reconcile(-1);await newer;
 assert.equal(x.c.status().paused,false);
 assert.equal(x.c.status().closeRequested,false);
 assert.equal(x.c.status().visibility,'normal');
});

test('a transient NONE with live Chrome focus never requests closing a valid NTP session',async()=>{
 const x=setup();await x.c.register(binding);
 x.api.windows.update=async()=>{throw Error('unsupported minimize');};
 await x.c.reconcile(-1);await x.c.reconcile(10);
 assert.equal(x.c.status().closeRequested,false);
 assert.equal(x.c.status().paused,false);
 await x.c.openShortcut({id:'example',mode:'background',token:'token'});
 assert.deepEqual(x.nav[0],['create',{windowId:10,url:'https://example.com/',active:false}]);
});

test('a non-focus event during NONE preserves the grace for the next Chrome focus',async()=>{
 const x=setup();await x.c.register(binding);x.windows.get(10).focused=false;
 x.api.windows.update=async()=>{throw Error('unsupported minimize');};
 const lost=x.c.reconcile(-1);const tabChanged=x.c.reconcile();
 await new Promise(resolve=>setImmediate(resolve));
 x.windows.get(10).focused=true;const regained=x.c.reconcile(10);
 await Promise.all([lost,tabChanged,regained]);
 assert.equal(x.c.status().closeRequested,false);
 assert.equal(x.c.status().paused,false);
 assert.equal(x.c.status().visibility,'normal');
});

test('closing after a previous restore error reports the observed state and how to restart',async()=>{
 const x=setup();await x.c.register(binding);await x.c.setPaused(true);
 x.api.windows.update=async()=>{throw Error('restore unsupported');};
 await x.c.setPaused(false);
 for(const win of x.windows.values())win.focused=false;
 x.windows.get(20).state='normal';await x.c.reconcile(-1);
 assert.equal(x.c.status().visibility,'normal');
 assert.equal(x.c.status().closeRequested,true);
 assert.match(x.c.status().error,/重新点击/);
 assert.match(x.c.status().error,/restore unsupported/);
});


test('a background source tab survives worker restoration with the same document identity',async()=>{
 const x=setup();x.tabs.get(1).url='chrome-extension://test/source.html';
 const owner={...binding,sourceDocumentId:'ready-source'};
 const contexts=[{documentId:'ready-source',tabId:1,contextType:'TAB',documentUrl:x.tabs.get(1).url}];
 x.api.runtime.getContexts=async()=>structuredClone(contexts);await x.c.register(owner);
 const restored=createController(x.api,[]);await restored.ready;assert.equal(restored.status().sourceDocumentId,'ready-source');
 contexts[0].documentId='reloaded-source';await restored.reconcile();assert.equal(restored.status(),null);
});
test('a background source identity cannot be impersonated by another tab',async()=>{
 const x=setup();x.tabs.get(1).url='chrome-extension://test/source.html';
 x.api.runtime.getContexts=async()=>[{documentId:'fake',tabId:99,contextType:'TAB',documentUrl:x.tabs.get(1).url}];
 await assert.rejects(x.c.register({...binding,sourceDocumentId:'fake'}));assert.equal(x.c.status(),null);
});
