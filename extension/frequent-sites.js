export function rankFrequentSites(items, limit = 20) {
  const hosts = new Map();
  for (const item of items) {
    let url;
    try { url = new URL(item.url); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        !Number.isSafeInteger(item.visitCount) || item.visitCount <= 0) continue;
    const id = url.hostname;
    const lastVisitTime = Number.isFinite(item.lastVisitTime) ? item.lastVisitTime : 0;
    const root = `${url.origin}/`;
    const previous = hosts.get(id);
    if (!previous) hosts.set(id, { id, title: id, url: root, visitCount: item.visitCount, lastVisitTime });
    else {
      previous.visitCount += item.visitCount;
      previous.lastVisitTime = Math.max(previous.lastVisitTime, lastVisitTime);
      if ((url.protocol === 'https:' && !previous.url.startsWith('https:')) ||
          (url.protocol === new URL(previous.url).protocol && root < previous.url)) previous.url = root;
    }
  }
  return [...hosts.values()].sort((a, b) => b.visitCount - a.visitCount || b.lastVisitTime - a.lastVisitTime ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, limit);
}

// History.search matches visits in a time window but returns URL-wide metadata.
// Split saturated windows, overlap their boundary, and deduplicate globally.
// Never use the returned lastVisitTime to page through history.
export async function scanHistory(api, {
  endTime = Date.now(), maxResults = 2048, maxQueries = 512, maxItems = 200000,
  isCurrent = () => true
} = {}) {
  const windows = [[0, endTime]], entries = new Map();
  let queries = 0;
  while (windows.length) {
    if (!isCurrent()) throw new Error('历史查询已过期，请刷新。');
    if (++queries > maxQueries) throw new Error('历史量过大，无法完整计算榜单。');
    const [start, end] = windows.pop();
    const items = await api.history.search({ text: '', startTime: start, endTime: end, maxResults });
    if (!isCurrent()) throw new Error('历史查询已过期，请刷新。');
    if (items.length >= maxResults) {
      if (end - start <= 1) throw new Error('同一时刻的历史记录过多，无法完整计算榜单。');
      const middle = Math.floor((start + end) / 2);
      windows.push([middle, end], [start, middle]);
      continue;
    }
    for (const item of items) {
      const key = item.url || item.id;
      if (!key) continue;
      const previous = entries.get(key);
      if (!previous || (item.visitCount ?? 0) > (previous.visitCount ?? 0)) entries.set(key, item);
    }
    if (entries.size > maxItems) throw new Error('历史量过大，无法完整计算榜单。');
  }
  return [...entries.values()];
}
