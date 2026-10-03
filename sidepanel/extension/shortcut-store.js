import { normalizeShortcutEdit, validateShortcuts } from './core.js';

export function createShortcutStore(api, defaults) {
  const initial = validateShortcuts({ version: 1, shortcuts: defaults });
  let queue = Promise.resolve();
  const serialize = operation => {
    const task = queue.catch(() => {}).then(operation);
    queue = task;
    return task;
  };
  async function read() {
    const { shortcutDocument } = await api.storage.local.get('shortcutDocument');
    if (shortcutDocument === undefined) return { revision: 0, shortcuts: structuredClone(initial) };
    if (shortcutDocument?.version !== 1 || !Number.isSafeInteger(shortcutDocument.revision) || shortcutDocument.revision < 0) {
      throw new Error('已保存的快捷方式数据损坏，请先备份扩展数据。');
    }
    return { revision: shortcutDocument.revision, shortcuts: validateShortcuts(shortcutDocument) };
  }
  function edit(message, beforeSave = async () => {}) {
    return serialize(async () => {
      const document = await read();
      if (message.revision !== document.revision) throw new Error('另一侧栏已保存修改。草稿已保留，请刷新版本后重试。');
      if (document.revision === Number.MAX_SAFE_INTEGER) throw new Error('快捷方式版本已达上限。');
      const index = document.shortcuts.findIndex(entry => entry.id === message.id);
      if (index < 0) throw new Error('快捷方式不存在。');
      document.shortcuts[index] = { ...document.shortcuts[index], ...normalizeShortcutEdit(message) };
      document.revision++;
      await beforeSave();
      await api.storage.local.set({ shortcutDocument: { version: 1, ...document } });
      return document;
    });
  }
  async function getPreferences() {
    const { panelPreferences } = await api.storage.local.get('panelPreferences');
    if (panelPreferences === undefined) return { frequentSitesEnabled: false, autoOpenEnabled: false };
    if (panelPreferences?.version !== 1 || typeof panelPreferences.frequentSitesEnabled !== 'boolean' ||
        (panelPreferences.autoOpenEnabled !== undefined && typeof panelPreferences.autoOpenEnabled !== 'boolean')) {
      throw new Error('已保存的侧栏设置损坏。');
    }
    return { frequentSitesEnabled: panelPreferences.frequentSitesEnabled, autoOpenEnabled: panelPreferences.autoOpenEnabled ?? false };
  }
  function setPreferences(message, beforeSave = async () => {}) {
    return serialize(async () => {
      const previous = await getPreferences();
      const next = { ...previous };
      for (const key of ['frequentSitesEnabled', 'autoOpenEnabled']) {
        if (Object.hasOwn(message, key)) {
          if (typeof message[key] !== 'boolean') throw new Error('开关值必须是布尔值。');
          next[key] = message[key];
        }
      }
      await beforeSave();
      await api.storage.local.set({ panelPreferences: { version: 1, ...next } });
      return next;
    });
  }
  return { read, edit, getPreferences, setPreferences };
}
