import { openNewNtpWithPanel } from './entry.js';
import { validateShortcuts } from './core.js';
import { disableAllPanels } from './controller.js';
import { createPanelService } from './panel-service.js';
import { createAutoOpen } from './auto-open.js';
import { createOffscreenClient } from './offscreen-client.js';

let logQueue = Promise.resolve();
function record(event, details = {}) {
  logQueue = logQueue.catch(() => {}).then(async () => {
    const { events = [] } = await chrome.storage.session.get('events');
    events.push({ time: new Date().toISOString(), event, ...details });
    await chrome.storage.session.set({ events: events.slice(-120) });
  });
  return logQueue;
}

let controller, service;
function notify(message) { chrome.runtime.sendMessage(message).catch(() => {}); }
const experimental = chrome.runtime.getManifest().permissions.includes('debugger');
const offscreen = experimental ? createOffscreenClient(chrome) : null;
const auto = experimental ? createAutoOpen(chrome, {
  ensureOffscreen: offscreen.ensure, getPreferences: () => service.store.getPreferences(), notify, record
}) : null;
const ready = fetch(chrome.runtime.getURL('shortcuts.json'))
  .then(response => { if (!response.ok) throw new Error('清单读取失败'); return response.json(); })
  .then(validateShortcuts)
  .then(async shortcuts => {
    service = createPanelService(chrome, shortcuts, record, notify, offscreen?.rank);
    await service.store.read();
    controller = service.controller;
    await controller.initialize();
    return controller;
  });

async function syncAndAuto(controller, tabId) {
  await controller.syncTab(tabId);
  auto?.request(tabId);
}

function run(task) {
  ready.then(task).catch(error => {
    console.error('[NTP shortcuts]', error);
    record('error', { error: error.message }).catch(() => {});
  });
}

chrome.action.onClicked.addListener(tab => openNewNtpWithPanel(chrome, tab, error => {
  record('entry-error', { error: error.message }).catch(() => {});
}));
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'new-ntp-with-panel') openNewNtpWithPanel(chrome, tab, error => {
    record('entry-error', { error: error.message }).catch(() => {});
  });
});

// Register synchronously on every worker evaluation. No keepalive timer/port.
chrome.tabs.onCreated.addListener(tab => run(c => syncAndAuto(c, tab.id)));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url !== undefined) service?.invalidateTab(tabId);
  if (change.url !== undefined || change.status !== undefined) run(c => syncAndAuto(c, tabId));
});
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  service?.invalidateTab(tabId);
  run(c => syncAndAuto(c, tabId));
  notify({ type: 'panel:resume', tabId, windowId });
});
chrome.tabs.onAttached.addListener(tabId => { service?.invalidateTab(tabId); auto?.forget(tabId); run(c => syncAndAuto(c, tabId)); });
chrome.tabs.onReplaced.addListener(addedTabId => run(c => syncAndAuto(c, addedTabId)));
chrome.tabs.onRemoved.addListener((tabId, { windowId }) => { service?.invalidateTab(tabId); auto?.forget(tabId); record('tab-removed', { tabId, windowId }).catch(() => {}); });
chrome.windows.onRemoved.addListener(windowId => { record('window-removed', { windowId }).catch(() => {}); });
chrome.sidePanel.onOpened.addListener(info => { auto?.opened(info); run(c => c.panelOpened(info)); notify({ type: 'panel:resume', ...info }); });
chrome.sidePanel.onClosed.addListener(info => { auto?.closed(info); if (info.tabId !== undefined) service?.invalidateTab(info.tabId); record('panel-closed', info).catch(() => {}); });
chrome.runtime.onInstalled.addListener(({ reason }) => { run(() => record('extension-installed', { reason })); });
chrome.runtime.onStartup.addListener(() => { run(() => record('browser-startup')); });
const requestTypes = new Set(['navigate', 'shortcuts:get', 'shortcuts:edit', 'preferences:get', 'preferences:set', 'frequent:get', 'frequent:clear']);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (auto?.handleMessage(message, sender, respond)) return true;
  if (!requestTypes.has(message?.type)) return false;
  ready.then(() => service.handle(message, sender))
    .then(respond, error => {
      // History failures can include private URLs in API error text. Never log them.
      respond({ ok: false, error: error.message });
    });
  return true;
});
chrome.permissions.onRemoved.addListener(info => {
  if (info.permissions.includes('history')) service?.invalidateHistory();
});
let historyEventsBound = false;
function bindHistoryEvents() {
  if (!historyEventsBound && chrome.history?.onVisitRemoved) {
    chrome.history.onVisitRemoved.addListener(() => service?.invalidateHistory());
    historyEventsBound = true;
  }
}
bindHistoryEvents();
chrome.permissions.onAdded.addListener(info => {
  if (info.permissions.includes('history')) bindHistoryEvents();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.panelPreferences && !changes.panelPreferences.newValue?.autoOpenEnabled) auto?.cancelAll();
  if (area === 'local' && changes.panelPreferences?.newValue?.frequentSitesEnabled !== undefined &&
      !changes.panelPreferences.newValue.frequentSitesEnabled) service?.invalidateHistory();
});
ready.catch(error => {
  console.error('[NTP shortcuts startup]', error);
  // Global defaults do not override existing tab-specific configurations.
  disableAllPanels(chrome).then(errors => record('startup-cleanup', { errors })).catch(() => {});
  record('startup-error', { error: error.message }).catch(() => {});
});
