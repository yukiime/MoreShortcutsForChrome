import {validateShortcuts,navigationMode} from './core.js';
const $=id=>document.getElementById(id);
const surface=$('surface'),grid=$('grid'),gridError=$('grid-error');
let pip=null,token=null,entries=[],starting=false,preparing=false,editorDirty=false,lastState=null,lastDiscovery=null;
const request=async message=>{const reply=await chrome.runtime.sendMessage(message);if(!reply?.ok)throw Error(reply?.error||'后台未响应，请重新加载扩展。');return reply;};
const showError=error=>{$('error').textContent=error?.message||String(error);};
function stateText(state){
 if(!state)return '尚未启动悬浮窗口。';
 if(state.error)return state.error;
 if(state.paused)return '已暂停，悬浮窗口已最小化。';
 return state.visibility==='normal'?'运行中：悬浮窗口显示在原生新标签页上。':'运行中：等待原生新标签页，悬浮窗口已最小化。';
}
function updateState(state){
 lastState=state;
 $('status').textContent=stateText(state);
 $('diagnostic').textContent=JSON.stringify({apiAvailable:'documentPictureInPicture'in window,state,discovery:lastDiscovery,shortcutCount:entries.length},null,2);
 const own=state?.token===token;
 $('pause').disabled=!own;$('stop').disabled=!own;
 $('pause').textContent=state?.paused?'恢复自动显示':'暂停显示';
 if(state?.error)$('error').textContent=state.error;
 if(own&&state.closeRequested&&pip&&!pip.closed)pip.close();
}
function render(){
 grid.replaceChildren();
 for(const entry of entries){
  const button=document.createElement('button');button.className='shortcut';button.title=`${entry.title}\n${entry.url}`;button.setAttribute('aria-label',entry.title);
  const icon=document.createElement('span');icon.className='icon';icon.style.color=entry.color;icon.textContent=entry.icon;icon.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.className='title';label.textContent=entry.title;button.append(icon,label);
  const navigate=async event=>{
   if(event.type==='auxclick'&&event.button!==1)return;
   event.preventDefault();
   const feedback=gridError;feedback.textContent='';
   try{if(!pip||pip.closed)throw Error('请先启动悬浮窗口，再进入原生新标签页。');await request({type:'navigate',token,id:entry.id,mode:navigationMode(event)});}catch(error){feedback.textContent=error.message;}
  };
  button.addEventListener('click',navigate);button.addEventListener('auxclick',navigate);grid.append(button);
 }
}
async function prepare(clearError=false){
 if(preparing||starting||pip&&!pip.closed)return;
 preparing=true;$('start').disabled=true;
 try{
  token=crypto.randomUUID();await request({type:'prepare',token});
  if(!('documentPictureInPicture'in window))throw Error('此浏览器不支持 Document Picture-in-Picture。');
  $('start').disabled=false;if(clearError)$('error').textContent='';
 }catch(error){showError(error);}finally{preparing=false;}
}
async function refresh(){const reply=await request({type:'status'});if(reply.lastLaunch?.error)showError(Error(reply.lastLaunch.error));lastDiscovery=reply.discovery??null;updateState(reply.state);return reply;}
async function start(){
 if(starting||!token)return;
 starting=true;$('start').disabled=true;$('error').textContent='';
 const sessionToken=token;
 try{
  // requestWindow must run before any await so the real click's activation is preserved.
  pip=await documentPictureInPicture.requestWindow({width:740,height:420,disallowReturnToOpener:true});
  const currentPip=pip;
  const link=currentPip.document.createElement('link');link.rel='stylesheet';link.href=chrome.runtime.getURL('styles.css');currentPip.document.head.append(link);currentPip.document.title='额外快捷方式';currentPip.document.body.className='pip';currentPip.document.body.append(surface);
  currentPip.addEventListener('pagehide',()=>{
   $('preview').append(surface);
   if(pip===currentPip)pip=null;
   request({type:'stop',token:sessionToken}).catch(()=>{}).finally(async()=>{await refresh().catch(showError);await prepare();});
  },{once:true});
  // Establish the intended NTP target before the first visibility reconciliation.
  await request({type:'newtab'});
  const reply=await request({type:'register',token:sessionToken});updateState(reply.state);
 }catch(error){showError(error);if(pip&&!pip.closed)pip.close();}
 finally{starting=false;if(!pip)await prepare();}
}
$('start').addEventListener('click',start);
$('newtab').addEventListener('click',()=>request({type:'newtab'}).catch(showError));
$('pause').addEventListener('click',async()=>{try{const {state}=await refresh();const result=await request({type:'pause',token,paused:!state?.paused});updateState(result.state);}catch(error){showError(error);}});
$('stop').addEventListener('click',()=>{if(pip&&!pip.closed)pip.close();});
$('refresh').addEventListener('click',async()=>{try{await refresh();await prepare(true);}catch(error){showError(error);}});
$('json').addEventListener('input',()=>{editorDirty=true;});
$('save').addEventListener('click',async()=>{try{const data=JSON.parse($('json').value);const validated=validateShortcuts(data);await request({type:'save',data});entries=validated;editorDirty=false;render();$('error').textContent='';$('status').textContent=`已保存 ${entries.length} 个快捷方式。`;}catch(error){showError(error);}});
$('copy').addEventListener('click',async()=>{try{validateShortcuts(JSON.parse($('json').value));await navigator.clipboard.writeText($('json').value);$('status').textContent='清单已复制。';}catch(error){showError(Error(`复制失败，请手动全选文本框复制。${error.message}`));}});
chrome.runtime.onMessage.addListener(message=>{
 if(message?.type==='state')updateState(message.state);
 if(message?.type==='data')try{entries=validateShortcuts(message.data);render();if(!editorDirty)$('json').value=JSON.stringify(message.data,null,2);updateState(lastState);}catch(error){showError(error);}
});
window.addEventListener('pagehide',()=>{if(pip&&!pip.closed)pip.close();});
try{const reply=await refresh();entries=validateShortcuts(reply.data);$('json').value=JSON.stringify(reply.data,null,2);render();updateState(reply.state);await prepare();}catch(error){showError(error);}
