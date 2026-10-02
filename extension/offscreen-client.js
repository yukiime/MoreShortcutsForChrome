export function createOffscreenClient(api) {
  let creating;
  async function ensure() {
    if (creating) return creating;
    creating = (async () => {
      const contexts = await api.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [api.runtime.getURL('offscreen.html')] });
      if (!contexts.length) await api.offscreen.createDocument({
        url: 'offscreen.html', reasons: ['WORKERS'],
        justification: 'Run a Web Worker to aggregate browser history into local frequent-site rankings.'
      });
    })();
    try { await creating; } finally { creating = undefined; }
  }
  async function rank(items) {
    await ensure();
    const result = await api.runtime.sendMessage({ type: 'offscreen:rank', items });
    if (!result?.ok) throw new Error('历史计算文档不可用，请刷新。');
    return result.sites;
  }
  return { ensure, rank };
}
