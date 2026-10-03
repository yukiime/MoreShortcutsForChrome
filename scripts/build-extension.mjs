import { cp, mkdir, rm } from 'node:fs/promises';

// Generated copy only. The original extension/ loading path remains unchanged.
const target = new URL('../build/extension/', import.meta.url);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(new URL('../extension/', import.meta.url), target, { recursive: true });
console.log('Build ready: build/extension (same manifest and defaults as extension/).');
