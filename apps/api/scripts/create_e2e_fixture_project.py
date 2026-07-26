"""Create a minimal, REAL Next.js + FastAPI generated project on disk for the
Phase 2 "Sala de Execução" real-runtime Playwright suite
(apps/web/tests/live-preview-real-runtime.spec.ts).

Not a template/mock: this writes an actually-runnable frontend and backend
through the same ProjectWriter every real generation job uses, so
live_preview_service.start() treats it exactly like any other generated
project. Layout matches this repo's own apps/api + apps/web convention,
which RuntimeFunctionalTestService._find_python_backend /
_find_nextjs_frontend already recognize as backend/frontend candidate roots.

Usage: python scripts/create_e2e_fixture_project.py <owner_user_id>
Prints the resulting project_id on stdout (only that, so the caller can
capture it directly).
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, ".")

from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter
from app.repositories.project_repository import ProjectRepository
from app.data.foundation import CONTRACT_VERSION

BACKEND_MAIN = '''from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="E2E Real Runtime Fixture")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# In-memory on purpose: this fixture only needs to survive a BROWSER refresh
# (the backend process itself keeps running), not a server restart -- real
# multi-process persistence is already covered by craftforge-hub's real
# Postgres-backed Auth flow from Phase 1.
_items: list[dict] = [{"id": 1, "name": "seed-item"}]


@app.get("/")
async def root():
    # live_preview_service._wait_ready() polls the bare root path via
    # urllib.request.urlopen(), which RAISES on any 4xx/5xx status instead of
    # returning it -- so a backend with nothing mounted at "/" is
    # indistinguishable from "not up yet" and the readiness poll times out
    # even though the server is genuinely healthy. Every real generated
    # FastAPI backend needs something here, not just /health.
    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/items")
async def list_items():
    return {"items": _items}


class CreateItem(BaseModel):
    name: str


@app.post("/items")
async def create_item(body: CreateItem):
    item = {"id": len(_items) + 1, "name": body.name}
    _items.append(item)
    return item
'''

FRONTEND_PACKAGE_JSON = '''{
  "name": "e2e-real-runtime-fixture",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "typescript": "5.5.4",
    "@types/react": "18.3.5",
    "@types/node": "20.14.15"
  }
}
'''

FRONTEND_NEXT_CONFIG = '''/** @type {import('next').NextConfig} */
module.exports = { reactStrictMode: true };
'''

FRONTEND_LAYOUT = '''export const metadata = { title: "E2E Real Runtime Fixture" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
'''

FRONTEND_PAGE = '''"use client";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Item = { id: number; name: string };

export default function Home() {
  const [health, setHealth] = useState("checking");
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");

  async function refresh() {
    const healthRes = await fetch(`${API_URL}/health`);
    const healthBody = await healthRes.json();
    setHealth(healthBody.status);
    const itemsRes = await fetch(`${API_URL}/items`);
    const itemsBody = await itemsRes.json();
    setItems(itemsBody.items);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await fetch(`${API_URL}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    await refresh();
  }

  return (
    <main>
      <h1>E2E Real Runtime Fixture</h1>
      <p data-testid="backend-status">Backend status: {health}</p>
      <ul data-testid="item-list">
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
      <form onSubmit={onSubmit}>
        <input
          data-testid="item-name-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="item name"
        />
        <button type="submit" data-testid="item-submit">Add item</button>
      </form>
    </main>
  );
}
'''

FRONTEND_TSCONFIG = '''{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
'''


def _post_json(url: str, token: str, payload: dict) -> dict:
    import urllib.request

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 -- localhost only
        return json.loads(response.read().decode("utf-8"))


def _real_snapshots(api_base_url: str, token: str) -> tuple[dict, dict, dict]:
    """Blueprint/PromptMaster/Gatekeeper are large, strictly-validated nested
    Pydantic schemas (100+ required catalog fields) -- hand-rolling a literal
    that satisfies them is impractical and fragile. These 3 endpoints are the
    SAME deterministic, no-LLM-needed preview engines the real wizard flow
    uses (see tests/test_project_registry.py's _build_blueprint), so calling
    them for real is both correct and simpler than reverse-engineering the
    schema by hand."""
    blueprint = _post_json(f"{api_base_url}/blueprints/preview", token, {
        "project_name": "e2e-real-runtime-fixture",
        "language_id": "typescript",
        "runtime_id": "nodejs",
        "framework_id": "nextjs",
        "architecture_id": "modular_monolith",
        "archetype_id": "internal_tool",
        "capability_ids": [],
        "business_module_ids": [],
        "endpoint_ids": [],
        "locale": "en-US",
        "generation_mode": "local_build_90",
        "project_requirements": {
            "project_goal": "Real-runtime E2E fixture",
            "business_context": "Phase 2 Sala de Execucao validation",
            "target_users": ["qa"],
            "business_rules": [],
            "entities": ["Item"],
            "workflows": ["create_item"],
            "constraints": [],
            "delivery_target": "zip",
        },
    })
    prompt_master = _post_json(f"{api_base_url}/prompt-master/preview", token, {"blueprint": blueprint})
    gatekeeper = _post_json(f"{api_base_url}/gatekeeper/preview", token, {"blueprint": blueprint, "prompt_master": prompt_master})
    return blueprint, prompt_master, gatekeeper


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: create_e2e_fixture_project.py <owner_user_id> <api_base_url>\n(api_base_url used only to fetch a real deterministic blueprint/prompt-master/gatekeeper preview, e.g. http://127.0.0.1:8301/api -- pass a bearer token via E2E_FIXTURE_TOKEN env var)")
    owner = sys.argv[1]
    api_base_url = sys.argv[2].rstrip("/")
    token = os.environ["E2E_FIXTURE_TOKEN"]

    files = [
        EmittedFile(path="requirements.txt", content="fastapi>=0.115.0,<0.116.0\nuvicorn[standard]>=0.32.0,<0.33.0\npydantic>=2.10.0,<2.11.0\n"),
        EmittedFile(path="app/__init__.py", content=""),
        EmittedFile(path="app/main.py", content=BACKEND_MAIN),
        EmittedFile(path="apps/web/package.json", content=FRONTEND_PACKAGE_JSON),
        EmittedFile(path="apps/web/next.config.js", content=FRONTEND_NEXT_CONFIG),
        EmittedFile(path="apps/web/tsconfig.json", content=FRONTEND_TSCONFIG),
        EmittedFile(path="apps/web/app/layout.tsx", content=FRONTEND_LAYOUT),
        EmittedFile(path="apps/web/app/page.tsx", content=FRONTEND_PAGE),
    ]
    result = ProjectWriter().write(files, project_name="e2e-real-runtime-fixture", owner=owner)
    project_id = result.project_id

    # Register a matching `projects` DB row so /api/projects/{project_id} (and
    # the /projects/[projectId] page it backs) can find this project. Real
    # generation normally creates this row as part of the full Mission/
    # GenerationJob pipeline; that pipeline is LLM-driven and far too slow to
    # run per E2E test, so this mirrors project_repository.save_from_wizard's
    # exact INSERT shape directly -- the ONE thing save_from_wizard itself
    # can't do is let the caller choose project_id, and live_preview_service
    # resolves sessions by project_id being the literal directory name under
    # generated-projects/active/, so the two MUST match.
    blueprint, prompt_master, gatekeeper = _real_snapshots(api_base_url, token)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    record = {
        "project_id": project_id,
        "owner_user_id": owner,
        "workspace_id": None,
        "project_key": project_id,
        "project_name": blueprint["project_name"],
        "description": "Real-runtime E2E fixture (Phase 2 Sala de Execucao validation).",
        "objective": "Prove the live-preview flow against a real, unmocked backend+frontend.",
        "stack_id": "nextjs",
        "project_locale": blueprint["locale"],
        "status": "generated",
        "scope": "1 module, 2 endpoints.",
        "locale": blueprint["locale"],
        "generation_mode": blueprint["generation_mode"],
        "technology_graph_json": json.dumps(blueprint["technology_graph"]),
        "architecture_id": blueprint["architecture_profile"]["architecture_id"],
        "archetype_id": blueprint["archetype_profile"]["archetype_id"],
        "selected_capabilities_json": json.dumps([]),
        "selected_business_modules_json": json.dumps([]),
        "selected_endpoints_json": json.dumps([]),
        "blueprint_snapshot_json": json.dumps(blueprint),
        "architectural_graph_snapshot_json": None,
        "prompt_master_snapshot_json": json.dumps(prompt_master),
        "gatekeeper_snapshot_json": json.dumps(gatekeeper),
        "tags_json": json.dumps(["real_runtime_e2e"]),
        "readiness_status": "generated",
        "contract_version": CONTRACT_VERSION,
        "generated_project_path": result.root_path,
        "created_at": now,
        "updated_at": now,
    }
    with ProjectRepository().connection() as conn:
        conn.execute(
            """
            INSERT INTO projects (
                project_id, owner_user_id, workspace_id, project_key, project_name, description, objective, stack_id, project_locale,
                status, scope, locale, generation_mode,
                technology_graph_json, architecture_id, archetype_id,
                selected_capabilities_json, selected_business_modules_json, selected_endpoints_json,
                blueprint_snapshot_json, architectural_graph_snapshot_json, prompt_master_snapshot_json, gatekeeper_snapshot_json, tags_json,
                readiness_status, contract_version, generated_project_path, created_at, updated_at
            ) VALUES (
                :project_id, :owner_user_id, :workspace_id, :project_key, :project_name, :description, :objective, :stack_id, :project_locale,
                :status, :scope, :locale, :generation_mode,
                :technology_graph_json, :architecture_id, :archetype_id,
                :selected_capabilities_json, :selected_business_modules_json, :selected_endpoints_json,
                :blueprint_snapshot_json, :architectural_graph_snapshot_json, :prompt_master_snapshot_json, :gatekeeper_snapshot_json, :tags_json,
                :readiness_status, :contract_version, :generated_project_path, :created_at, :updated_at
            )
            """,
            record,
        )

    print(project_id)


if __name__ == "__main__":
    main()
