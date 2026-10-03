import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, resolve } from 'node:path';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(project, '../build', basename(project), 'extension');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(resolve(project, 'extension'), target, { recursive: true });
console.log(`Build ready: build/${basename(project)}/extension`);
