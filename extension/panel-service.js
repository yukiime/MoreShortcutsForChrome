import { createShortcutStore } from './shortcut-store.js';
import { createController } from './controller.js';
import { rankFrequentSites, scanHistory } from './frequent-sites.js';

export function createPanelService(api, defaults, record = async () => {}, notify = () => {}, rank = async items => rankFrequentSites(items)) {
  const store = createShortcutStore(api, defaults);
  const caches = new Map(), requests = new Map();
  let generation = 0;
  const keyFor = context => `${context.windowId}:${context.tabId}`;
  function clear(context) { const key = keyFor(context); caches.delete(key); requests.delete(key); }
  function invalidateHistory() {
    generation++; caches.clear(); requests.clear(); notify({ type: 'frequent:invalidated' });
  }
  function invalidateTab(tabId) {
    for (const key of new Set([...caches.keys(), ...requests.keys()])) {
      if (key.endsWith(`:${tabId}`)) { caches.delete(key); requests.delete(key); }
    }
  }
  async function allowed() {
    if (!(await store.getPreferences()).frequentSitesEnabled) throw new Error('常访问开关已关闭。');
    if (!await api.permissions.contains({ permissions: ['history'] })) throw new Error('请点击允许读取历史后再查看。');
  }
  async function resolveFrequent(message, context) {
    const key = keyFor(context), captured = generation;
    await allowed();
    const cache = caches.get(key);
    if (captured !== generation || !cache || cache.token !== message.token) throw new Error('常访问列表已过期，请刷新。');
    const entry = cache.sites.find(site => site.id === message.shortcutId);
    return entry ? { ...entry, isValid: () => captured === generation && caches.get(key) === cache } : null;
  }
  const controller = createController(api, defaults, record, async () => (await store.read()).shortcuts, resolveFrequent);

  async function frequent(sender) {
    const context = await controller.withPanelContext(sender, async context => context);
    const key = keyFor(context), token = crypto.randomUUID(), captured = generation;
    caches.delete(key); requests.set(key, token);
    const isCurrent = () => captured === generation && requests.get(key) === token;
    try {
      await allowed();
      if (!isCurrent()) throw new Error('常访问列表已过期，请刷新。');
      const items = await scanHistory(api, { isCurrent });
      const sites = await rank(items);
      await allowed();
      return await controller.withPanelContext(sender, async () => {
        if (!isCurrent()) throw new Error('常访问列表已过期，请刷新。');
        caches.set(key, { token, sites });
        return { ok: true, token, sites };
      });
    } catch (error) {
      if (requests.get(key) === token) clear(context);
      throw error;
    }
  }

  async function handle(message, sender) {
    if (message?.type === 'navigate') return controller.navigate(message, sender);
    if (message?.type === 'frequent:get') return frequent(sender);
    return controller.withPanelContext(sender, async (context, validate) => {
      switch (message?.type) {
        case 'shortcuts:get': {
          const document = await store.read(); await validate(); return { ok: true, ...document };
        }
        case 'shortcuts:edit': {
          const document = await store.edit(message, validate); return { ok: true, ...document };
        }
        case 'preferences:get': {
          const preferences = await store.getPreferences(); await validate(); return { ok: true, ...preferences };
        }
        case 'preferences:set': {
          if (message.autoOpenEnabled === true && !api.runtime.getManifest?.().permissions.includes('debugger')) throw new Error('此版本未包含原生自动显示实验。');
          const preferences = await store.setPreferences(message, validate);
          if (!preferences.frequentSitesEnabled) invalidateHistory();
          return { ok: true, ...preferences };
        }
        case 'frequent:clear': clear(context); return { ok: true };
        default: throw new Error('未知侧栏请求。');
      }
    });
  }
  return { handle, controller, store, invalidateHistory, invalidateTab };
}
