import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { startE2ERuntime, stopE2ERuntime } from './e2e-runtime-manager.mjs';

const webRoot = resolve(import.meta.dirname, '..');
const runtime = await startE2ERuntime({ webRoot });
const web = runtime.services.find((service) => service.name === 'web');
const playwrightCli = resolve(webRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const runner = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
  cwd: webRoot,
  env: { ...process.env, PLAYWRIGHT_BASE_URL: web.url, PLAYWRIGHT_RUNTIME_MANIFEST: JSON.stringify(runtime.manifest) },
  stdio: 'inherit', shell: false,
});
const finish = async (code) => { await stopE2ERuntime(runtime); process.exit(code ?? 1); };
runner.on('exit', finish);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (!runner.killed) runner.kill(signal); });