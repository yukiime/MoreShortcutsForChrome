const NTP_PAGES = new Set([
  'chrome://newtab/',
  'chrome://new-tab-page/',
  'chrome://new-tab-page-third-party/',
  'chrome-search://local-ntp/local-ntp.html'
]);

export function isNativeNtp(tab) {
  const candidate = tab?.pendingUrl || tab?.url;
  if (typeof candidate !== 'string' || !candidate) return false;
  try {
    const url = new URL(candidate);
    return !url.username && !url.password &&
      NTP_PAGES.has(`${url.protocol}//${url.host}${url.pathname || '/'}`);
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
    if (typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 100) {
      throw new Error('入口标题需要 1 至 100 个字符。');
    }
    if (typeof entry.url !== 'string') throw new Error('URL 必须是 HTTP/HTTPS 地址字符串。');
    let url;
    try { url = new URL(entry.url); } catch { throw new Error('URL 地址无效。'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('URL 仅允许无账号密码的 HTTP/HTTPS 地址。');
    }
    const title = entry.title.trim();
    const icon = entry.icon ?? [...title][0];
    const color = entry.color ?? '#5f6368';
    if (typeof icon !== 'string' || [...icon].length < 1 || [...icon].length > 3) {
      throw new Error('文字图标需要 1 至 3 个字符。');
    }
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
      throw new Error('颜色必须为六位十六进制。');
    }
    return { id: entry.id, title, url: url.href, icon, color };
  });
}

function pageIdentity(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return `${url.protocol}//${url.host}${url.pathname}${url.hash}`;
  } catch { return null; }
}

export function findPipWindow(before, after, hostUrl) {
  if (!Array.isArray(before) || !Array.isArray(after)) return null;
  const hostIdentity = pageIdentity(hostUrl);
  if (!hostIdentity) return null;
  const oldIds = new Set(before.map(window => window?.id));
  const candidates = after.filter(window => Number.isSafeInteger(window?.id) && window.id >= 0 &&
    !oldIds.has(window.id) && window.type === 'normal' && window.alwaysOnTop === true);
  // Even a distinguishable foreign candidate makes creation ambiguous.
  if (candidates.length !== 1) return null;
  const window = candidates[0];
  if (window.tabs !== undefined && !Array.isArray(window.tabs)) return null;
  for (const tab of window.tabs ?? []) {
    if (!tab || typeof tab !== 'object') return null;
    // Chrome exposes Document PiP as about:blank, with its origin inherited from the opener.
    // The before/after snapshot and unique always-on-top candidate remain mandatory.
    for (const value of [tab.url, tab.pendingUrl]) {
      if (value !== undefined && value !== 'about:blank' && pageIdentity(value) !== hostIdentity) return null;
    }
  }
  return window;
}

export function navigationMode(event) {
  if (event?.metaKey || event?.ctrlKey || event?.button === 1) return 'background';
  return event?.shiftKey ? 'foreground' : 'current';
}

export function validateBounds(value) {
  if (!value || typeof value !== 'object') return null;
  const { left, top, width, height } = value;
  if (![left, top, width, height].every(Number.isSafeInteger) ||
    Math.abs(left) > 20000 || Math.abs(top) > 20000 ||
    width < 200 || width > 1600 || height < 120 || height > 1200) return null;
  return { left, top, width, height };
}
