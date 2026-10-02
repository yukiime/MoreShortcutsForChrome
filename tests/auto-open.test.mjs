import test from 'node:test';import assert from 'node:assert/strict';
async function fixture(){
  const {createAutoOpen}=await import('../extension/auto-open.js');
  const effects=[];let enabled=true;const tab={id:7,windowId:3,active:true,url:'chrome://newtab/'};
  let bridge;
  const api={runtime:{id:'abc',getURL:p=>`chrome-extension://abc/${p}`},tabs:{get(id,cb){if(cb){cb({...tab});return;}return Promise.resolve({...tab});}},
    sidePanel:{setOptions:async d=>effects.push(['options',d]),open:async d=>effects.push(['open',d])},
    debugger:{getTargets:async()=>[{id:'web',url:'https://example.org/'},{id:'own',url:'chrome-extension://abc/offscreen.html'}],attach:async d=>effects.push(['attach',d]),detach:async d=>effects.push(['detach',d]),
      sendCommand:async(d,method,params)=>{effects.push(['evaluate',d,method,params.userGesture]);const id=JSON.parse(params.expression.match(/\((.*)\)/)[1]);await new Promise(resolve=>bridge.handleMessage({type:'auto:gesture',requestId:id},{id:'abc',url:'chrome-extension://abc/offscreen.html'},resolve));return {};}}};
  bridge=createAutoOpen(api,{ensureOffscreen:async()=>effects.push(['offscreen']),getPreferences:async()=>({autoOpenEnabled:enabled}),notify:()=>{}});
  return {api,bridge,effects,tab,disable:()=>{enabled=false;bridge.cancelAll();}};
}
test('automatic experiment attaches only its own offscreen target, opens only the NTP and always detaches',async()=>{
  const f=await fixture();await f.bridge.request(7);
  assert.deepEqual(f.effects.filter(e=>['attach','open','detach'].includes(e[0])),[['attach',{targetId:'own'}],['open',{tabId:7}],['detach',{targetId:'own'}]]);
  assert.equal(f.effects.find(e=>e[0]==='evaluate')[3],true);
  assert.equal(f.effects.findIndex(e=>e[0]==='options')<f.effects.findIndex(e=>e[0]==='attach'),true);
});
test('disabled experiment and ordinary pages never attach debugger',async()=>{
  for(const mode of ['disabled','ordinary']){const f=await fixture();if(mode==='disabled')f.disable();else f.tab.url='https://example.org/';await f.bridge.request(7);assert.equal(f.effects.some(e=>e[0]==='attach'),false);}
});
test('stale, foreign and moved requests cannot open a panel',async()=>{
  const f=await fixture();assert.equal(f.bridge.handleMessage({type:'auto:gesture',requestId:'old'},{id:'abc',url:'chrome-extension://abc/offscreen.html'},()=>{}),false);
  f.api.debugger.sendCommand=async(_,__,params)=>{
    const requestId=JSON.parse(params.expression.match(/\((.*)\)/)[1]);
    assert.equal(f.bridge.handleMessage({type:'auto:gesture',requestId},{id:'other',url:'chrome-extension://abc/offscreen.html'},()=>{}),false);
    f.tab.windowId=4;await new Promise(resolve=>f.bridge.handleMessage({type:'auto:gesture',requestId},{id:'abc',url:'chrome-extension://abc/offscreen.html'},resolve));return {};
  };
  await f.bridge.request(7);assert.equal(f.effects.some(e=>e[0]==='open'),false);assert.equal(f.effects.at(-1)[0],'detach');
});
test('debugger failures detach and user closing suppresses further automatic reopening',async()=>{
  const f=await fixture();f.api.debugger.sendCommand=async()=>{throw Error('cancelled');};await f.bridge.request(7);assert.equal(f.effects.at(-1)[0],'detach');
  f.bridge.closed({tabId:7});f.effects.length=0;await f.bridge.request(7);assert.equal(f.effects.length,0);
});
