#!/usr/bin/env node
/**
 * The first-load budget: what a person actually waits for on the slowest route.
 *
 * Two ceilings, deliberately different in kind (the same split the current app settled on):
 *   - SHARED is the JavaScript every route pays for before its own code. It moves rarely, so a
 *     tight ceiling here catches a dependency that leaked into the shell.
 *   - ROUTE is the worst single route's first load. It grows as screens are built, so it is a
 *     growth ceiling rather than a target.
 *
 * Both are read from the build's own report, gzipped, so the number is what the browser downloads.
 * Run `npm run build` first; this reads `.next/`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIST = join(ROOT, '.next');
const CHECK = process.argv.includes('--check');

const SHARED_KB = 140;
const ROUTE_KB = 320;

if (!existsSync(join(DIST, 'build-manifest.json'))) {
  console.error('No build found. Run `npm run build` first.');
  process.exit(1);
}

const appManifest = JSON.parse(readFileSync(join(DIST, 'app-build-manifest.json'), 'utf8'));

const sizeCache = new Map();
function gzipped(file) {
  if (sizeCache.has(file)) return sizeCache.get(file);
  const path = join(DIST, file);
  const size = existsSync(path) ? gzipSync(readFileSync(path)).length : 0;
  sizeCache.set(file, size);
  return size;
}

const pages = appManifest.pages ?? {};
const routes = Object.keys(pages).filter((route) => !route.startsWith('/_'));
if (routes.length === 0) {
  console.error('The build manifest lists no route.');
  process.exit(1);
}

/* Shared = the chunks every route loads. */
const shared = routes
  .map((route) => new Set(pages[route].filter((file) => file.endsWith('.js'))))
  .reduce((common, chunks) => new Set([...common].filter((file) => chunks.has(file))));

const sharedBytes = [...shared].reduce((total, file) => total + gzipped(file), 0);

const perRoute = routes
  .map((route) => {
    const files = pages[route].filter((file) => file.endsWith('.js'));
    const bytes = files.reduce((total, file) => total + gzipped(file), 0);
    return { route, bytes };
  })
  .sort((a, b) => b.bytes - a.bytes);

const kb = (bytes) => (bytes / 1024).toFixed(1);
const worst = perRoute[0];

console.log(`  shared by every route: ${kb(sharedBytes)} kB gzipped  (ceiling ${SHARED_KB} kB)`);
console.log(`  heaviest first load:   ${kb(worst.bytes)} kB gzipped  ${worst.route}  (ceiling ${ROUTE_KB} kB)`);
console.log('');
for (const entry of perRoute.slice(0, 5)) {
  console.log(`    ${kb(entry.bytes).padStart(7)} kB  ${entry.route}`);
}

const over = [];
if (sharedBytes / 1024 > SHARED_KB) over.push(`shared ${kb(sharedBytes)} kB > ${SHARED_KB} kB`);
if (worst.bytes / 1024 > ROUTE_KB) over.push(`${worst.route} ${kb(worst.bytes)} kB > ${ROUTE_KB} kB`);

if (over.length) {
  console.log(`\nOver budget: ${over.join('; ')}`);
  process.exit(CHECK ? 1 : 0);
}
console.log('\nWithin budget.');
