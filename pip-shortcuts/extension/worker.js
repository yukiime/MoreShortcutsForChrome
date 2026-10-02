import {validateShortcuts, findPipWindow, validateBounds} from './core.js';
import {createController} from './controller.js';

const hostUrl=chrome.runtime.getURL('host.html');
let data=null;
const controller=createController(chrome,[],state=>chrome.runtime.sendMessage({type:'state',state}).catch(()=>{}));
// Register every MV3 event synchronously. Initial data is loaded behind configReady.
const configReady=(async()=>{
  const defaultDocument=await (await fetch(chrome.runtime.getURL('shortcuts.json'))).json();
  data=defaultDocument;
  try {const saved=(await chrome.storage.local.get('shortcuts')).shortcuts;if(saved){validateShortcuts(saved);data=saved;}} catch(error){console.warn('Saved shortcuts rejected:',error.message);}
  controller.setShortcuts(validateShortcuts(data));
})();
const safe=promise=>promise.catch(error=>console.warn('PiP:',error.message));

function trusted(sender) {
  if(sender.id!==chrome.runtime.id || !Number.isInteger(sender.tab?.id)) return false;
  try {const u=new URL(sender.url); const h=new URL(hostUrl);return u.protocol===h.protocol&&u.host===h.host&&u.pathname===h.pathname;}catch{return false;}
}
function ownSession(sender,token) {
  const state=controller.status();
  return state && state.hostTabId===sender.tab.id && state.token===token;
}
async function handle(message,sender){
  await Promise.all([controller.ready,configReady]);
  if(!trusted(sender)) throw Error('仅来源页可以控制悬浮快捷方式。');
  if(message.type==='status')return {state:controller.status(),data,discovery:(await chrome.storage.session.get('discovery')).discovery??null,bounds:(await chrome.storage.local.get('bounds')).bounds??null};
  if(message.type==='prepare'){
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
    if(!attempt||attempt.hostTabId!==sender.tab.id||attempt.token!==message.token)throw Error('启动准备已过期，请重试。');
    const after=await chrome.windows.getAll({populate:true});
    const urlClass=url=>!url?'unknown':url===hostUrl?'source':url==='about:blank'?'blank':'other';
    await chrome.storage.session.set({discovery:{before:attempt.before.map(w=>w.id),after:after.filter(w=>!attempt.before.some(old=>old.id===w.id)).map(w=>({id:w.id,type:w.type,alwaysOnTop:w.alwaysOnTop,focused:w.focused,state:w.state,tabs:(w.tabs??[]).map(t=>({id:t.id,urlClass:urlClass(t.pendingUrl||t.url)}))}))}});
    const pip=findPipWindow(attempt.before,after,hostUrl);
    if(!pip)throw Error('此 Chrome 未暴露唯一可安全控制的 PiP 窗口，无法开启自动模式。');
    // Clear the one-use attempt before control begins.
    await chrome.storage.session.set({attempt:null});
    const tab=await chrome.tabs.get(sender.tab.id);
    const state=await controller.register({hostTabId:tab.id,hostWindowId:tab.windowId,pipWindowId:pip.id,token:message.token});
    const bounds=validateBounds((await chrome.storage.local.get('bounds')).bounds);
    if(bounds)try{await chrome.windows.update(pip.id,bounds);}catch(error){console.warn('Bounds not restored:',error.message);}
    return {state};
  }
  if(message.type==='newtab'){
    const source=await chrome.tabs.get(sender.tab.id);
    await chrome.tabs.create({windowId:source.windowId,url:'chrome://newtab/'});return {ok:true};
  }
  if(message.type==='save'){
    const active=controller.status();
    if(active && active.hostTabId!==sender.tab.id)throw Error('请在正在控制 PiP 的来源页中编辑清单。');
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
  if(message?.type==='state'||message?.type==='data')return false;
  handle(message,sender).then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:error.message}));
  return true;
});
chrome.action.onClicked.addListener(()=>safe((async()=>{
  const tabs=await chrome.tabs.query({});
  const host=tabs.find(tab=>tab.url===hostUrl);
  if(host){await chrome.tabs.update(host.id,{active:true});await chrome.windows.update(host.windowId,{focused:true});}
  else await chrome.tabs.create({url:hostUrl});
})()));
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
