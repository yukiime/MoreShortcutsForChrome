import { isNativeNtp, panelContext } from './core.js';

export async function disableAllPanels(api) {
  const errors = [];
  function collect(results) {
    for (const result of results) if (result.status === 'rejected') errors.push(result.reason.message);
  }
  collect(await Promise.allSettled([api.sidePanel.setOptions({ enabled: false }), api.action.disable()]));
  let tabs;
  try { tabs = await api.tabs.query({}); } catch (error) { return [...errors, error.message]; }
  await Promise.all(tabs.map(async tab => {
    try {
      const option = await api.sidePanel.getOptions({ tabId: tab.id });
      const context = panelContext(api.runtime.getURL(option.path || ''), api.runtime.getURL(''));
      if (option.enabled && context?.tabId === tab.id) await api.sidePanel.close({ tabId: tab.id });
    } catch (error) { errors.push(error.message); }
    // Independent operations both run even if a tab disappears or close() rejects.
    collect(await Promise.allSettled([
      api.sidePanel.setOptions({ tabId: tab.id, enabled: false }), api.action.disable(tab.id)
    ]));
  }));
  return errors;
}

export function createController(api, shortcuts, record = async () => {}, readShortcuts = async () => shortcuts, resolveFrequent = async () => null) {
  const queues = new Map();
  const pathFor = tab => `panel.html?tabId=${tab.id}&windowId=${tab.windowId}`;
  const safelyRecord = (event, details) => Promise.resolve(record(event, details)).catch(() => {});

  async function reconcile(tabId) {
    let tab;
    try { tab = await api.tabs.get(tabId); } catch { return; }
    const enabled = isNativeNtp(tab);
    const current = await api.sidePanel.getOptions({ tabId });
    const path = pathFor(tab);
    const wasThisTab = panelContext(api.runtime.getURL(current.path || ''), api.runtime.getURL(''))?.tabId === tabId;
    if (!enabled && current.enabled && wasThisTab) {
      // Chrome >=145: tabId closes ONLY a tab-specific panel. No global fallback.
      try { await api.sidePanel.close({ tabId }); }
      catch (error) { await safelyRecord('tab-close-error', { tabId, windowId: tab.windowId, error: error.message }); }
    }
    if (current.enabled !== enabled || current.path !== path) {
      await api.sidePanel.setOptions({ tabId, path, enabled });
      await safelyRecord('eligibility', {
        tabId, windowId: tab.windowId, enabled,
        source: tab.pendingUrl ? 'pendingUrl' : tab.url ? 'url' : 'unavailable',
        ntpUrl: enabled ? (tab.pendingUrl || tab.url) : undefined
      });
    }
    await api.action.setTitle({ tabId, title: '新建原生标签页并打开快捷方式' });
    await api.action.enable(tabId);
  }

  function enqueue(tabId, operation) {
    const previous = queues.get(tabId) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(operation);
    queues.set(tabId, task);
    task.finally(() => { if (queues.get(tabId) === task) queues.delete(tabId); }).catch(() => {});
    return task;
  }

  const syncTab = tabId => enqueue(tabId, () => reconcile(tabId));

  async function initialize() {
    await api.sidePanel.setOptions({ path: 'panel.html', enabled: false });
    await api.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    const tabs = await api.tabs.query({});
    const results = await Promise.allSettled(tabs.filter(tab => Number.isInteger(tab.id)).map(tab => syncTab(tab.id)));
    for (const result of results) {
      if (result.status === 'rejected') await safelyRecord('tab-reconcile-error', { error: result.reason.message });
    }
    await safelyRecord('worker-ready', { tabs: tabs.length, version: api.runtime.getManifest?.().version });
  }

  async function panelOpened(info) {
    await safelyRecord('panel-opened', info);
    if (info.tabId === undefined) {
      // We never intentionally open a global panel. Closing uses its window scope.
      await api.sidePanel.close({ windowId: info.windowId });
      await safelyRecord('unexpected-global-closed', { windowId: info.windowId });
    }
  }

  async function validateContext(context) {
    const [active] = await api.tabs.query({ active: true, windowId: context.windowId });
    const bound = await api.tabs.get(context.tabId);
    if (bound.windowId !== context.windowId || !bound.active || active?.id !== bound.id || !isNativeNtp(bound) || !isNativeNtp(active)) {
      throw new Error('原标签已离开 NTP、移到其他窗口或不再活动，请返回 NTP 后重新打开。');
    }
    return bound;
  }

  function withPanelContext(sender, operation) {
    const context = panelContext(sender.url, api.runtime.getURL(''));
    if (sender.id !== api.runtime.id || !context) return Promise.reject(new Error('无法确认侧边栏所属窗口，请重新打开。'));
    return enqueue(context.tabId, async () => {
      await validateContext(context);
      return operation(context, () => validateContext(context));
    });
  }

  async function navigate(message, sender) {
    if (!['current', 'background', 'foreground'].includes(message.disposition) ||
        (message.source !== undefined && !['custom', 'frequent'].includes(message.source))) throw new Error('入口或打开方式无效。');
    return withPanelContext(sender, async (context, validate) => {
      const shortcut = message.source === 'frequent'
        ? await resolveFrequent(message, context)
        : (await readShortcuts()).find(entry => entry.id === message.shortcutId);
      if (!shortcut) throw new Error('入口无效或列表已过期，请刷新。');
      const bound = await validate();
      if (shortcut.isValid && !shortcut.isValid()) throw new Error('常访问列表已过期，请刷新。');
      if (message.disposition === 'current') {
        await api.tabs.update(bound.id, { url: shortcut.url });
      } else {
        await api.tabs.create({ windowId: context.windowId, index: bound.index + 1, url: shortcut.url, active: message.disposition === 'foreground' });
      }
      await safelyRecord('shortcut-navigation', { tabId: bound.id, windowId: context.windowId, shortcutId: message.source === 'frequent' ? undefined : shortcut.id, source: message.source || 'custom', disposition: message.disposition });
      return { ok: true };
    });
  }

  return { initialize, syncTab, navigate, panelOpened, withPanelContext };
}
