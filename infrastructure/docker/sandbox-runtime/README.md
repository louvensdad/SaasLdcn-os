# LDCN Sandbox Execution Runtime

Build the immutable workload image and start the allowlist proxy:

```bash
docker build -t ldcn/sandbox-runtime:2026.07 infrastructure/docker/sandbox-runtime
docker compose -f infrastructure/docker/sandbox-runtime/compose.yml up -d
```

Configure the API with `EXECUTION_RUNTIME=sandbox`,
`ALLOW_HOST_EXECUTION=false`, `LDCN_SANDBOX_EGRESS_NETWORK=ldcn-sandbox-egress`
and `LDCN_SANDBOX_EGRESS_PROXY=http://egress-proxy:3128`.

The internal network has no direct route to the host or Internet. Only the proxy
is dual-homed, and Squid denies private, loopback, link-local and cloud metadata
destinations before applying the package/Git domain allowlist.
