"""Generate a static OpenAPI spec artifact for the LDCN OS API.

The interactive docs (Swagger/ReDoc/openapi.json) are disabled outside local dev
(audit S4/M9), so this build-time export is how partners/integrators inspect the API
surface in staging/production without exposing it at runtime (audit D3/L4).

Usage:
    python -m scripts.generate_openapi [output_path]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from app.main import create_application

DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "openapi.json"


def export_openapi(destination: Path | str = DEFAULT_OUTPUT) -> dict[str, Any]:
    """Build the OpenAPI schema from the FastAPI app and write it to `destination`.
    Returns the spec dict. Does not require the server to be running."""
    spec = create_application().openapi()
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    return spec


def main() -> None:
    destination = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUTPUT
    spec = export_openapi(destination)
    print(f"Wrote {destination} — {len(spec.get('paths', {}))} paths, OpenAPI {spec.get('openapi')}")


if __name__ == "__main__":
    main()
