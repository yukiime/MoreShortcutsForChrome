import { panelContext, validateShortcuts } from './core.js';

const grid = document.querySelector('#shortcuts');
const status = document.querySelector('#status');
function showError(message) { status.textContent = message; status.hidden = false; }

async function openShortcut(id, event) {
  const modified = event.metaKey || event.ctrlKey || event.button === 1;
  const disposition = event.shiftKey ? 'foreground' : modified ? 'background' : 'current';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'navigate', shortcutId: id, disposition });
    if (!result?.ok) throw new Error(result?.error || '扩展后台暂不可用，请重新加载扩展。');
    status.hidden = true;
  } catch (error) { showError(error.message); }
}

async function start() {
  if (!panelContext(location.href, chrome.runtime.getURL(''))) throw new Error('请在原生新标签页点击工具栏按钮打开。');
  const response = await fetch('shortcuts.json');
  if (!response.ok) throw new Error('清单读取失败。');
  const shortcuts = validateShortcuts(await response.json());
  const fragment = document.createDocumentFragment();
  for (const entry of shortcuts) {
    const button = document.createElement('button');
    button.className = 'shortcut';
    button.type = 'button';
    button.title = `${entry.title}\n${entry.url}`;
    button.setAttribute('aria-label', `${entry.title}，${entry.url}`);
    const icon = document.createElement('span');
    icon.className = 'icon'; icon.setAttribute('aria-hidden', 'true');
    const glyph = document.createElement('span');
    glyph.className = 'glyph'; glyph.textContent = entry.icon; glyph.style.color = entry.color;
    icon.append(glyph);
    const title = document.createElement('span');
    title.className = 'title'; title.textContent = entry.title;
    button.append(icon, title);
    button.addEventListener('click', event => { event.preventDefault(); openShortcut(entry.id, event); });
    button.addEventListener('auxclick', event => { if (event.button === 1) { event.preventDefault(); openShortcut(entry.id, event); } });
    fragment.append(button);
  }
  grid.replaceChildren(fragment);
}
start().catch(error => showError(error.message));
