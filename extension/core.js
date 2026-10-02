const NTP_PAGES = new Set([
  'chrome://newtab/',
  'chrome://new-tab-page/',
  'chrome://new-tab-page-third-party/',
  'chrome-search://local-ntp/local-ntp.html'
]);

export function isNativeNtp(tab) {
  const candidate = tab?.pendingUrl || tab?.url;
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    const path = url.pathname || '/';
    return !url.username && !url.password && NTP_PAGES.has(`${url.protocol}//${url.host}${path}`);
  } catch { return false; }
}

export function validateShortcuts(document) {
  if (document?.version !== 1 || !Array.isArray(document.shortcuts) || document.shortcuts.length > 1000) {
    throw new Error('清单必须是 version: 1 和 shortcuts 数组，最多 1000 项。');
  }
  const seen = new Set();
  return document.shortcuts.map(entry => {
    if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(entry.id) || seen.has(entry.id)) {
      throw new Error('每个入口需要唯一的 id。');
    }
    seen.add(entry.id);
    if (typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 100) throw new Error('入口标题需要 1 至 100 个字符。');
    const url = new URL(entry.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('URL 仅允许无账号密码的 HTTP/HTTPS 地址。');
    const icon = entry.icon ?? entry.title.trim().slice(0, 1);
    const color = entry.color ?? '#5f6368';
    if (typeof icon !== 'string' || !icon || [...icon].length > 3) throw new Error('文字图标需要 1 至 3 个字符。');
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('颜色必须为六位十六进制。');
    return { id: entry.id, title: entry.title.trim(), url: url.href, icon, color };
  });
}

export function panelContext(value, extensionBase) {
  try {
    const url = new URL(value);
    const base = new URL(extensionBase);
    if (url.protocol !== base.protocol || url.host !== base.host || url.pathname !== '/panel.html' || url.hash) return null;
    if ([...url.searchParams].length !== 2) return null;
    const tab = url.searchParams.get('tabId');
    const window = url.searchParams.get('windowId');
    if (!/^\d+$/.test(tab ?? '') || !/^\d+$/.test(window ?? '')) return null;
    const tabId = Number(tab), windowId = Number(window);
    return Number.isSafeInteger(tabId) && Number.isSafeInteger(windowId) && windowId > 0 ? { tabId, windowId } : null;
  } catch { return null; }
}
