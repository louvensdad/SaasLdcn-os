from __future__ import annotations

# Each agent owns a set of path prefixes. The FILE-protocol parser validates that
# an agent's emitted files all fall within its territory, preventing collisions
# and scope drift between agents (PASSO 5 governance).

AGENT_TERRITORIES: dict[str, list[str]] = {
    "contracts": ["openapi.yaml", "packages/contracts/"],
    "backend": ["apps/api/", "docs/traceability.md"],
    "frontend": ["apps/web/", "packages/contracts/"],
    "qa": ["apps/api/tests/", "deploy/postman/", "docs/security_review.md"],
    "devops": [
        "Dockerfile",
        "docker-compose.yml",
        "deploy/k8s/",
        ".github/workflows/",
        "COMMITS.md",
    ],
    "docs": ["README.md", "ARCHITECTURE.md", "docs/"],
}


def path_in_territory(agent_role: str, path: str) -> bool:
    """True if `path` is allowed for `agent_role`. Unknown roles allow nothing."""
    normalized = path.replace("\\", "/").lstrip("./")
    for prefix in AGENT_TERRITORIES.get(agent_role, []):
        if prefix.endswith("/"):
            if normalized.startswith(prefix):
                return True
        elif normalized == prefix:
            return True
    return False


def territory_violations(agent_role: str, paths: list[str]) -> list[str]:
    """Return the subset of `paths` that the agent is not allowed to write."""
    return [p for p in paths if not path_in_territory(agent_role, p)]
