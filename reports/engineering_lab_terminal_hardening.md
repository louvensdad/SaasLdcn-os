# Engineering Laboratory — Terminal Hardening

The Lab's `/terminal` runs real commands in a project directory. The base implementation already had an allow-list, `shell=False`, sandboxed `cwd`, output cap, and path containment. This pass closes three remaining gaps in `engineering_lab_engine.py`.

## 1. Secret leakage via inherited environment (HIGH)
`subprocess.run` inherited the backend's full `os.environ`, so any executed command (`bash -c "env"`, a malicious `npm postinstall`, `python -c "import os;print(os.environ)"`) could read the backend's secrets: `LDCN_SECRET_KEY`, `LDCN_TOKEN_ENC_KEY`, provider API keys, DB credentials.

**Fix:** commands now run with a **scrubbed allow-listed env** (`_safe_terminal_env()` → only `PATH/HOME/LANG/SystemRoot/TEMP/…` + `CI=1`). No `LDCN_*`, `*_API_KEY`, or DB vars reach executed commands. Verified: the env contains only build-safe keys.

## 2. Allow-list bypass via inline shell execution (MEDIUM)
The allow-list checks the executable name, but `bash`/`sh`/`zsh`/`fish`/`cmd`/`powershell` are allow-listed (the brief wants shells) — and `bash -c "<anything>"`, `cmd /c "..."`, `powershell -Command "..."` turn the allow-list into a no-op.

**Fix:** for shell interpreters, the inline-command flags (`-c`, `-Command`, `-EncodedCommand`, `-e`, `-ec`, `/c`, `/k`) are **rejected** with a 400. A shell can still run a script file inside the sandboxed dir, but cannot execute an arbitrary inline command string.

## 3. Unbounded timeout (LOW)
`timeout_seconds` came straight from the request, so a caller could pin a worker thread indefinitely.

**Fix:** clamped to `[1, 120]` seconds.

## Defense-in-depth summary (now)
allow-list · `shell=False` · scrubbed secret-free env · inline-exec flags blocked · sandboxed `cwd` under the output root · path-traversal-safe `project_id` · output capped at 20 KB · timeout clamped ≤ 120 s.

## Residual risk (for production, untrusted users)
Running real build tools is inherently powerful: a script can still make network calls or consume CPU/disk within the sandbox. Before exposing the terminal to untrusted users, add OS-level isolation (container/jail, non-root, read-only FS outside the project, network egress limits, CPU/memory cgroups). For the current single-tenant developer use, the above controls are appropriate.

## Validation
Engine imports cleanly; `_safe_terminal_env()` returns only safe keys; backend test suite green.
