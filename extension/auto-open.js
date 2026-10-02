import { isNativeNtp } from './core.js';

export function createAutoOpen(api, { ensureOffscreen, getPreferences, notify = () => {} }) {
  const pending = new Map(), jobs = new Map(), latest = new Map(), suppressed = new Set();
  let queue = Promise.resolve(), epoch = 0, sequence = 0, attached = null;
  function cancelAll() {
    epoch++; pending.clear(); latest.clear();
    if (attached) api.debugger.detach(attached).catch(() => {});
  }
  function forget(tabId) {
    suppressed.delete(tabId);
    for (const [id, request] of pending) if (request.tabId === tabId) pending.delete(id);
  }
  function opened(info) { if (info.tabId !== undefined) suppressed.add(info.tabId); }
  function closed(info) {
    if (info.tabId !== undefined) {
      suppressed.add(info.tabId);
      for (const [id, request] of pending) if (request.tabId === info.tabId) pending.delete(id);
    }
  }
  const current = request => !suppressed.has(request.tabId) && request.epoch === epoch && latest.get(request.windowId) === request.sequence;
  function handleMessage(message, sender, respond) {
    if (message?.type !== 'auto:gesture' || sender.id !== api.runtime.id || sender.url !== api.runtime.getURL('offscreen.html')) return false;
    const request = pending.get(message.requestId);
    if (!request || !current(request)) return false;
    // Consume once, directly in the message's worker interaction. Only one native
    // callback is crossed, without ready.then(), promises or queues before get().
    pending.delete(message.requestId);
    api.tabs.get(request.tabId, tab => {
      if (api.runtime.lastError || !current(request) || !tab?.active || tab.windowId !== request.windowId || !isNativeNtp(tab)) {
        respond({ ok: false, error: '自动显示请求已过期。' }); return;
      }
      try {
        const opening = api.sidePanel.open({ tabId: request.tabId });
        Promise.resolve(opening).then(() => {
          suppressed.add(request.tabId); respond({ ok: true });
        }, () => respond({ ok: false, error: '侧栏自动打开失败，请使用工具栏按钮或快捷键。' }));
      } catch { respond({ ok: false, error: '侧栏自动打开失败，请使用工具栏按钮或快捷键。' }); }
    });
    return true;
  }
  function request(tabId) {
    if (jobs.has(tabId)) return jobs.get(tabId);
    const captured = epoch, order = ++sequence;
    const job = (async () => {
      const tab = await api.tabs.get(tabId);
      if (!tab || captured !== epoch) return;
      if ((latest.get(tab.windowId) ?? 0) > order) return;
      latest.set(tab.windowId, order);
      if (!isNativeNtp(tab)) { forget(tabId); return; }
      if (!tab.active || suppressed.has(tabId) || !(await getPreferences()).autoOpenEnabled || captured !== epoch) return;
      const operation = async () => {
        const context = { tabId, windowId: tab.windowId, epoch: captured, sequence: order };
        if (!current(context) || !(await getPreferences()).autoOpenEnabled) return;
        const bound = await api.tabs.get(tabId);
        if (!current(context) || !bound?.active || bound.windowId !== context.windowId || !isNativeNtp(bound)) return;
        await api.sidePanel.setOptions({ tabId, path: `panel.html?tabId=${tabId}&windowId=${context.windowId}`, enabled: true });
        await ensureOffscreen();
        if (!current(context)) return;
        const targets = await api.debugger.getTargets();
        const target = targets.find(entry => entry.url === api.runtime.getURL('offscreen.html'));
        if (!target) throw new Error('无法找到本扩展的隐藏文档，请使用工具栏按钮或快捷键。');
        const debuggee = { targetId: target.id };
        const requestId = crypto.randomUUID();
        let didAttach = false, timer;
        try {
          await api.debugger.attach(debuggee, '1.3'); didAttach = true; attached = debuggee;
          if (!current(context)) return;
          pending.set(requestId, context);
          const result = await Promise.race([
            api.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
              expression: `window.requestAutoOpen(${JSON.stringify(requestId)})`, userGesture: true, awaitPromise: true, returnByValue: true
            }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('自动显示超时，请使用工具栏按钮或快捷键。')), 10000); })
          ]);
          if (result?.exceptionDetails || result?.result?.value?.ok === false) throw new Error('隐藏文档无法打开侧栏，请使用工具栏按钮或快捷键。');
        } finally {
          clearTimeout(timer); pending.delete(requestId);
          if (didAttach) { await api.debugger.detach(debuggee).catch(() => {}); if (attached === debuggee) attached = null; }
        }
      };
      const task = queue.catch(() => {}).then(operation); queue = task;
      await task;
    })().catch(() => {
      // Do not log debugger error strings, which can contain target URLs.
      notify({ type: 'auto:error', tabId, error: '原生自动显示失败。请用工具栏按钮或快捷键打开，或关闭实验模式。' });
    });
    jobs.set(tabId, job);
    job.finally(() => { if (jobs.get(tabId) === job) jobs.delete(tabId); });
    return job;
  }
  return { request, handleMessage, cancelAll, opened, closed, forget };
}
