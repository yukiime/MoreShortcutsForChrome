import test from 'node:test';
import assert from 'node:assert/strict';

test('one gesture creates one native NTP in its window and dispatches tab options and open in the same callback', async () => {
  const { openNewNtpWithPanel } = await import('../extension/entry.js');
  const effects = [];
  let callback;
  const api = { runtime: {}, tabs: { create(details, cb) { effects.push(['create', details]); callback = cb; } },
    sidePanel: { setOptions(details) { effects.push(['options', details]); return new Promise(() => {}); }, open(details) { effects.push(['open', details]); return Promise.resolve(); } } };
  openNewNtpWithPanel(api, { windowId: 3 });
  assert.deepEqual(effects, [['create', { windowId: 3, url: 'chrome://newtab/', active: true }]]);
  callback({ id: 9, windowId: 3 });
  assert.deepEqual(effects.slice(1), [
    ['options', { tabId: 9, path: 'panel.html?tabId=9&windowId=3', enabled: true }], ['open', { tabId: 9 }]
  ]);
});

test('entry creation and opening failures are reported without opening a global panel', async () => {
  const { openNewNtpWithPanel } = await import('../extension/entry.js');
  const errors = [];
  const api = { runtime: { lastError: { message: 'No window' } }, tabs: { create(_, cb) { cb(); } }, sidePanel: { open() { assert.fail('opened'); } } };
  openNewNtpWithPanel(api, { windowId: 3 }, error => errors.push(error));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /No window/);
});
