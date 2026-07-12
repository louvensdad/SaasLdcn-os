import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const processes = [];
let shuttingDown = false;

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

console.log("Iniciando backend em http://127.0.0.1:8001");
console.log("Iniciando frontend em http://localhost:3000");

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
  path.join(rootDir, "apps", "api"),
);
start(
  "frontend",
  isWindows ? process.env.ComSpec ?? "cmd.exe" : "npm",
  isWindows ? ["/d", "/s", "/c", "npm.cmd run dev"] : ["run", "dev"],
  path.join(rootDir, "apps", "web"),
);
