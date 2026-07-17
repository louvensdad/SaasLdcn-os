import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const DEFAULT_API_PORT = 8001;
const DEFAULT_WEB_PORT = 3000;
const HEALTH_TIMEOUT_MS = 120_000;

function isWindows() {
  return process.platform === 'win32';
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function isHealthy(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function canBind(port, host = '127.0.0.1') {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.listen(port, host, () => server.close(() => resolvePromise(true)));
  });
}

async function findFreePort(preferred) {
  if (await canBind(preferred)) return preferred;
  for (let port = 0; port < 20; port += 1) {
    const candidate = await new Promise((resolvePromise, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const selected = typeof address === 'object' && address ? address.port : 0;
        server.close(() => resolvePromise(selected));
      });
    });
    if (candidate && await canBind(candidate)) return candidate;
  }
  throw new Error(`No free localhost port is available near ${preferred}.`);
}

function acquireLock(lockPath) {
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    const fd = openSync(lockPath, 'wx');
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    return fd;
  } catch {
    let owner = 'unknown';
    try { owner = readFileSync(lockPath, 'utf8'); } catch { /* diagnostic only */ }
    throw new Error(`Another E2E runtime manager is active (${owner}). Remove the lock only after verifying its PID is gone.`);
  }
}

function releaseLock(lockPath, fd) {
  try { closeSync(fd); } catch { /* already closed */ }
  try { unlinkSync(lockPath); } catch { /* best effort */ }
}

function commandFor(command, args) {
  if (command === 'npm' && isWindows()) return [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args]];
  if (command === 'npm') return ['npm', args];
  if (command === 'node') return [process.execPath, args];
  return [command, args];
}

async function waitFor(url, label, child, timeoutMs = HEALTH_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new Error(`${label} exited before healthcheck (code ${child.exitCode}).`);
    }
    if (await isHealthy(url)) return;
    await sleep(250);
  }
  throw new Error(`${label} healthcheck timed out after ${timeoutMs}ms: ${url}`);
}

function stopProcess(pid) {
  if (!pid) return;
  if (isWindows()) {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch { /* process already exited */ }
  }
}

export async function startE2ERuntime({ webRoot = resolve(import.meta.dirname, '..') } = {}) {
  const runId = `e2e-test-${randomUUID().replaceAll('-', '')}`;
  const lockPath = resolve(webRoot, 'test-results', 'e2e-runtime.lock');
  const lockFd = acquireLock(lockPath);
  const state = { runId, lockPath, lockFd, services: [], startedAt: new Date().toISOString() };
  try {
    const apiPort = Number(process.env.PLAYWRIGHT_API_PORT || DEFAULT_API_PORT);
    const webPort = Number(process.env.PLAYWRIGHT_WEB_PORT || DEFAULT_WEB_PORT);
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const webUrl = `http://127.0.0.1:${webPort}`;
    const apiAlreadyHealthy = await isHealthy(`${apiUrl}/api/health`);
    const webAlreadyHealthy = await isHealthy(webUrl);

    if (!apiAlreadyHealthy) {
      const selectedApiPort = await findFreePort(apiPort);
      const child = spawn(...commandFor('node', ['scripts/start-e2e-api.mjs']), {
        cwd: webRoot,
        env: { ...process.env, LDCN_E2E_RUN_ID: runId, PLAYWRIGHT_API_PORT: String(selectedApiPort) },
        stdio: 'inherit', shell: false,
      });
      state.services.push({ name: 'api', port: selectedApiPort, pid: child.pid, source: 'spawned', url: `http://127.0.0.1:${selectedApiPort}` , child });
      await waitFor(`${state.services.at(-1).url}/api/health`, 'API', child);
    } else {
      state.services.push({ name: 'api', port: apiPort, pid: null, source: 'reused', url: apiUrl });
    }

    if (!webAlreadyHealthy) {
      const selectedWebPort = await findFreePort(webPort);
      const child = spawn(...commandFor('npm', ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(selectedWebPort)]), {
        cwd: webRoot,
        env: { ...process.env, PORT: String(selectedWebPort), NEXT_PUBLIC_API_URL: state.services[0].url },
        stdio: 'inherit', shell: false,
      });
      state.services.push({ name: 'web', port: selectedWebPort, pid: child.pid, source: 'spawned', url: `http://127.0.0.1:${selectedWebPort}`, child });
      await waitFor(state.services.at(-1).url, 'Frontend', child);
    } else {
      state.services.push({ name: 'web', port: webPort, pid: null, source: 'reused', url: webUrl });
    }

    const manifest = { ...state, services: state.services.map((service) => ({ name: service.name, port: service.port, pid: service.pid, source: service.source, url: service.url })) };
    mkdirSync(resolve(webRoot, 'test-results'), { recursive: true });
    writeFileSync(resolve(webRoot, 'test-results', `e2e-runtime-${runId}.json`), JSON.stringify(manifest, null, 2));
    return { ...state, manifest };
  } catch {
    await stopE2ERuntime(state);
    throw new Error(`E2E runtime startup failed for ${runId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function stopE2ERuntime(state) {
  if (!state) return;
  for (const service of [...(state.services || [])].reverse()) {
    if (service.source === 'spawned') stopProcess(service.pid);
  }
  if (state.lockFd !== undefined) releaseLock(state.lockPath, state.lockFd);
}

export { canBind, findFreePort, isHealthy };
