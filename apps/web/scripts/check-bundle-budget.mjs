import fs from 'node:fs';
import path from 'node:path';

const distDir = process.env.NEXT_DIST_DIR ?? '.next';
const manifestPath = path.join(distDir, 'app-build-manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`Bundle budget: missing ${manifestPath}; run next build first.`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
// Locale dictionaries are generated into a compact key-deduplicated payload
// before build. Keep budgets fixed: copy growth must not silently expand them.
const maxRouteBytes = Number(process.env.BUNDLE_MAX_ROUTE_BYTES ?? 1_800_000);
const maxStaticBytes = Number(process.env.BUNDLE_MAX_STATIC_BYTES ?? 4_800_000);
const sizeOf = (file) => {
  const candidate = path.join(distDir, file);
  return fs.existsSync(candidate) ? fs.statSync(candidate).size : 0;
};
const routeSizes = Object.entries(manifest.pages ?? {}).map(([route, files]) => ({
  route,
  bytes: [...new Set(files)].reduce((total, file) => total + sizeOf(file), 0),
}));
const oversized = routeSizes.filter(({ bytes }) => bytes > maxRouteBytes);
const chunksDir = path.join(distDir, 'static', 'chunks');
const walk = (directory) => fs.existsSync(directory)
  ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const candidate = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(candidate) : [candidate];
    })
  : [];
const staticBytes = walk(chunksDir).reduce((total, file) => total + fs.statSync(file).size, 0);
const largest = routeSizes.sort((a, b) => b.bytes - a.bytes).slice(0, 5);
for (const { route, bytes } of largest) console.log(`Bundle route ${route}: ${bytes} bytes`);
console.log(`Bundle static chunks: ${staticBytes} bytes`);
if (oversized.length || staticBytes > maxStaticBytes) {
  for (const item of oversized) console.error(`Route budget exceeded: ${item.route} ${item.bytes} > ${maxRouteBytes}`);
  if (staticBytes > maxStaticBytes) console.error(`Static budget exceeded: ${staticBytes} > ${maxStaticBytes}`);
  process.exit(1);
}
