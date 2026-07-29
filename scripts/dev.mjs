import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const processes = [];
let shuttingDown = false;

function migrateDatabase(apiDir) {
  console.log("Aplicando migrations do banco...");
  const result = spawnSync("python", ["-m", "alembic", "upgrade", "head"], {
    cwd: apiDir,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[database] Falha ao iniciar Alembic: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[database] Migration encerrada com codigo ${result.status ?? 1}.`);
    process.exit(result.status ?? 1);
  }
}

function start(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });

  processes.push(child);

  child.on("error", (error) => {
    console.error(`[${name}] Falha ao iniciar: ${error.message}`);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const reason = signal ? `sinal ${signal}` : `codigo ${code ?? 0}`;
    console.error(`[${name}] Processo encerrado (${reason}).`);
    shutdown(code ?? 1);
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of processes) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(exitCode), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const apiPort = process.env.LDCN_API_PORT ?? process.env.API_PORT ?? "8000";
console.log(`Iniciando backend em http://127.0.0.1:${apiPort}`);
console.log("Iniciando frontend em http://localhost:3000");

const apiDir = path.join(rootDir, "apps", "api");
migrateDatabase(apiDir);

start(
  "backend",
  "python",
  // Runs scripts/run_dev.py (uvicorn's Python API) instead of `python -m
  // uvicorn ...` directly: Click's CLI entrypoint auto-expands glob-like
  // args on Windows, and "app/data/*" matches real files there, so the CLI
  // form fails with "Got unexpected extra arguments" on Windows. The
  // reload-exclude pattern itself exists because the dev SQLite DB lives at
  // apps/api/app/data/ldcn_os.db, inside the watched tree -- every request
  // that persists something (almost all of them) touches that file, which
  // resets WatchFiles' debounce on every write, so under real traffic the
  // reloader detects a source change but never finds a quiet window to
  // actually restart.
  ["scripts/run_dev.py"],
  apiDir,
);
start(
  "frontend",
  isWindows ? process.env.ComSpec ?? "cmd.exe" : "npm",
  isWindows ? ["/d", "/s", "/c", "npm.cmd run dev"] : ["run", "dev"],
  path.join(rootDir, "apps", "web"),
);
