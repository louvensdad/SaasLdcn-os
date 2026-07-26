import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Same isolation contract as start-e2e-api.mjs (own namespaced sqlite db,
// refuses to run without the e2e-test-* namespace) -- the ONLY difference is
// EXECUTION_RUNTIME/ALLOW_HOST_EXECUTION below. That flip is the entire
// reason this is a separate script rather than a flag on the existing one:
// the standard suite's whole point is that it NEVER spawns real child
// processes, and this one's whole point is that it does.

const apiRoot = resolve(import.meta.dirname, '..', '..', 'api');
const runId = process.env.LDCN_E2E_RUN_ID;
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? '8301';
if (!/^\d{2,5}$/.test(apiPort)) throw new Error('PLAYWRIGHT_API_PORT must be numeric.');
if (!runId || !/^e2e-test-[a-zA-Z0-9_-]+$/.test(runId)) {
  throw new Error('LDCN_E2E_RUN_ID must use the e2e-test-* namespace.');
}

const databasePath = resolve(apiRoot, 'tests', '.tmp', `ldcn-${runId}.db`);
const databaseUrl = `sqlite:///${databasePath.replaceAll('\\', '/')}`;
if (!databaseUrl.includes('e2e-test-')) {
  throw new Error('Refusing real-runtime startup without an isolated test database.');
}

const env = {
  ...process.env,
  LDCN_ENVIRONMENT: 'test',
  LDCN_DATABASE_URL: databaseUrl,
  LDCN_FORCE_MOCK: '1',
  EXECUTION_RUNTIME: 'host',
  ALLOW_HOST_EXECUTION: 'true',
};

const migration = spawnSync('python', ['-m', 'alembic', 'upgrade', 'head'], {
  cwd: apiRoot,
  env,
  stdio: 'inherit',
  shell: false,
});
if (migration.status !== 0) {
  throw new Error(`Real-runtime database migration failed with status ${migration.status}.`);
}

const api = spawn(
  'python',
  ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', apiPort],
  { cwd: apiRoot, env, stdio: 'inherit', shell: false },
);

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  if (!api.killed) api.kill(signal);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(signal));
}

api.on('exit', (code) => {
  for (const suffix of ['', '-shm', '-wal']) {
    const candidate = `${databasePath}${suffix}`;
    if (existsSync(candidate)) rmSync(candidate, { force: true });
  }
  process.exit(code ?? 0);
});
