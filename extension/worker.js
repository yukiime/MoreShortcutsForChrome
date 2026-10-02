import { validateShortcuts } from './core.js';
import { createController, disableAllPanels } from './controller.js';

let logQueue = Promise.resolve();
function record(event, details = {}) {
  logQueue = logQueue.catch(() => {}).then(async () => {
    const { events = [] } = await chrome.storage.session.get('events');
    events.push({ time: new Date().toISOString(), event, ...details });
    await chrome.storage.session.set({ events: events.slice(-120) });
  });
  return logQueue;
}

let controller;
const ready = fetch(chrome.runtime.getURL('shortcuts.json'))
  .then(response => { if (!response.ok) throw new Error('清单读取失败'); return response.json(); })
  .then(validateShortcuts)
  .then(async shortcuts => {
    controller = createController(chrome, shortcuts, record);
    await controller.initialize();
    return controller;
  });

function run(task) {
  ready.then(task).catch(error => {
    console.error('[NTP shortcuts]', error);
    record('error', { error: error.message }).catch(() => {});
  });
}

// Register synchronously on every worker evaluation. No keepalive timer/port.
chrome.tabs.onCreated.addListener(tab => run(c => c.syncTab(tab.id)));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url !== undefined || change.status !== undefined) run(c => c.syncTab(tabId));
});
chrome.tabs.onActivated.addListener(({ tabId }) => run(c => c.syncTab(tabId)));
chrome.tabs.onAttached.addListener(tabId => run(c => c.syncTab(tabId)));
chrome.tabs.onReplaced.addListener(addedTabId => run(c => c.syncTab(addedTabId)));
chrome.tabs.onRemoved.addListener((tabId, { windowId }) => { record('tab-removed', { tabId, windowId }).catch(() => {}); });
chrome.windows.onRemoved.addListener(windowId => { record('window-removed', { windowId }).catch(() => {}); });
chrome.sidePanel.onOpened.addListener(info => run(c => c.panelOpened(info)));
chrome.sidePanel.onClosed.addListener(info => { record('panel-closed', info).catch(() => {}); });
chrome.runtime.onInstalled.addListener(({ reason }) => { run(() => record('extension-installed', { reason })); });
chrome.runtime.onStartup.addListener(() => { run(() => record('browser-startup')); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'navigate') return false;
  ready.then(c => c.navigate(message, sender))
    .then(respond, error => {
      record('navigation-rejected', { error: error.message }).catch(() => {});
      respond({ ok: false, error: error.message });
    });
  return true;
});
ready.catch(error => {
  console.error('[NTP shortcuts startup]', error);
  // Global defaults do not override existing tab-specific configurations.
  disableAllPanels(chrome).then(errors => record('startup-cleanup', { errors })).catch(() => {});
  record('startup-error', { error: error.message }).catch(() => {});
});
