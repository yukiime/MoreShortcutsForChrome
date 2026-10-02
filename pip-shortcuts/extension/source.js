import {validateShortcuts,navigationMode} from './core.js';
import {createPipSession} from './pip-session.js';
const request=async message=>{const reply=await chrome.runtime.sendMessage(message);if(!reply?.ok)throw Error(reply?.error||'扩展后台未响应，请重载扩展。');return reply;};
let session,ownTabId=null;
// Build the source UI before enabling the toolbar. This tab stays inactive.
const contentReady=(async()=>{
  const response=await fetch(chrome.runtime.getURL('pip-content.html'));
  if(!response.ok)throw Error('无法读取快捷方式模板。');
  const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
  const surface=document.adoptNode(parsed.getElementById('surface'));
  const grid=surface.querySelector('#grid'),error=surface.querySelector('#grid-error');
  function render(data){
    const entries=validateShortcuts(data);grid.replaceChildren();
    for(const entry of entries){
      const button=document.createElement('button');button.className='shortcut';button.title=`${entry.title}\n${entry.url}`;button.setAttribute('aria-label',entry.title);
      const icon=document.createElement('span');icon.className='icon';icon.style.color=entry.color;icon.textContent=entry.icon;icon.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.className='title';label.textContent=entry.title;button.append(icon,label);
      const navigate=event=>{
        if(event.type==='auxclick'&&event.button!==1)return;
        event.preventDefault();error.textContent='';
        session.navigate(entry.id,navigationMode(event)).catch(failure=>{error.textContent=failure.message;});
      };
      button.addEventListener('click',navigate);button.addEventListener('auxclick',navigate);grid.append(button);
    }
  }
  return {surface,error,render};
})();
// Avoid an unhandled rejection before the first launch, while preserving the
// rejection for the launch response and toolbar's error badge.
contentReady.catch(()=>{});
const identityReady=contentReady.then(()=>request({type:'source-ready'})).then(identity=>{ownTabId=identity.tabId;return identity;});
identityReady.catch(error=>request({type:'source-error',error:error.message}).catch(()=>{}));
session=createPipSession({request,pictureInPicture:window.documentPictureInPicture,contentReady,getURL:path=>chrome.runtime.getURL(path),hasActivation:()=>navigator.userActivation.isActive});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id)return false;
  if(message?.type==='state'){session.updateState(message.state);return false;}
  if(message?.type==='data'){contentReady.then(content=>content.render(message.data)).catch(()=>{});return false;}
  if(!['launch','source-ping'].includes(message?.type)||message.target!=='source')return false;
  if(ownTabId!==null&&ownTabId!==message.tabId)return false;
  // Only the worker can launch or probe this real browser tab.
  if(sender.tab||sender.documentId||sender.url&&sender.url!==chrome.runtime.getURL('worker.js'))return false;
  identityReady.then(identity=>{
    if(identity.tabId!==message.tabId)return null;
    if(message.type==='source-ping')return {ok:true,tabId:identity.tabId};
    return session.launch(message.launchId).then(()=>({ok:true}));
  }).then(reply=>{if(reply)respond(reply);},error=>respond({ok:false,error:error.message}));
  return true;
});
window.addEventListener('pagehide',()=>session.close());
