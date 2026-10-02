import {validateShortcuts, findPipWindow, validateBounds} from './core.js';
import {createController} from './controller.js';

const hostUrl=chrome.runtime.getURL('host.html'),sourceUrl=chrome.runtime.getURL('source.html');
let launch=null,actionRevision=0,messageTail=Promise.resolve(),resultTail=Promise.resolve(),preparingSource=null,sourceTabId=null;
const sourceReloads=new Set();
let data=null;
const controller=createController(chrome,[],state=>{chrome.runtime.sendMessage({type:'state',state}).catch(()=>{});if(state?.error)safe(launchResult(state.error));});
// Register every MV3 event synchronously. Initial data is loaded behind configReady.
const configReady=(async()=>{
  const defaultDocument=await (await fetch(chrome.runtime.getURL('shortcuts.json'))).json();
  data=defaultDocument;
  try {const saved=(await chrome.storage.local.get('shortcuts')).shortcuts;if(saved){validateShortcuts(saved);data=saved;}} catch(error){console.warn('Saved shortcuts rejected:',error.message);}
  controller.setShortcuts(validateShortcuts(data));
})();
const safe=promise=>promise.catch(error=>console.warn('PiP:',error.message));

function sourceKind(sender){
 if(sender.id!==chrome.runtime.id||!Number.isInteger(sender.tab?.id)||sender.frameId!==undefined&&sender.frameId!==0)return null;
 try{const u=new URL(sender.url),h=new URL(hostUrl);if(u.protocol!==h.protocol||u.host!==h.host)return null;return u.pathname==='/host.html'?'host':u.pathname==='/source.html'?'source':null;}catch{return null;}
}
async function trusted(sender){
 const kind=sourceKind(sender);if(!kind)return false;
 if(kind==='host')return true;
 const contexts=await chrome.runtime.getContexts({contextTypes:['TAB'],documentIds:[sender.documentId]});
 return contexts.some(c=>c.documentId===sender.documentId&&c.tabId===sender.tab.id&&c.documentUrl===sourceUrl&&c.contextType==='TAB');
}
const owns=(value,sender)=>value&&value.hostTabId===sender.tab.id&&(!value.sourceDocumentId||value.sourceDocumentId===sender.documentId);
const ownSession=(sender,token)=>owns(controller.status(),sender)&&controller.status().token===token;
const validLaunch=(sender,id)=>launch&&launch.id===id&&launch.sourceTabId===sender.tab.id&&launch.sourceDocumentId===sender.documentId&&Date.now()-launch.at<15000;
function launchResult(error,revision=actionRevision){
 const result=resultTail.then(async()=>{
  if(revision!==actionRevision)return;
  await chrome.storage.session.set({lastLaunch:{error:error||null,at:Date.now()}});
  if(revision!==actionRevision)return;
  await chrome.action.setBadgeText({text:error?'!':''});
  if(revision!==actionRevision)return;
  await chrome.action.setTitle({title:error?`启动失败：${error} 再次点击重试。`:'打开原生新标签页和悬浮快捷方式'});
 });resultTail=result.catch(()=>{});return result;
}
function probeSource(tabId){
 let timer;
 return Promise.race([
  chrome.runtime.sendMessage({type:'source-ping',target:'source',tabId}).catch(()=>null),
  new Promise(resolve=>{timer=setTimeout(()=>resolve(null),3000);})
 ]).finally(()=>clearTimeout(timer));
}
function ensureSource(){
 if(preparingSource)return preparingSource;
 preparingSource=(async()=>{
  await chrome.action.disable();
  const existing=await chrome.tabs.query({url:sourceUrl});
  if(existing.length){
   sourceTabId=existing[0].id;
   const reply=await probeSource(sourceTabId);
   if(reply?.ok&&reply.tabId===sourceTabId){sourceReloads.delete(sourceTabId);await chrome.action.enable();return;}
   const live=await chrome.tabs.get(sourceTabId).catch(()=>null);
   if(live?.url===sourceUrl){
    if(live.status==='loading')return; // The new document's ready handshake enables it.
    if(!sourceReloads.has(live.id)){sourceReloads.add(live.id);await chrome.tabs.reload(live.id);}
    else await launchResult('后台来源页初始化失败，请重新加载扩展。');
    return;
   }
   sourceTabId=null;
  }
  const windows=await chrome.windows.getAll();
  const candidates=windows.filter(w=>w.type==='normal'&&!w.alwaysOnTop);
  const target=candidates.find(w=>w.focused)??candidates[0];if(!target)return;
  sourceTabId=(await chrome.tabs.create({windowId:target.id,url:sourceUrl,active:false})).id;
  // source-ready enables the button only after the real source listener exists.
 })().finally(()=>{preparingSource=null;});return preparingSource;
}
async function begin(sender,id){
 if(sourceKind(sender)!=='source'||!validLaunch(sender,id))throw Error('启动点击已过期，请再次点击扩展按钮。');
 const ticket=launch,state=controller.status();
 if(state){if(!owns(state,sender))throw Error('请先停止旧的手动测试会话。');return {state,data};}
 const target=await chrome.windows.get(ticket.windowId);
 if(target.type!=='normal'||target.alwaysOnTop)throw Error('请在普通 Chrome 窗口中启动。');
 const before=await chrome.windows.getAll({populate:true});
 if(before.some(w=>w.alwaysOnTop))throw Error('请先关闭其他画中画窗口。');
 if(launch!==ticket)throw Error('启动点击已更新，请重试。');
 await chrome.storage.session.set({attempt:{hostTabId:sender.tab.id,sourceDocumentId:sender.documentId,hostWindowId:ticket.windowId,token:id,before:before.map(w=>({id:w.id}))}});
 return {state:null,data};
}
async function handle(message,sender){
  await Promise.all([controller.ready,configReady]);
  if(!await trusted(sender)) throw Error('仅来源页可以控制悬浮快捷方式。');
  if(message.type==='source-ready'){
    if(sourceKind(sender)!=='source')throw Error('来源文档无效。');
    sourceTabId=sender.tab.id;sourceReloads.delete(sourceTabId);await chrome.action.enable();return {tabId:sourceTabId};
  }
  if(message.type==='source-error'){
    if(sourceKind(sender)!=='source')throw Error('来源文档无效。');
    await chrome.action.disable();await launchResult(String(message.error||'后台来源初始化失败。').slice(0,300));return {ok:true};
  }
  if(message.type==='begin')return begin(sender,message.launchId);
  if(message.type==='reuse'){
    if(!validLaunch(sender,message.launchId)||!ownSession(sender,message.token))throw Error('启动点击或会话已失效。');
    const windowId=launch.windowId;launch=null;
    const main=await chrome.windows.get(windowId);if(main.type!=='normal'||main.alwaysOnTop)throw Error('请在普通 Chrome 窗口中启动。');
    await chrome.tabs.create({windowId,url:'chrome://newtab/'});await controller.reconcile(windowId);
    const state=controller.status();return {state:state?.paused?await controller.setPaused(false):state};
  }
  if(message.type==='status')return {state:controller.status(),data,discovery:(await chrome.storage.session.get('discovery')).discovery??null,bounds:(await chrome.storage.local.get('bounds')).bounds??null,lastLaunch:(await chrome.storage.session.get('lastLaunch')).lastLaunch??null};
  if(message.type==='prepare'){
    if(sourceKind(sender)!=='host')throw Error('请从工具栏启动。');
    await controller.reconcile();
    const state=controller.status();
    if(state)throw Error('已有 PiP 会话，请先停止。');
    if(typeof message.token!=='string'||message.token.length<16||message.token.length>100)throw Error('无效的启动令牌。');
    const before=await chrome.windows.getAll({populate:true});
    if(before.some(window=>window.alwaysOnTop))throw Error('检测到已有置顶窗口，请先关闭其他画中画窗口。');
    const attempt={hostTabId:sender.tab.id,token:message.token,before:before.map(window=>({id:window.id}))};
    await chrome.storage.session.set({attempt});
    return {ok:true};
  }
  if(message.type==='register'){
    const attempt=(await chrome.storage.session.get('attempt')).attempt;
    if(!owns(attempt,sender)||attempt.token!==message.token)throw Error('启动准备已过期，请重试。');
    const automatic=sourceKind(sender)==='source';
    if(automatic&&!validLaunch(sender,message.token))throw Error('启动点击已过期。');
    const ticket=automatic?launch:null,pipSource=automatic?sourceUrl:hostUrl;
    const after=await chrome.windows.getAll({populate:true});
    const urlClass=url=>!url?'unknown':url===pipSource?'source':url==='about:blank'?'blank':'other';
    await chrome.storage.session.set({discovery:{before:attempt.before.map(w=>w.id),after:after.filter(w=>!attempt.before.some(old=>old.id===w.id)).map(w=>({id:w.id,type:w.type,alwaysOnTop:w.alwaysOnTop,focused:w.focused,state:w.state,tabs:(w.tabs??[]).map(t=>({id:t.id,urlClass:urlClass(t.pendingUrl||t.url)}))}))}});
    const pip=findPipWindow(attempt.before,after,pipSource);
    if(!pip)throw Error('此 Chrome 未暴露唯一可安全控制的 PiP 窗口，无法开启自动模式。');
    const tab=await chrome.tabs.get(sender.tab.id);
    const hostWindowId=automatic?attempt.hostWindowId:tab.windowId;
    if(automatic&&(launch!==ticket||hostWindowId!==ticket.windowId))throw Error('启动点击已更新。');
    if(automatic)launch=null;
    await chrome.storage.session.set({attempt:null});
    if(automatic)await chrome.tabs.create({windowId:hostWindowId,url:'chrome://newtab/'});
    const state=await controller.register({hostTabId:tab.id,hostWindowId,pipWindowId:pip.id,token:message.token,...(automatic?{sourceDocumentId:sender.documentId}:{})});
    const bounds=validateBounds((await chrome.storage.local.get('bounds')).bounds);
    if(bounds)try{await chrome.windows.update(pip.id,bounds);}catch(error){console.warn('Bounds not restored:',error.message);}
    return {state};
  }
  if(message.type==='newtab'){
    if(sourceKind(sender)!=='host')throw Error('请点击工具栏打开新标签页。');
    const source=await chrome.tabs.get(sender.tab.id);
    await chrome.tabs.create({windowId:source.windowId,url:'chrome://newtab/'});return {ok:true};
  }
  if(message.type==='save'){
    const active=controller.status();
    if(active && !active.sourceDocumentId && active.hostTabId!==sender.tab.id)throw Error('请在正在控制 PiP 的来源页中编辑清单。');
    const entries=validateShortcuts(message.data);
    await chrome.storage.local.set({shortcuts:message.data});
    data=message.data;controller.setShortcuts(entries);
    await chrome.runtime.sendMessage({type:'data',data}).catch(()=>{});
    return {ok:true};
  }
  if(!ownSession(sender,message.token))throw Error('PiP 会话已失效，请重新启动。');
  if(message.type==='navigate')return controller.openShortcut(message);
  if(message.type==='pause')return {state:await controller.setPaused(message.paused)};
  if(message.type==='stop'){await controller.clear();return {ok:true};}
  throw Error('未知操作。');
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(['state','data','launch','source-ping'].includes(message?.type))return false;
  const result=messageTail.then(()=>handle(message,sender));messageTail=result.catch(()=>{});
  result.then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:error.message}));
  return true;
});
chrome.action.onClicked.addListener(tab=>{
 const revision=++actionRevision;
 if(!Number.isSafeInteger(tab?.windowId)||tab.windowId<=0){safe(launchResult('没有可用的 Chrome 窗口。',revision));return;}
 const ticket={id:crypto.randomUUID(),windowId:tab.windowId,at:Date.now()};launch=ticket;
 // Prewarm the source separately. This first native API callback carries the
 // action interaction directly to an already listening, real tab renderer.
 chrome.runtime.getContexts({contextTypes:['TAB'],documentUrls:[sourceUrl]},contexts=>{
  const error=chrome.runtime.lastError?.message;if(launch!==ticket)return;
  const source=contexts?.find(c=>c.contextType==='TAB'&&c.documentUrl===sourceUrl&&Number.isInteger(c.tabId)&&c.tabId>0&&c.frameId===0&&typeof c.documentId==='string');
  if(error||!source){launch=null;safe(launchResult(error||'来源页尚未就绪，正在初始化。',revision));safe(ensureSource());return;}
  Object.assign(ticket,{sourceTabId:source.tabId,sourceDocumentId:source.documentId});
  chrome.runtime.sendMessage({type:'launch',target:'source',tabId:source.tabId,launchId:ticket.id}).then(reply=>{
   if(!reply?.ok)throw Error(reply?.error||'来源页未响应。');return launchResult(null,revision);
  }).catch(error=>safe(launchResult(error.message,revision)));
 });
});
chrome.runtime.onInstalled.addListener(()=>safe(ensureSource()));
chrome.runtime.onStartup.addListener(()=>safe(ensureSource()));
chrome.windows.onCreated.addListener(()=>safe(ensureSource()));
chrome.tabs.onRemoved.addListener(id=>{if(id===sourceTabId){sourceTabId=null;safe(ensureSource());}});
chrome.tabs.onUpdated.addListener((id,change)=>{
 if(id!==sourceTabId)return;
 if(change.status==='loading')safe(chrome.action.disable());
 if(change.url&&change.url!==sourceUrl){sourceTabId=null;safe(ensureSource());}
 else if(change.status==='complete')safe(ensureSource());
});
for(const event of [chrome.tabs.onActivated,chrome.tabs.onUpdated,chrome.tabs.onAttached,chrome.tabs.onDetached,chrome.tabs.onRemoved,chrome.windows.onRemoved])event.addListener(()=>safe(controller.reconcile()));
chrome.windows.onFocusChanged.addListener(id=>safe(controller.reconcile(id)));
chrome.windows.onBoundsChanged.addListener(window=>{
  const state=controller.status();
  if(window.id===state?.pipWindowId && window.state==='normal'){
    const bounds=validateBounds(window);
    if(bounds)safe(chrome.storage.local.set({bounds}));
  }else safe(controller.reconcile());
});
safe(Promise.all([controller.ready,configReady]).then(()=>controller.reconcile()));

safe(ensureSource());
