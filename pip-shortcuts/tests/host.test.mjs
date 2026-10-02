import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const defaultData=JSON.parse(await readFile(new URL('../extension/shortcuts.json',import.meta.url),'utf8'));
const markup=await readFile(new URL('../extension/host.html',import.meta.url),'utf8');
let importSequence=0;

class EventTargetFake {
 constructor(){this.listeners=new Map();}
 addEventListener(type,callback,options={}){
  const listeners=this.listeners.get(type)||[];
  listeners.push({callback,once:options.once});this.listeners.set(type,listeners);
 }
 dispatch(type,properties={}){
  const event={type,button:0,preventDefault(){this.defaultPrevented=true;},...properties};
  return Promise.all([...(this.listeners.get(type)||[])].map(listener=>{
   if(listener.once)this.listeners.set(type,this.listeners.get(type).filter(item=>item!==listener));
   return listener.callback(event);
  }));
 }
}

class ElementFake extends EventTargetFake {
 constructor(tag){super();this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.style={};this.attributes={};this.value='';this.disabled=false;this._text='';}
 append(...nodes){
  for(const node of nodes){
   if(node.parentNode)node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);
   node.parentNode=this;this.children.push(node);
  }
 }
 replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this._text='';this.append(...nodes);}
 setAttribute(name,value){this.attributes[name]=String(value);}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 set textContent(value){this.replaceChildren();this._text=String(value);}
}

class DocumentFake {
 constructor(){this.head=new ElementFake('head');this.body=new ElementFake('body');}
 createElement(tag){return new ElementFake(tag);}
 getElementById(id){
  const find=node=>node.id===id?node:node.children.map(find).find(Boolean);
  return find(this.head)||find(this.body)||null;
 }
}

function fixture(){
 const document=new DocumentFake();
 // Use the source markup's IDs, but model only the DOM hierarchy used at this boundary.
 for(const match of markup.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
  const element=document.createElement(match[1]);element.id=match[2];
  element.disabled=/\bdisabled\b/.test(match[0]);document.body.append(element);
 }
 document.getElementById('preview').append(document.getElementById('surface'));
 document.getElementById('surface').append(document.getElementById('grid'),document.getElementById('grid-error'));
 return document;
}

