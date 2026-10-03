import test from 'node:test';
import assert from 'node:assert/strict';
let sequence=0;
function element(){return {style:{},textContent:'',append(){},replaceChildren(){},setAttribute(){},addEventListener(){}};}
async function setup(t){
 const keys=['chrome','window','document','navigator','DOMParser','fetch'],saved=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 t.after(()=>{for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 const listeners=[],messages=[],opening=[],grid=element(),error=element(),surface={...element(),querySelector:id=>id==='#grid'?grid:error};
 let release;const template=new Promise(resolve=>{release=resolve;});
 const pip={closed:false,document:{head:element(),body:element(),createElement:element},addEventListener(){},close(){this.closed=true;}};
 const api={runtime:{id:'source-test',getURL:path=>`chrome-extension://source-test/${path}`,onMessage:{addListener(callback){listeners.push(callback);}},async sendMessage(message){
  messages.push(message);if(message.type==='source-ready'){assert.equal(listeners.length,1,'listener exists before readiness handshake');return {ok:true,tabId:4};}
  if(message.type==='begin')return {ok:true,state:null,data:{version:1,shortcuts:[]}};
  if(message.type==='register')return {ok:true,state:{token:message.token,visibility:'normal'}};
  return {ok:true};
 }}};
 const values={chrome:api,window:{documentPictureInPicture:{async requestWindow(options){opening.push(options);return pip;}},addEventListener(){}},document:{adoptNode:value=>value,createElement:element},navigator:{userActivation:{isActive:true}},DOMParser:class{parseFromString(){return {getElementById:()=>surface};}},fetch:async()=>{await template;return {ok:true,async text(){return '<div id="surface"></div>';}};}};
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:values[key]});
 await import(`../extension/source.js?source-test=${++sequence}`);
 const worker={id:'source-test',url:api.runtime.getURL('worker.js')};
 const ready=async()=>{release();await new Promise(resolve=>setImmediate(resolve));};
 async function message(value,sender=worker){return new Promise(resolve=>{if(!listeners[0](value,sender,resolve))resolve(undefined);});}
 return {ready,listeners,messages,opening,message,worker};
}
test('source readiness waits for the DOM template and a registered listener',async t=>{
 const x=await setup(t);assert.equal(x.listeners.length,1);assert.deepEqual(x.messages,[]);
 await x.ready();assert.deepEqual(x.messages,[{type:'source-ready'}]);
 assert.deepEqual(await x.message({type:'source-ping',target:'source',tabId:4}),{ok:true,tabId:4});
});
test('ready source launches from the worker and ignores other tabs or renderer senders',async t=>{
 const x=await setup(t);await x.ready();
 const value={type:'launch',target:'source',tabId:4,launchId:'real-button-token'};
 assert.equal(await x.message({...value,tabId:99}),undefined);
 assert.equal(await x.message(value,{...x.worker,documentId:'other-document'}),undefined);
 assert.deepEqual(await x.message(value),{ok:true});assert.equal(x.opening.length,1);
 assert.deepEqual(x.messages.map(m=>m.type),['source-ready','begin','register']);
});
