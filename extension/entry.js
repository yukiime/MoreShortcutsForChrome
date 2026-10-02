// Called directly by action/command listeners, including on a cold worker.
// Do not insert ready.then(), an await, or a second native callback here.
export function openNewNtpWithPanel(api, tab, onError = () => {}) {
  if (!Number.isInteger(tab?.windowId) || tab.windowId < 1) {
    onError(new Error('无法确认新标签页所属窗口。')); return;
  }
  api.tabs.create({ windowId: tab.windowId, url: 'chrome://newtab/', active: true }, created => {
    if (api.runtime.lastError || !Number.isInteger(created?.id)) {
      onError(new Error(api.runtime.lastError?.message || '新标签页创建失败。')); return;
    }
    const path = `panel.html?tabId=${created.id}&windowId=${created.windowId}`;
    try {
      // Browser-side setOptions is synchronous. Dispatch both in this callback;
      // awaiting setOptions would create another interaction-token boundary.
      Promise.resolve(api.sidePanel.setOptions({ tabId: created.id, path, enabled: true })).catch(onError);
      Promise.resolve(api.sidePanel.open({ tabId: created.id })).catch(onError);
    } catch (error) { onError(error); }
  });
}