async function loadHost(t,{prepareFailure=false,navigateFailure=false,registerFailure=false}={}){
 const document=fixture(),window=new EventTargetFake(),pipWindow=new EventTargetFake();
 pipWindow.document=new DocumentFake();pipWindow.closed=false;
 pipWindow.close=()=>{pipWindow.closed=true;return pipWindow.dispatch('pagehide');};
 const calls=[],runtimeListeners=[];
 let storedData=structuredClone(defaultData),state=null,failPrepare=prepareFailure;
 const chrome={runtime:{
  getURL:path=>`chrome-extension://test/${path}`,
  onMessage:{addListener:listener=>runtimeListeners.push(listener)},
  sendMessage:async message=>{
   calls.push(structuredClone(message));
   if(message.type==='status')return {ok:true,state,data:structuredClone(storedData)};
   if(message.type==='prepare'&&failPrepare){failPrepare=false;return {ok:false,error:'prepare temporarily failed'};}
   if(message.type==='register'&&registerFailure)return {ok:false,error:'PiP window is not exposed'};
   if(message.type==='register'){state={token:message.token,paused:false,visibility:'normal'};return {ok:true,state};}
   if(message.type==='stop')state=null;
   if(message.type==='save')storedData=structuredClone(message.data);
   if(message.type==='navigate'&&navigateFailure)return {ok:false,error:'navigation rejected'};
   return {ok:true};
  }
 }};
 const documentPictureInPicture={requestWindow:options=>{calls.push({type:'requestWindow',options});return Promise.resolve(pipWindow);}};
 window.documentPictureInPicture=documentPictureInPicture;
 const globals={document,window,chrome,documentPictureInPicture};
 const originals=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 t.after(()=>{for(const [key,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 await import(new URL(`../extension/host.js?host-test=${++importSequence}`,import.meta.url));
 const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));};
 return {
  document,pipWindow,calls,
  click:id=>document.getElementById(id).dispatch('click'),
  broadcast:async message=>{await Promise.all(runtimeListeners.map(listener=>listener(message)));await settle();},
  settle
 };
}

const labels=document=>document.getElementById('grid').children.map(button=>button.children[1].textContent);
const changedData=()=>({version:1,shortcuts:[{id:'replacement',title:'更新后的入口',url:'https://updated.example/',icon:'更',color:'#123456'}]});

test('host renders all 40 bundled shortcuts with visible labels and accessible names',async t=>{
 const host=await loadHost(t),buttons=host.document.getElementById('grid').children;
 assert.equal(buttons.length,40);
 assert.deepEqual(labels(host.document),defaultData.shortcuts.map(entry=>entry.title));
 assert.deepEqual(buttons.map(button=>button.attributes['aria-label']),defaultData.shortcuts.map(entry=>entry.title));
 assert.equal(host.document.getElementById('start').disabled,false);
});

test('real start click requests PiP synchronously before background work',async t=>{
 const host=await loadHost(t);host.calls.length=0;
 const clicked=host.click('start');
 assert.equal(host.calls.length,1);
 assert.equal(host.calls[0].type,'requestWindow');
 await clicked;
 assert.deepEqual(host.calls.map(call=>call.type),['requestWindow','newtab','register']);
 assert.equal(host.document.getElementById('error').textContent,'');
});

test('start moves the surface into PiP and closing restores the same surface and shortcuts',async t=>{
 const host=await loadHost(t),surface=host.document.getElementById('surface');
 await host.click('start');
 assert.equal(host.document.getElementById('surface'),null);
 assert.equal(host.document.getElementById('grid'),null);
 assert.equal(host.pipWindow.document.getElementById('surface'),surface);
 assert.equal(labels(host.pipWindow.document).length,40);
 await host.pipWindow.close();await host.settle();
 assert.equal(host.document.getElementById('surface'),surface);
 assert.equal(surface.parentNode,host.document.getElementById('preview'));
 assert.equal(host.pipWindow.document.getElementById('surface'),null);
 assert.equal(labels(host.document).length,40);
 assert.ok(host.calls.some(call=>call.type==='stop'));
 assert.equal(host.document.getElementById('start').disabled,false);
});

test('saving while the grid belongs to PiP updates the visible shortcuts',async t=>{
 const host=await loadHost(t),data=changedData();await host.click('start');
 host.document.getElementById('json').value=JSON.stringify(data);
 assert.equal(host.document.getElementById('grid'),null);
 await host.click('save');
 assert.deepEqual(labels(host.pipWindow.document),['更新后的入口']);
 assert.equal(host.document.getElementById('error').textContent,'');
 assert.deepEqual(host.calls.find(call=>call.type==='save').data,data);
});

test('navigation failures report feedback inside the moved PiP surface',async t=>{
 const host=await loadHost(t,{navigateFailure:true});await host.click('start');
 const button=host.pipWindow.document.getElementById('grid').children[0];
 await button.dispatch('click');
 assert.equal(host.document.getElementById('grid-error'),null);
 assert.equal(host.pipWindow.document.getElementById('grid-error').textContent,'navigation rejected');
});

test('refresh retries preparation after a transient prepare rejection',async t=>{
 const host=await loadHost(t,{prepareFailure:true});
 assert.equal(host.document.getElementById('start').disabled,true);
 assert.match(host.document.getElementById('error').textContent,/prepare temporarily failed/);
 await host.click('refresh');await host.settle();
 assert.equal(host.calls.filter(call=>call.type==='prepare').length,2);
 assert.equal(host.document.getElementById('start').disabled,false);
 assert.equal(host.document.getElementById('error').textContent,'');
});

test('data runtime broadcasts synchronize labels and editor while the surface is in PiP',async t=>{
 const host=await loadHost(t);await host.click('start');
 const data=changedData();await host.broadcast({type:'data',data});
 assert.deepEqual(labels(host.pipWindow.document),['更新后的入口']);
 assert.deepEqual(JSON.parse(host.document.getElementById('json').value),data);
 assert.equal(JSON.parse(host.document.getElementById('diagnostic').textContent).shortcutCount,1);
});

test('failed PiP registration closes own window and retains compatibility error',async t=>{
 const host=await loadHost(t,{registerFailure:true});
 await host.click('start');await host.settle();
 assert.equal(host.pipWindow.closed,true);
 assert.equal(host.document.getElementById('surface')!==null,true);
 assert.match(host.document.getElementById('error').textContent,/PiP window is not exposed/);
});
