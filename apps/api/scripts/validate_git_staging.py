"""Opt-in GitHub/GitLab staging validation.

This script refuses to run without an explicit staging base URL, access token,
provider and mutation flag. It never prints the token or response bodies that
could contain provider data.
"""
from __future__ import annotations

import os
import secrets
import sys

import httpx


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value: raise SystemExit(f"Missing required staging variable: {name}")
    return value


def main() -> int:
    base = required("LDCN_STAGING_BASE_URL").rstrip("/")
    token = required("LDCN_STAGING_ACCESS_TOKEN")
    provider = required("LDCN_STAGING_GIT_PROVIDER").lower()
    if provider not in {"github", "gitlab"}: raise SystemExit("LDCN_STAGING_GIT_PROVIDER must be github or gitlab")
    if os.getenv("LDCN_STAGING_ALLOW_MUTATION") != "1": raise SystemExit("Set LDCN_STAGING_ALLOW_MUTATION=1 to run create/push validation")
    namespace = required("LDCN_STAGING_GIT_NAMESPACE")
    workspace_id = required("LDCN_STAGING_WORKSPACE_ID")
    repo_name = f"ldcn-settings-staging-{secrets.token_hex(4)}"
    headers = {"Authorization": f"Bearer {token}"}
    scope = f"?workspace_id={workspace_id}"
    with httpx.Client(base_url=base, headers=headers, timeout=httpx.Timeout(30.0, connect=5.0), follow_redirects=False) as client:
        checks = []
        def call(method: str, path: str, **kwargs):
            response = client.request(method, path, **kwargs); response.raise_for_status(); checks.append(f"{method} {path} -> {response.status_code}"); return response.json() if response.content else {}
        call("GET", f"/api/integrations/git/{provider}{scope}")
        call("POST", f"/api/integrations/git/{provider}/validate{scope}")
        call("GET", f"/api/repositories?provider={provider}&page=1&per_page=10&workspace_id={workspace_id}")
        call("POST", f"/api/repositories{scope}", json={"provider": provider, "namespace": namespace, "repo_name": repo_name, "visibility": "private", "branch": "main"})
        commit = call("POST", f"/api/repositories/initial-commit{scope}", json={"provider": provider, "namespace": namespace, "repo_name": repo_name, "branch": "main", "commit_message": "Staging validation", "files": [{"relative_path": "README.md", "content": "# LDCN staging validation\n"}]})
        if not commit.get("commit_sha"): raise SystemExit("Provider did not return a commit SHA")
        call("GET", f"/api/repositories/last-commit?provider={provider}&namespace={namespace}&repo_name={repo_name}&branch=main&workspace_id={workspace_id}")
        call("DELETE", f"/api/integrations/git/{provider}{scope}")
    print("Git staging validation passed:")
    print("\n".join(f"- {item}" for item in checks))
    print("- credential revoked via disconnect")
    return 0


if __name__ == "__main__": sys.exit(main())
