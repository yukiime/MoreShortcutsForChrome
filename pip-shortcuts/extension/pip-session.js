// The background source tab owns the actual Window object. The worker owns all tab
// selection and browser-window control; only this owner may close its PiP.
export function createPipSession({request,pictureInPicture,contentReady,getURL,hasActivation=()=>true}) {
  let pip=null,token=null,starting=false,content=null,closingPip=null;
  function closeWindow(value){if(value&&!value.closed&&closingPip!==value){closingPip=value;value.close();}}
  function updateState(state){
    if(state?.token!==token)return;
    if(content && state.error)content.error.textContent=state.error;
    if(state.closeRequested)closeWindow(pip);
  }
  async function launch(launchId){
    if(starting)throw Error('正在启动，请稍后再点一次扩展按钮。');
    starting=true;
    let created=null;
    try {
      const prepared=await request({type:'begin',launchId});
      content=await contentReady;
      content.render(prepared.data);
      if(pip && !pip.closed) {
        if(prepared.state?.token!==token)throw Error('浮窗会话已失效，请先关闭浮窗后重新点击扩展按钮。');
        const reused=await request({type:'reuse',launchId,token});updateState(reused.state);
        if(pip?.closed||!pip||closingPip===pip||reused.state?.token!==token||reused.state?.closeRequested||reused.state?.error||reused.state?.paused||reused.state?.visibility!=='normal')throw Error(reused.state?.error||'Chrome 无法恢复浮窗，请关闭浮窗后重新点击扩展按钮。');
        return;
      }
      if(prepared.state)throw Error('已有其他文档持有浮窗，请先停止原会话。');
      if(!pictureInPicture)throw Error('此 Chrome 不支持 Document Picture-in-Picture。');
      if(!hasActivation())throw Error('启动点击已超时，请再次点击扩展按钮。');
      token=launchId;
      // Extension messaging supplies real transient activation to this renderer.
      // No synthetic click or debugger is used. The live API must still accept it.
      created=await pictureInPicture.requestWindow({width:740,height:420,disallowReturnToOpener:true});
      pip=created;closingPip=null;
      const sessionToken=token;
      const link=created.document.createElement('link');link.rel='stylesheet';link.href=getURL('styles.css');
      created.document.head.append(link);created.document.title='额外快捷方式';created.document.body.className='pip';created.document.body.append(content.surface);
      created.addEventListener('pagehide',()=>{
        if(pip===created)pip=null;
        request({type:'stop',token:sessionToken}).catch(()=>{});
      },{once:true});
      const registered=await request({type:'register',token:sessionToken});
      updateState(registered.state);
      if(created.closed||closingPip===created||!registered.state||registered.state.token!==sessionToken||registered.state.error||registered.state.paused||registered.state.closeRequested)throw Error(registered.state?.error||'Chrome 无法保持浮窗，请再点一次扩展按钮。');
    }catch(error){
      closeWindow(created);
      throw error;
    }finally{starting=false;}
  }
  async function navigate(id,mode){
    if(!pip||pip.closed)throw Error('浮窗已关闭，请点击扩展按钮重新启动。');
    return request({type:'navigate',token,id,mode});
  }
  return {launch,updateState,navigate,close(){closeWindow(pip);}};
}
