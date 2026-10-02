import { panelContext } from './core.js';

export function mountPanel(document, api, location) {
  const $ = id => document.querySelector(`#${id}`);
  const context = panelContext(location.href, api.runtime.getURL(''));
  let data = { revision: 0, shortcuts: [] }, draft = null, editing = false;
  let preferences = { frequentSitesEnabled: false, autoOpenEnabled: false };
  let frequentVersion = 0, frequentToken = null, preferencesVersion = 0, saving = false;
  function showError(message) { $('status').textContent = message; $('status').hidden = false; }
  async function send(message) {
    const result = await api.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error || '扩展后台暂不可用，请重新加载扩展。');
    return result;
  }
  const disposition = event => event.shiftKey ? 'foreground' : event.metaKey || event.ctrlKey || event.button === 1 ? 'background' : 'current';
  function cancel() {
    if (saving) return;
    draft = null; $('editor').hidden = true; $('refresh-version').hidden = true; $('status').hidden = true;
  }
  function edit(entry) {
    if (draft?.dirty) { showError('请先保存或取消当前草稿。'); return; }
    draft = { id: entry.id, revision: data.revision, dirty: false };
    $('edit-title').value = entry.title; $('edit-url').value = entry.url;
    $('editor').hidden = false; $('refresh-version').hidden = true; $('edit-title').focus();
  }
  function render() {
    const fragment = document.createDocumentFragment();
    for (const entry of data.shortcuts) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'shortcut'; button.title = `${entry.title}\n${entry.url}`;
      button.setAttribute('aria-label', `${entry.title}，${entry.url}`);
      const icon = document.createElement('span'); icon.className = 'icon'; icon.setAttribute('aria-hidden', 'true');
      const glyph = document.createElement('span'); glyph.className = 'glyph'; glyph.textContent = entry.icon; glyph.style.color = entry.color;
      icon.append(glyph);
      const title = document.createElement('span'); title.className = 'title'; title.textContent = entry.title;
      button.append(icon, title);
      const activate = event => {
        event.preventDefault();
        if (editing) { edit(entry); return; }
        send({ type: 'navigate', shortcutId: entry.id, disposition: disposition(event) }).catch(error => showError(error.message));
      };
      button.addEventListener('click', activate);
      button.addEventListener('auxclick', event => { if (event.button === 1) activate(event); });
      fragment.append(button);
    }
    $('shortcuts').replaceChildren(fragment);
  }
  async function loadShortcuts() {
    const result = await send({ type: 'shortcuts:get' });
    if (result.revision < data.revision) return;
    const changed = result.revision !== data.revision;
    data = result; render();
    if (draft && changed) {
      if (draft.dirty || saving) {
        showError('另一侧栏已保存修改，当前草稿已保留。请刷新版本后重试。'); $('refresh-version').hidden = false;
      } else {
        const entry = data.shortcuts.find(item => item.id === draft.id);
        if (entry) edit(entry); else cancel();
      }
    }
  }
  $('edit-mode').addEventListener('click', () => {
    if (saving || draft?.dirty) { showError('请先保存或取消当前草稿。'); return; }
    editing = !editing; cancel();
    $('edit-mode').textContent = editing ? '完成编辑' : '编辑';
    $('edit-mode').setAttribute('aria-pressed', String(editing));
  });
  for (const id of ['edit-title', 'edit-url']) $(id).addEventListener('input', () => { if (draft) draft.dirty = true; });
  $('cancel-edit').addEventListener('click', cancel);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') cancel(); });
  $('editor').addEventListener('submit', async event => {
    event.preventDefault(); if (!draft || saving) return;
    saving = true; $('save-edit').disabled = true; $('cancel-edit').disabled = true; $('refresh-version').disabled = true;
    try {
      const result = await send({ type: 'shortcuts:edit', id: draft.id, title: $('edit-title').value, url: $('edit-url').value, revision: draft.revision });
      if (result.revision >= data.revision) data = result;
      saving = false; cancel(); render();
    } catch (error) { showError(error.message); $('refresh-version').hidden = false; }
    finally { saving = false; $('save-edit').disabled = false; $('cancel-edit').disabled = false; $('refresh-version').disabled = false; }
  });
  $('refresh-version').addEventListener('click', async () => {
    try {
      await loadShortcuts();
      if (draft) { draft.revision = data.revision; $('refresh-version').hidden = true; showError('版本已刷新，草稿保留。再次保存将覆盖此条目的当前名称和网址。'); }
    } catch (error) { showError(error.message); }
  });

  function clearFrequent() {
    frequentVersion++; frequentToken = null; $('frequent-list').replaceChildren();
  }
  function collapse() {
    clearFrequent(); $('frequent-section').hidden = true;
    send({ type: 'frequent:clear' }).catch(() => {});
  }
  async function loadFrequent() {
    if (!preferences.frequentSitesEnabled) return;
    clearFrequent(); const version = frequentVersion;
    $('frequent-section').hidden = false; $('frequent-status').textContent = '正在计算…'; $('grant-history').hidden = true;
    try {
      const permitted = await api.permissions.contains({ permissions: ['history'] });
      if (version !== frequentVersion) return;
      if (!permitted) {
        $('frequent-status').textContent = '需要允许读取浏览历史。仅在本地计算，不上传、不写入诊断。';
        $('grant-history').hidden = false; return;
      }
      const result = await send({ type: 'frequent:get' });
      if (version !== frequentVersion || !preferences.frequentSitesEnabled || $('frequent-section').hidden) return;
      frequentToken = result.token;
      const fragment = document.createDocumentFragment();
      for (const site of result.sites) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'frequent-site'; button.title = site.url;
        const label = document.createElement('span'); label.textContent = site.title;
        const count = document.createElement('span'); count.className = 'visit-count'; count.textContent = `${site.visitCount} 次`;
        button.append(label, count);
        const token = result.token;
        const activate = event => {
          event.preventDefault();
          if (frequentToken !== token) { showError('列表已过期，请刷新。'); return; }
          send({ type: 'navigate', source: 'frequent', shortcutId: site.id, token, disposition: disposition(event) }).catch(error => showError(error.message));
        };
        button.addEventListener('click', activate);
        button.addEventListener('auxclick', event => { if (event.button === 1) activate(event); });
        fragment.append(button);
      }
      $('frequent-list').replaceChildren(fragment);
      $('frequent-status').textContent = result.sites.length ? `${result.sites.length} 个网站` : '历史中没有可用的 HTTP/HTTPS 网站。';
    } catch (error) { if (version === frequentVersion) $('frequent-status').textContent = error.message; }
  }
  function applyPreferences(result, expand = true) {
    preferences = result; $('frequent-enabled').checked = result.frequentSitesEnabled; $('auto-enabled').checked = result.autoOpenEnabled;
    if (!result.frequentSitesEnabled) collapse();
    else if (expand) loadFrequent();
  }
  async function loadPreferences(expand = true) {
    const version = ++preferencesVersion;
    const result = await send({ type: 'preferences:get' });
    if (version === preferencesVersion) applyPreferences(result, expand);
  }
  $('frequent-enabled').addEventListener('change', async () => {
    const enabled = $('frequent-enabled').checked; const version = ++preferencesVersion;
    $('frequent-enabled').disabled = true;
    if (!enabled) collapse();
    try {
      const result = await send({ type: 'preferences:set', frequentSitesEnabled: enabled });
      if (version === preferencesVersion) applyPreferences(result);
    } catch (error) { $('frequent-enabled').checked = preferences.frequentSitesEnabled; showError(error.message); }
    finally { $('frequent-enabled').disabled = false; }
  });
  $('collapse-frequent').addEventListener('click', collapse);
  $('refresh-frequent').addEventListener('click', loadFrequent);
  $('grant-history').addEventListener('click', () => {
    // The permission request must run directly in the actual button callback.
    api.permissions.request({ permissions: ['history'] }).then(granted => {
      if (!granted) $('frequent-status').textContent = '尚未授权，仍可使用自定义快捷方式。点击允许读取历史可重试。';
      else if (preferences.frequentSitesEnabled && !$('frequent-section').hidden) loadFrequent();
    }).catch(error => { $('frequent-status').textContent = error.message; });
  });
  const experimental = api.runtime.getManifest().permissions.includes('debugger');
  $('auto-settings').hidden = !experimental;
  $('auto-enabled').addEventListener('change', async () => {
    $('auto-enabled').disabled = true;
    try { const result = await send({ type: 'preferences:set', autoOpenEnabled: $('auto-enabled').checked }); preferences.autoOpenEnabled = result.autoOpenEnabled; }
    catch (error) { $('auto-enabled').checked = preferences.autoOpenEnabled; $('auto-status').textContent = error.message; }
    finally { $('auto-enabled').disabled = false; }
  });
  const resume = () => { if (document.visibilityState === 'visible') loadPreferences().catch(error => showError(error.message)); };
  document.addEventListener('visibilitychange', resume);
  api.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== api.runtime.id) return;
    if (message.type === 'frequent:invalidated') {
      clearFrequent(); $('frequent-status').textContent = '历史或权限已变化，请刷新榜单。';
      api.permissions.contains({ permissions: ['history'] }).then(permitted => { $('grant-history').hidden = permitted; }).catch(() => {});
    }
    if (message.type === 'panel:resume' && message.tabId === context?.tabId && message.windowId === context?.windowId) resume();
    if (message.type === 'auto:error' && message.tabId === context?.tabId) $('auto-status').textContent = message.error;
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.shortcutDocument) loadShortcuts().catch(error => showError(error.message));
    if (changes.panelPreferences) {
      // Drop history immediately, before the asynchronous live-context read.
      if (!changes.panelPreferences.newValue?.frequentSitesEnabled) collapse();
      loadPreferences().catch(error => showError(error.message));
    }
  });
  const ready = (async () => {
    if (!context) throw new Error('请通过扩展按钮或快捷键打开原生新标签页。');
    await Promise.all([loadShortcuts(), loadPreferences()]);
  })();
  ready.catch(error => showError(error.message));
  return { ready };
}
