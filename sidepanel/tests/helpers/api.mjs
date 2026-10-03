export function fixture() {
  const data = {}, tabs = [{id:7,windowId:3,index:1,active:true,url:'chrome://newtab/'},{id:8,windowId:4,index:0,active:true,url:'chrome://newtab/'}];
  let permission=true, searches=0;
  const api={runtime:{id:'abc',getURL:p=>`chrome-extension://abc/${p}`},
    tabs:{get:async id=>structuredClone(tabs.find(t=>t.id===id)),query:async q=>structuredClone(tabs.filter(t=>(!q.active||t.active)&&(q.windowId===undefined||q.windowId===t.windowId))),update:async(id,d)=>Object.assign(tabs.find(t=>t.id===id),d),create:async d=>({id:99,...d})},
    storage:{local:{get:async key=>structuredClone({[key]:data[key]}),set:async d=>Object.assign(data,structuredClone(d))}},
    permissions:{contains:async()=>permission},history:{search:async()=>{searches++;return [{id:'h',url:'https://example.net/a',visitCount:8,lastVisitTime:10}];}}};
  const sender={id:'abc',url:'chrome-extension://abc/panel.html?tabId=7&windowId=3'};
  return {api,tabs,data,sender,searches:()=>searches,revoke:()=>{permission=false;}};
}
export const defaults=[{id:'one',title:'One',url:'https://example.com/',icon:'1',color:'#123456'}];
