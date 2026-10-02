import {readFile,access,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {validateShortcuts} from '../extension/core.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=resolve(root,'extension');
const manifest=JSON.parse(await readFile(resolve(dir,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,['tabs','storage']);
for(const key of ['host_permissions','content_scripts','chrome_url_overrides','externally_connectable','web_accessible_resources'])assert.equal(manifest[key],undefined,key);
for(const path of [manifest.background.service_worker,manifest.options_ui.page,...Object.values(manifest.icons)])await access(resolve(dir,path));
const html=await readFile(resolve(dir,'host.html'),'utf8');
for(const [,path] of html.matchAll(/(?:src|href)="([^"]+)"/g)){assert.ok(!path.includes('://'));await access(resolve(dir,path));}
for(const file of await readdir(dir))if(file.endsWith('.js'))execFileSync(process.execPath,['--check',resolve(dir,file)],{stdio:'pipe'});
const shortcuts=validateShortcuts(JSON.parse(await readFile(resolve(dir,'shortcuts.json'),'utf8')));assert.equal(shortcuts.length,40);
console.log('PASS: JS syntax, extension resources, MV3, 2 permissions, no override/injection/remote resources, 40 valid defaults.');
