import test from 'node:test';
import assert from 'node:assert/strict';

// Import absence becomes an assertion failure during the first TDD run.
const core = await import('../extension/core.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
function helper(name) {
  assert.equal(typeof core[name], 'function', `Missing core helper: ${name}`);
  return core[name];
}
const entry = { id: 'one', title: '示例', url: 'https://example.com/', icon: '例', color: '#4285f4' };
const documentOf = (...shortcuts) => ({ version: 1, shortcuts });
const hostUrl = 'chrome-extension://abc/host.html';
const pip = { id: 9, type: 'normal', alwaysOnTop: true, tabs: [{ url: hostUrl }] };

test('native NTP recognition allows only known internal page aliases', () => {
  const isNativeNtp = helper('isNativeNtp');
  for (const url of ['chrome://newtab/', 'chrome://newtab', 'chrome://new-tab-page/',
    'chrome://new-tab-page-third-party/', 'chrome-search://local-ntp/local-ntp.html',
    'chrome://newtab/?x=1#query']) assert.equal(isNativeNtp({ url }), true, url);
  for (const url of ['https://example.com/', 'chrome://newtab/extra', 'chrome://history/',
    'chrome://newtab.evil/', 'chrome://user:pass@newtab/', 'chrome-search://local-ntp/',
    'chrome-extension://abc/newtab.html', 'not a url']) assert.equal(isNativeNtp({ url }), false, url);
  assert.equal(isNativeNtp(null), false);
});

test('pending navigation overrides an existing NTP URL', () => {
  const isNativeNtp = helper('isNativeNtp');
  assert.equal(isNativeNtp({ url: 'chrome://newtab/', pendingUrl: 'https://example.com/' }), false);
  assert.equal(isNativeNtp({ url: 'https://example.com/', pendingUrl: 'chrome://newtab/' }), true);
  assert.equal(isNativeNtp({ url: 'chrome://newtab/', pendingUrl: 'broken' }), false);
});

test('shortcut normalization produces independent safe entries', () => {
  const validate = helper('validateShortcuts');
  const source = { id: 'two', title: '  🚀工具  ', url: 'HTTPS://EXAMPLE.COM:443', extra: 'discard' };
  const normalized = validate(documentOf(source));
  assert.deepEqual(normalized, [{ id: 'two', title: '🚀工具', url: 'https://example.com/', icon: '🚀', color: '#5f6368' }]);
  assert.notEqual(normalized[0], source);
  assert.equal(source.title, '  🚀工具  ');
});

test('forty independent default-style entries remain usable', () => {
  const validate = helper('validateShortcuts');
  const entries = Array.from({ length: 40 }, (_, i) => ({ ...entry, id: `shortcut-${i + 1}` }));
  assert.equal(validate(documentOf(...entries)).length, 40);
  assert.equal(validate(documentOf(...entries))[39].id, 'shortcut-40');
});

test('shortcut documents enforce version, array shape and 1000 item ceiling', () => {
  const validate = helper('validateShortcuts');
  for (const input of [null, [], {}, { version: '1', shortcuts: [] }, { version: 1, shortcuts: {} }]) {
    assert.throws(() => validate(input));
  }
  assert.deepEqual(validate(documentOf()), []);
  const entries = Array.from({ length: 1000 }, (_, i) => ({ ...entry, id: `entry-${i}` }));
  assert.equal(validate(documentOf(...entries)).length, 1000);
  assert.throws(() => validate(documentOf(...entries, { ...entry, id: 'extra' })));
});

test('shortcut IDs reject duplicate and malformed identities', () => {
  const validate = helper('validateShortcuts');
  assert.throws(() => validate(documentOf(entry, entry)));
  for (const id of ['', 'with space', '../host', '汉字', 'a'.repeat(65), 1, null]) {
    assert.throws(() => validate(documentOf({ ...entry, id })));
  }
  assert.equal(validate(documentOf({ ...entry, id: 'A_1-' }))[0].id, 'A_1-');
  assert.throws(() => validate(documentOf(null)));
});

test('shortcut titles reject blank and overlong text', () => {
  const validate = helper('validateShortcuts');
  for (const title of ['', ' \n ', 'x'.repeat(101), 1, null]) {
    assert.throws(() => validate(documentOf({ ...entry, title })));
  }
  assert.equal(validate(documentOf({ ...entry, title: 'x'.repeat(100) }))[0].title.length, 100);
});

test('shortcut URL validation rejects unsafe schemes, credentials and nonstrings', () => {
  const validate = helper('validateShortcuts');
  for (const url of ['javascript:alert(1)', 'data:text/plain,x', 'file:///tmp/x',
    'chrome://newtab/', 'https://user@example.com', 'http://user:pass@example.com',
    '//example.com', 'broken', {}, null, 42]) {
    assert.throws(() => validate(documentOf({ ...entry, url })));
  }
  assert.equal(validate(documentOf({ ...entry, url: 'http://example.com/path?q=1#hash' }))[0].url,
    'http://example.com/path?q=1#hash');
});

test('shortcut icons count Unicode code points and colors require six hex digits', () => {
  const validate = helper('validateShortcuts');
  assert.equal(validate(documentOf({ ...entry, icon: '🚀中A', color: '#ABCDEF' }))[0].icon, '🚀中A');
  for (const icon of ['', 'ABCD', '🚀🚀🚀🚀', 42, {}]) assert.throws(() => validate(documentOf({ ...entry, icon })));
  for (const color of ['#fff', '#12345g', 'red', 42]) assert.throws(() => validate(documentOf({ ...entry, color })));
});

test('PiP identity requires a unique newly added normal alwaysOnTop window', () => {
  const find = helper('findPipWindow');
  const existing = { id: 1, type: 'normal', alwaysOnTop: true };
  assert.equal(find([existing], [existing, pip], hostUrl), pip);
  assert.equal(find([pip], [pip], hostUrl), null);
  assert.equal(find([], [{ ...pip, type: 'popup' }], hostUrl), null);
  assert.equal(find([], [{ ...pip, alwaysOnTop: false }], hostUrl), null);
  assert.equal(find([], [{ ...pip, id: undefined }], hostUrl), null);
});

test('PiP URLs must match exact host protocol, host and path ignoring query', () => {
  const find = helper('findPipWindow');
  assert.equal(find([], [{ ...pip, tabs: [{ url: `${hostUrl}?session=x` }] }], hostUrl)?.id, 9);
  for (const url of ['chrome-extension://other/host.html', 'chrome-extension://abc/other.html',
    'chrome-extension://abc/host.html/extra', 'https://abc/host.html', 'broken']) {
    assert.equal(find([], [{ ...pip, tabs: [{ url }] }], hostUrl), null, url);
  }
  assert.equal(find([], [{ ...pip, tabs: [{ url: hostUrl, pendingUrl: 'https://example.com/' }] }], hostUrl), null);
  assert.equal(find([], [{ ...pip, tabs: [{ url: hostUrl }, { url: 'https://example.com/' }] }], hostUrl), null);
  assert.equal(find([], [pip], 'not a host URL'), null);
});

test('PiP identity allows omitted tab URLs but rejects ambiguous candidates', () => {
  const find = helper('findPipWindow');
  const hidden = { id: 9, type: 'normal', alwaysOnTop: true };
  assert.equal(find([], [hidden], hostUrl), hidden);
  assert.equal(find([], [{ ...hidden, tabs: [] }], hostUrl)?.id, 9);
  assert.equal(find([], [{ ...hidden, tabs: [{}] }], hostUrl)?.id, 9);
  assert.equal(find([], [pip, { ...hidden, id: 10 }], hostUrl), null);
  assert.equal(find([], [pip, { ...pip, id: 10, tabs: [{ url: 'https://example.com/' }] }], hostUrl), null);
  assert.equal(find(null, [pip], hostUrl), null);
  assert.equal(find([], null, hostUrl), null);
});

test('navigation modifiers and middle click take precedence over Shift', () => {
  const mode = helper('navigationMode');
  assert.equal(mode({}), 'current');
  assert.equal(mode({ shiftKey: true }), 'foreground');
  assert.equal(mode({ metaKey: true }), 'background');
  assert.equal(mode({ ctrlKey: true }), 'background');
  assert.equal(mode({ button: 1 }), 'background');
  assert.equal(mode({ shiftKey: true, metaKey: true }), 'background');
  assert.equal(mode({ shiftKey: true, ctrlKey: true }), 'background');
  assert.equal(mode({ shiftKey: true, button: 1 }), 'background');
  assert.equal(mode({ altKey: true }), 'current');
  assert.equal(mode(null), 'current');
});

test('bounds normalization supports negative monitor positions and removes extras', () => {
  const validate = helper('validateBounds');
  assert.deepEqual(validate({ left: -1920, top: -200, width: 420, height: 560, focused: true }),
    { left: -1920, top: -200, width: 420, height: 560 });
  assert.deepEqual(validate({ left: -20000, top: 20000, width: 200, height: 120 }),
    { left: -20000, top: 20000, width: 200, height: 120 });
  assert.equal(validate({ left: 0, top: 0, width: 1600, height: 1200 }).width, 1600);
});

test('bounds validation rejects incomplete, fractional, nonnumeric and extreme geometry', () => {
  const validate = helper('validateBounds');
  const value = { left: 0, top: 0, width: 420, height: 560 };
  for (const input of [null, {}, [], { ...value, left: 20001 }, { ...value, top: -20001 },
    { ...value, width: 199 }, { ...value, width: 1601 }, { ...value, height: 119 },
    { ...value, height: 1201 }, { ...value, left: 0.5 }, { ...value, top: '0' },
    { ...value, width: Infinity }, { ...value, height: NaN }]) assert.equal(validate(input), null);
});

 test('Chrome Document PiP about:blank is accepted only in a unique new always-on-top window', () => {
  const find = helper('findPipWindow');
  const blank = {...pip, tabs: [{url: 'about:blank'}]};
  assert.equal(find([], [blank], hostUrl), blank);
  assert.equal(find([blank], [blank], hostUrl), null);
  assert.equal(find([], [blank, {...blank, id: 10}], hostUrl), null);
  for (const url of ['about:blank#foreign', 'about:blank?foreign', 'about:srcdoc', 'https://example.com/']) {
    assert.equal(find([], [{...blank, tabs: [{url}]}], hostUrl), null);
  }
  assert.equal(find([], [{...blank, tabs: [{url: 'about:blank', pendingUrl: 'https://example.com/'}]}], hostUrl), null);
});
