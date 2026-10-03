import test from 'node:test';
import assert from 'node:assert/strict';
import {createPipSession} from '../extension/pip-session.js';

function setup(){
 const listeners={},calls=[],messages=[],surface={},error={textContent:''};let ownerState=null,closed=false;
 const pip={closed:false,document:{title:'',head:{append(){}},body:{append(value){assert.equal(value,surface);}},createElement(){return {}; }},addEventListener(type,callback){listeners[type]=callback;},close(){this.closed=true;closed=true;listeners.pagehide?.();}};
 const request=async message=>{
  messages.push(message);
  if(message.type==='begin')return {ok:true,state:ownerState,data:{version:1,shortcuts:[]}};
  if(message.type==='register')return {ok:true,state:{hostDocumentId:'owner',token:message.token}};
  if(message.type==='reuse')return {ok:true,state:ownerState};
  return {ok:true};
 };
 const session=createPipSession({request,pictureInPicture:{async requestWindow(options){calls.push(options);return pip;}},contentReady:Promise.resolve({surface,error,render(){}}),getURL:p=>'chrome-extension://test/'+p});
 return {session,messages,calls,pip,listeners,setOwner(value){ownerState=value;},get closed(){return closed;}};
}
test('a single launch creates and registers PiP without a visible source page or second click',async()=>{
 const x=setup();await x.session.launch('one-click-token');
 assert.equal(x.calls.length,1);assert.deepEqual(x.messages.map(m=>m.type),['begin','register']);
 assert.equal(x.messages[1].token,'one-click-token');assert.equal(x.pip.document.title,'额外快捷方式');
});
test('another toolbar click reuses the live PiP and asks for a new native tab',async()=>{
 const x=setup();await x.session.launch('first');x.setOwner({token:'first',visibility:'normal'});
 await x.session.launch('second');assert.equal(x.calls.length,1);
 assert.deepEqual(x.messages.at(-1),{type:'reuse',launchId:'second',token:'first'});
});
test('close requests affect only the current token and pagehide releases that session',async()=>{
 const x=setup();await x.session.launch('own-token');
 x.session.updateState({token:'foreign-token',closeRequested:true});assert.equal(x.closed,false);
 x.session.updateState({token:'own-token',closeRequested:true});assert.equal(x.closed,true);
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(x.messages.at(-1),{type:'stop',token:'own-token'});
});
test('failed register closes only the window actually created by this document',async()=>{
 let closed=0;const pip={closed:false,close(){closed++;this.closed=true;},document:{head:{append(){}},body:{append(){}},createElement(){return {};}},addEventListener(){}};
 const session=createPipSession({request:async m=>{if(m.type==='register')throw Error('ambiguous PiP');return {data:{version:1,shortcuts:[]}};},pictureInPicture:{async requestWindow(){return pip;}},contentReady:Promise.resolve({surface:{},error:{},render(){}}),getURL:p=>p});
 await assert.rejects(session.launch('failed'),/ambiguous PiP/);assert.equal(closed,1);
});
test('concurrent launches do not open a second PiP window',async()=>{
 const x=setup();const first=x.session.launch('first');await assert.rejects(x.session.launch('second'),/正在启动/);await first;
 assert.equal(x.calls.length,1);
});

test('reuse cannot report success after restore failure or automatic closure',async()=>{
 for(const state of [{token:'first',error:'restore failed',paused:true,visibility:'minimized'},{token:'first',closeRequested:true,visibility:'normal'}]){
  const x=setup();await x.session.launch('first');x.setOwner(state);await assert.rejects(x.session.launch('second'));
 }
});

test('expired renderer activation fails before creating a PiP or native tab',async()=>{
 let opened=0;const session=createPipSession({request:async()=>({data:{version:1,shortcuts:[]}}),pictureInPicture:{async requestWindow(){opened++;}},contentReady:Promise.resolve({surface:{},error:{},render(){}}),getURL:p=>p,hasActivation:()=>false});
 await assert.rejects(session.launch('expired'),/超时/);assert.equal(opened,0);
});

test('fresh registration failure cannot report success even when native close is asynchronous',async()=>{
 for(const state of [null,{token:'fresh',paused:true,error:'restore failed',visibility:'minimized'},{token:'fresh',closeRequested:true,visibility:'normal'}]){
  let closes=0;const pip={closed:false,close(){closes++;},document:{head:{append(){}},body:{append(){}},createElement(){return {}; }},addEventListener(){}};
  const session=createPipSession({request:async m=>m.type==='register'?{state}:{state:null,data:{version:1,shortcuts:[]}},pictureInPicture:{async requestWindow(){return pip;}},contentReady:Promise.resolve({surface:{},error:{},render(){}}),getURL:p=>p});
  await assert.rejects(session.launch('fresh'));assert.equal(closes,1);
 }
});
