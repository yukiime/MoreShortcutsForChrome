import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const target = new URL('../build/native-auto-open/', import.meta.url);
await mkdir(target, { recursive: true });
await cp(new URL('../extension/', import.meta.url), target, { recursive: true });
const manifest = JSON.parse(await readFile(new URL('manifest.json', target), 'utf8'));
manifest.name = '原生 NTP 额外快捷方式（自动显示实验）';
manifest.permissions.push('debugger', 'offscreen');
await writeFile(new URL('manifest.json', target), JSON.stringify(manifest, null, 2) + '\n');
console.log('Experimental build: build/native-auto-open (debugger/offscreen required; automatic mode defaults OFF).');
