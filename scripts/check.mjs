import { readFile, access, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { validateShortcuts } from '../extension/core.js';

const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual([...manifest.permissions].sort(), ['sidePanel', 'storage', 'tabs']);
assert.deepEqual(manifest.optional_permissions, ['history']);
assert.equal(manifest.chrome_url_overrides, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.equal(manifest.host_permissions, undefined);
const files = [manifest.background.service_worker, manifest.side_panel.default_path, manifest.options_ui.page, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
await Promise.all(files.map(file => access(`extension/${file}`)));
const entries = validateShortcuts(JSON.parse(await readFile('extension/shortcuts.json', 'utf8')));
assert.equal(entries.length, 40);
for (const name of await readdir('extension')) {
  if (!name.endsWith('.js')) continue;
  const result = spawnSync(process.execPath, ['--check', `extension/${name}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
console.log(`Static checks passed: MV3, 3 required permissions + optional history, ${entries.length} valid shortcuts, all manifest resources present, JS syntax clean.`);
