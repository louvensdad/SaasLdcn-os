# LDCN Sandbox Execution Runtime

## Security boundary

All commands originating from generated, imported, modernized or repaired code
must pass through `ExecutionRuntime`. Production accepts only
`SandboxExecutionRuntime`. `HostExecutionRuntime` exists only for explicit local debugging and requires both `EXECUTION_RUNTIME=host` and `ALLOW_HOST_EXECUTION=true`; production rejects it during startup.

The workload container is ephemeral and uses:

- network `none` by default;
- read-only root filesystem;
- a size-limited tmpfs at `/workspace`;
- a separate non-root user (`65532:65532`);
- all capabilities dropped and `no-new-privileges`;
- CPU, memory, PID, open-file, output, file-size and timeout limits;
- no host bind mounts and no Docker socket; filtered source is streamed as TAR into the job tmpfs;
- a minimal environment with no API, database, Redis or LLM credentials.

The project is copied to the tmpfs after `.env*`, Git metadata and private-key
file types are excluded. Symlinks and oversized inputs are rejected. The
container and its tmpfs are removed in `close_session`, including error paths.

## Network policy

`NetworkPolicy.NONE` is the default. Package installation and HTTPS Git clone
may request controlled egress. The runtime then requires both:

- an internal Docker network (`LDCN_SANDBOX_EGRESS_NETWORK`);
- an HTTP proxy on that network (`LDCN_SANDBOX_EGRESS_PROXY`).

The supplied Squid policy blocks loopback, private, link-local, cloud metadata
and reserved ranges, then allows only npm, Maven, Gradle, PyPI and approved Git
providers. It also limits response size and bandwidth. A missing or non-internal
network produces `SECURITY_BLOCKED`; direct bridge networking is never used.

## Execution lifecycle

Canonical states are `QUEUED`, `PREPARING_SANDBOX`, `RUNNING`, `SUCCEEDED`,
`FAILED`, `TIMED_OUT`, `RESOURCE_LIMIT_EXCEEDED`, `SECURITY_BLOCKED`, `CANCELLED`
and `SANDBOX_ERROR`.

Every final result is persisted under `LDCN_SANDBOX_EVIDENCE_ROOT` with execution,
job, project, workspace and sandbox IDs; sanitized command and output; relative
cwd; image; timestamps; exit code; timeout; configured/consumed resources;
changed files; network policy; source and failure reason.

Terminal APIs retain their legacy response fields and additionally expose
`runtime_status` and `sandbox_id`. `POST
/api/meta-factory/{project_id}/terminal/cancel` cancels the active sandbox. An SSE
disconnect also triggers cancellation.

## Migrated callers

| Caller | Runtime behavior |
| --- | --- |
| Meta-Factory terminal | One ephemeral sandbox per command, allowlist retained |
| Build validation / Auto-Fix | One sandbox session across install, build and repair retries |
| Engineering Laboratory | Same sandbox; shell, Docker and administrative CLIs removed |
| Modernize Git ingest | HTTPS clone in sandbox, controlled egress, validated export |
| Runtime API audit | Fixed TestClient harness inside sandbox; no host port/process |

An AST regression test fails if a new `subprocess`/`os.system` process creator is
introduced anywhere outside `execution_runtime.py`.

## Operations

```bash
docker build -t ldcn/sandbox-runtime:2026.07 infrastructure/docker/sandbox-runtime
docker compose -f infrastructure/docker/sandbox-runtime/compose.yml up -d
```

Production must set:

```env
EXECUTION_RUNTIME=sandbox
ALLOW_HOST_EXECUTION=false
LDCN_SANDBOX_EGRESS_NETWORK=ldcn-sandbox-egress
LDCN_SANDBOX_EGRESS_PROXY=http://egress-proxy:3128
LDCN_SANDBOX_EGRESS_PROXY_CONTAINER=ldcn-sandbox-egress-proxy
```

If Docker, the image, the internal network or the proxy is unavailable, execution
fails closed. It never falls back to the host.

For local toolchain debugging only, an operator may explicitly select the unsafe host backend. It runs a filtered temporary copy with a secret-free environment, timeout, output cap, cancellation and evidence marked `unsafeHostDevelopment`. This mode is not a security sandbox and must never be used by a shared API.
