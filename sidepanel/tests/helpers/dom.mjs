// Minimal DOM boundary double for UI behavior. Chrome visual checks are separate.
import {readFile} from 'node:fs/promises';
class Node {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.style={};this.hidden=false;this.disabled=false;this.value='';this.checked=false;this.textContent='';this.className='';}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[];this.append(...children);}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  focus(){this.focused=true;}
  dispatch(type,props={}){const event={preventDefault(){},button:0,...props};for(const fn of this.listeners[type]??[])fn(event);}
  querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll('*')]);return selector==='*'?all:all.filter(n=>selector.startsWith('.')?n.className.split(' ').includes(selector.slice(1)):n.tagName===selector);}
}
export async function panelFixture(){
  const html=await readFile(new URL('../../extension/panel.html',import.meta.url),'utf8');
  const nodes=new Map();for(const match of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
    const node=new Node(match[1]);node.hidden=/\bhidden\b/.test(match[2]);nodes.set(match[3],node);
  }
  const doc=new Node();doc.querySelector=s=>nodes.get(s.slice(1));doc.createElement=tag=>new Node(tag);doc.createDocumentFragment=()=>new Node('fragment');doc.visibilityState='visible';
  const events=()=>{const listeners=[];return {addListener:f=>listeners.push(f),emit:(...args)=>listeners.forEach(f=>f(...args))};};
  const calls=[],local=events(),messages=events();let permission=false,failSave=false;
  const data={revision:0,shortcuts:[{id:'one',title:'One',url:'https://example.com/',icon:'1',color:'#123456'}]};
  let prefs={frequentSitesEnabled:false,autoOpenEnabled:false};
  const api={runtime:{id:'abc',getURL:p=>`chrome-extension://abc/${p}`,getManifest:()=>({permissions:['tabs','storage','sidePanel']}),onMessage:messages,
    sendMessage:async msg=>{calls.push(msg);switch(msg.type){case 'shortcuts:get':return {ok:true,...structuredClone(data)};case 'shortcuts:edit':if(failSave)return {ok:false,error:'disk failed'};data.revision++;data.shortcuts[0]={...data.shortcuts[0],title:msg.title,url:msg.url};return {ok:true,...structuredClone(data)};case 'preferences:get':return {ok:true,...prefs};case 'preferences:set':prefs={...prefs,frequentSitesEnabled:msg.frequentSitesEnabled};return {ok:true,...prefs};case 'frequent:get':return {ok:true,token:'token',sites:[{id:'example.net',title:'example.net',url:'https://example.net/',visitCount:8}]};default:return {ok:true};}}},
    storage:{onChanged:local},permissions:{contains:async()=>permission,request:()=>{calls.push({type:'permission-request'});return Promise.resolve(permission);}}};
  return {doc,nodes,api,calls,data,local,messages,failSave:()=>failSave=true,allow:()=>permission=true,setPrefs:p=>prefs=p};
}
export const flush=()=>new Promise(resolve=>setImmediate(resolve));
export function click(f,id,props){f.nodes.get(id).dispatch('click',props);}
export function firstShortcut(f){return f.nodes.get('shortcuts').querySelectorAll('button')[0];}
