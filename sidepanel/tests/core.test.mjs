import test from 'node:test';
import assert from 'node:assert/strict';
import { isNativeNtp, validateShortcuts, panelContext } from '../extension/core.js';

test('internal NTP aliases are accepted but lookalikes and normal Google pages are not', () => {
  for (const url of ['chrome://newtab/', 'chrome://new-tab-page/', 'chrome://new-tab-page-third-party/', 'chrome-search://local-ntp/local-ntp.html']) {
    assert.equal(isNativeNtp({ url }), true, url);
  }
  for (const url of ['https://google.com/', 'chrome://newtab.evil/', 'chrome://newtab/other', 'chrome-extension://abc/newtab.html', 'about:blank', '']) {
    assert.equal(isNativeNtp({ url }), false, url);
  }
});

test('pending navigation wins over the committed NTP URL in both directions', () => {
  assert.equal(isNativeNtp({ url: 'chrome://newtab/', pendingUrl: 'https://example.com/' }), false);
  assert.equal(isNativeNtp({ url: 'https://example.com/', pendingUrl: 'chrome://newtab/' }), true);
  assert.equal(isNativeNtp({ url: 'chrome://newtab/', pendingUrl: '' }), true);
  assert.equal(isNativeNtp({}), false);
});

test('JSON rejects script URLs, credentials, duplicate identities and missing labels', () => {
  const entry = { id: 'one', title: 'Example', url: 'https://example.com/', icon: 'E', color: '#4285f4' };
  assert.deepEqual(validateShortcuts({ version: 1, shortcuts: [entry] }), [entry]);
  for (const document of [
    { version: 2, shortcuts: [entry] },
    { version: 1, shortcuts: [entry, entry] },
    { version: 1, shortcuts: [{ ...entry, url: 'javascript:alert(1)' }] },
    { version: 1, shortcuts: [{ ...entry, url: 'https://user:secret@example.com/' }] },
    { version: 1, shortcuts: [{ ...entry, title: '' }] },
    { version: 1, shortcuts: [{ ...entry, color: 'url(https://example.com)' }] }
  ]) assert.throws(() => validateShortcuts(document));
});

test('panel URL binds exact extension origin and explicit window/tab IDs', () => {
  assert.deepEqual(panelContext('chrome-extension://abc/panel.html?tabId=7&windowId=3', 'chrome-extension://abc/'), { tabId: 7, windowId: 3 });
  for (const url of ['https://evil/panel.html?tabId=7&windowId=3', 'chrome-extension://abc/panel.html', 'chrome-extension://abc/panel.html?tabId=-1&windowId=3', 'chrome-extension://abc/panel.html?tabId=7x&windowId=3', 'chrome-extension://abc/diagnostics.html?tabId=7&windowId=3']) {
    assert.equal(panelContext(url, 'chrome-extension://abc/'), null);
  }
});
