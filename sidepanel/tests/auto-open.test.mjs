import test from 'node:test';import assert from 'node:assert/strict';
async function fixture(){
  const {createAutoOpen}=await import('../extension/auto-open.js');
  const effects=[],notices=[],diagnostics=[];let enabled=true;const tab={id:7,windowId:3,active:true,url:'chrome://newtab/'};
  let bridge;
  const api={runtime:{id:'abc',getURL:p=>`chrome-extension://abc/${p}`},tabs:{get(id,cb){if(cb){cb({...tab});return;}return Promise.resolve({...tab});}},
    sidePanel:{setOptions:async d=>effects.push(['options',d]),open:async d=>effects.push(['open',d])},
    debugger:{getTargets:async()=>[{id:'web',url:'https://example.org/'},{id:'own',url:'chrome-extension://abc/offscreen.html'}],attach:async d=>effects.push(['attach',d]),detach:async d=>effects.push(['detach',d]),
      sendCommand:async(d,method,params)=>{effects.push(['evaluate',d,method,params.userGesture]);const id=JSON.parse(params.expression.match(/\((.*)\)/)[1]);const reply=await new Promise(resolve=>bridge.handleMessage({type:'auto:gesture',requestId:id},{id:'abc',url:'chrome-extension://abc/offscreen.html'},resolve));return {result:{value:reply}};}}};
  bridge=createAutoOpen(api,{ensureOffscreen:async()=>effects.push(['offscreen']),getPreferences:async()=>({autoOpenEnabled:enabled}),notify:message=>notices.push(message),record:(event,details)=>diagnostics.push({event,...details})});
  return {api,bridge,effects,notices,diagnostics,tab,disable:()=>{enabled=false;bridge.cancelAll();}};
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

test('manual close while the hidden document is being created cancels the pending automatic open',async()=>{
  const {createAutoOpen}=await import('../extension/auto-open.js');const f=await fixture();let finish,started;const began=new Promise(r=>started=r);
  const bridge=createAutoOpen(f.api,{ensureOffscreen:()=>{started();return new Promise(r=>finish=r);},getPreferences:async()=>({autoOpenEnabled:true})});
  const pending=bridge.request(7);await began;bridge.closed({tabId:7});finish();await pending;
  assert.equal(f.effects.some(e=>e[0]==='attach'||e[0]==='open'),false);
});

// Preserve useful failure categories without recording private target URLs.
test('gesture rejection reports the failed stage and actionable reason without raw API details',async()=>{
  const f=await fixture();
  f.api.sidePanel.open=async()=>{throw Error('sidePanel.open() requires a user gesture; https://private.test/path');};
  await f.bridge.request(7);
  assert.match(f.notices.at(-1).error,/用户手势/);
  assert.equal(f.diagnostics.some(d=>d.stage==='sidepanel-open'&&d.reason==='gesture-required'),true);
  assert.equal(JSON.stringify(f.diagnostics).includes('private.test'),false);
  assert.equal(f.effects.at(-1)[0],'detach');
});

test('missing or exceptional CDP replies never report a successful automatic open and still detach',async()=>{
  for (const result of [{}, {result:{value:{ok:false}}}, {exceptionDetails:{text:'private target details'}}]) {
    const f=await fixture();
    f.api.debugger.sendCommand=async()=>result;
    await f.bridge.request(7);
    assert.equal(f.notices.length,1);
    assert.equal(f.diagnostics.some(d=>d.stage==='opened'),false);
    assert.equal(JSON.stringify(f.diagnostics).includes('private target details'),false);
    assert.equal(f.effects.at(-1)[0],'detach');
  }
});

test('unrecognized bridge error reasons are reduced to a safe category',async()=>{
  const f=await fixture();
  f.api.debugger.sendCommand=async()=>({result:{value:{ok:false,reason:'https://private.test/secret'}}});
  await f.bridge.request(7);
  assert.equal(f.diagnostics.at(-1).reason,'api-error');
  assert.equal(JSON.stringify(f.diagnostics).includes('private.test'),false);
});
