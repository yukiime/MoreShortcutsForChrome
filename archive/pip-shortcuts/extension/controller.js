import {isNativeNtp, findPipWindow} from './core.js';

export function createController(api, initialShortcuts, onChange = () => {}) {
  let binding = null, shortcuts = initialShortcuts, tail = Promise.resolve(), revision = 0, knownFocus = null;
  let pendingWindowFocusIds = [], focusLostAt = null;
  const focusGraceMs=200;
  const closeExplanation=cause=>`Chrome 无法隐藏悬浮窗口，已请求关闭以免遮挡。请重新点击启动按钮。原因：${cause}`;
  const hostUrl = api.runtime.getURL('host.html');
  const hostMatches = value => { try { const u=new URL(value); return u.protocol===new URL(hostUrl).protocol && u.host===new URL(hostUrl).host && ['/host.html','/source.html'].includes(u.pathname); } catch { return false; } };
  const persist = async () => { await api.storage.session.set({binding}); onChange(status()); };
  const status = () => binding ? structuredClone(binding) : null;
  const validBinding = b => b && ['hostTabId','hostWindowId','pipWindowId'].every(k=>Number.isSafeInteger(b[k])&&b[k]>0) && b.hostWindowId!==b.pipWindowId && typeof b.token==='string' && b.token.length>0;
  async function verify(b) {
    if (!validBinding(b)) throw Error('无效的 PiP 会话。');
    const source=await api.tabs.get(b.hostTabId);
    if (!hostMatches(source.pendingUrl || source.url)) throw Error('来源标签页已关闭或导航。');
    const sourceUrl=new URL(source.pendingUrl||source.url).pathname==='/source.html'?api.runtime.getURL('source.html'):hostUrl;
    if(b.sourceDocumentId){
      const contexts=await api.runtime.getContexts({contextTypes:['TAB'],documentIds:[b.sourceDocumentId]});
      if(!contexts.some(c=>c.documentId===b.sourceDocumentId&&c.tabId===b.hostTabId&&c.contextType==='TAB'&&c.documentUrl===sourceUrl))throw Error('来源文档已更换。');
    }
    const pip=await api.windows.get(b.pipWindowId,{populate:true});
    if (!findPipWindow([], [pip], sourceUrl)) throw Error('不能安全识别 PiP 窗口。');
    return pip;
  }
  const ready = (async () => {
    const saved=(await api.storage.session.get('binding')).binding;
    if (!saved) return;
    try { await verify(saved); binding=structuredClone(saved); }
    catch { binding=null; await persist(); }
  })();
  const enqueue = fn => { const result=tail.then(()=>ready).then(fn); tail=result.catch(()=>{}); return result; };
  async function clearInternal() { binding=null; pendingWindowFocusIds=[]; await persist(); }
  async function reconcileInternal(ticket) {
    if (!binding) return;
    // NONE can be a transient event between two Chrome windows. Tab events must
    // not bypass this same grace while waiting for the next focus event.
    if(knownFocus===-1 && focusLostAt!==null) {
      const remaining=focusGraceMs-(Date.now()-focusLostAt);
      if(remaining>0) await new Promise(resolve=>setTimeout(resolve,remaining));
      if(ticket!==revision) return;
    }
    let pip;
    try { pip=await verify(binding); } catch { await clearInternal(); return; }
    if(ticket!==revision) return;
    const windows=await api.windows.getAll();
    if(ticket!==revision) return;
    const liveFocused=windows.find(w=>w.focused)?.id;
    const focused=knownFocus===null || knownFocus===-1 ? liveFocused : knownFocus;
    if(knownFocus===-1 && liveFocused!==undefined) {knownFocus=liveFocused;focusLostAt=null;}
    // Keep the NTP owner across external focus, but hide the always-on-top PiP
    // so it cannot cover another application. Chrome does not expose z-order.
    const useLastMain=focused===binding.pipWindowId || focused===-1 || focused===undefined;
    const mainWindow=id=>windows.find(w=>w.id===id && w.id!==binding.pipWindowId && w.type==='normal' && !w.alwaysOnTop);
    const rememberedMain=pendingWindowFocusIds.map(mainWindow).find(Boolean);
    const main=useLastMain ? (rememberedMain ?? mainWindow(binding.lastMainWindowId ?? binding.target?.windowId ?? binding.hostWindowId)) : mainWindow(focused);
    const tabs=main && main.state!=='minimized' ? await api.tabs.query({windowId:main.id,active:true}) : [];
    const tab=tabs.length===1 ? tabs[0] : null;
    const target=tab && isNativeNtp(tab) ? {tabId:tab.id,windowId:main.id} : null;
    if(ticket!==revision) return;
    pendingWindowFocusIds=[];
    const latestMain=main ?? rememberedMain;
    if(latestMain) binding.lastMainWindowId=latestMain.id;
    binding.target=target;
    const externalFocus=focused===-1 || focused===undefined;
    const desired=target && !binding.paused && !externalFocus ? 'normal' : 'minimized';
    if(binding.error) {
      // A prior restore error must not leave a visible overlay over other apps.
      binding.visibility=pip.state;
      if(desired==='minimized' && pip.state!=='minimized') {
        if(!binding.closeRequested) binding.error=closeExplanation(binding.error);
        binding.closeRequested=true;
      }
      await persist();return;
    }
    try {
      if(pip.state!==desired) {
        await api.windows.update(binding.pipWindowId,{state:desired});
        if(ticket!==revision) return;
        pip=await verify(binding);
        if(ticket!==revision) return;
        if(pip.state!==desired) throw Error(`Chrome 未将 PiP 状态变为 ${desired}。`);
      }
      binding.visibility=desired;
    } catch(error) {
      if(ticket!==revision) return;
      binding.visibility=pip.state; binding.paused=true;
      binding.closeRequested=desired==='minimized';
      binding.error=binding.closeRequested
        ? closeExplanation(error.message)
        : `自动显示已暂停：${error.message}`;
    }
    await persist();
  }
  function reconcile(focusId) {
    if(Number.isInteger(focusId)) {
      if(focusId===-1 && knownFocus!==-1) focusLostAt=Date.now();
      else if(focusId!==-1) focusLostAt=null;
      knownFocus=focusId;
      // Record focus before asynchronous reconciliation can be superseded.
      // Validate candidates against live main windows when the latest pass runs.
      if(focusId>0 && focusId!==binding?.pipWindowId)
        pendingWindowFocusIds=[focusId,...pendingWindowFocusIds.filter(id=>id!==focusId)];
    }
    const ticket=++revision;
    return enqueue(()=>reconcileInternal(ticket));
  }
  async function register(value) {
    return enqueue(async()=>{
      await verify(value);
      if(binding && (binding.hostTabId!==value.hostTabId || binding.token!==value.token)) throw Error('已有来源页控制 PiP，请先停止原会话。');
      binding={...value,lastMainWindowId:value.hostWindowId,target:null,paused:false,error:null,closeRequested:false,visibility:'normal'};
      // Preserve focus events already received during requestWindow / registration.
      // requestWindow initially focuses PiP. Seed only its opener's active NTP,
      // then reconcile validates the selected main window's current tab again.
      const initialTabs=await api.tabs.query({windowId:value.hostWindowId,active:true});
      if(initialTabs.length===1 && isNativeNtp(initialTabs[0]))
        binding.target={tabId:initialTabs[0].id,windowId:value.hostWindowId};
      await persist();
      await reconcileInternal(revision);
      return status();
    });
  }
  function openShortcut({id,mode,token}) {
    const clickRevision=revision;
    return enqueue(async()=>{
      if(!binding || binding.token!==token || binding.paused || !['current','background','foreground'].includes(mode)) throw Error('会话不可用，请回到新标签页后重新启动。');
      const shortcut=shortcuts.find(s=>s.id===id), target=binding.target;
      if(!shortcut || !target || clickRevision!==revision || (knownFocus!==null && knownFocus!==target.windowId && knownFocus!==binding.pipWindowId)) throw Error('当前没有可用的原生新标签页。');
      const ticket=revision;
      await verify(binding);
      const tab=await api.tabs.get(target.tabId);
      const main=await api.windows.get(target.windowId);
      if(ticket!==revision || tab.windowId!==target.windowId || !tab.active || !isNativeNtp(tab) || main.state==='minimized') throw Error('目标标签页已切换或正在导航。');
      if(mode==='current') await api.tabs.update(tab.id,{url:shortcut.url});
      else await api.tabs.create({windowId:target.windowId,url:shortcut.url,active:mode==='foreground'});
      await reconcileInternal(revision);
      return {ok:true};
    });
  }
  function setPaused(paused) {
    return enqueue(async()=>{
      if(!binding) throw Error('请先启动悬浮快捷方式。');
      binding.paused=Boolean(paused); if(!paused) {binding.error=null;binding.closeRequested=false;}
      await reconcileInternal(revision); return status();
    });
  }
  return {ready,status,register,reconcile,openShortcut,setPaused,clear:()=>enqueue(clearInternal),setShortcuts(value){shortcuts=value;}};
}
