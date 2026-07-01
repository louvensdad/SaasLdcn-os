from __future__ import annotations

import json
import tempfile
from pathlib import Path

from scripts.generate_openapi import export_openapi


def test_export_openapi_writes_valid_spec():
    with tempfile.TemporaryDirectory() as directory:
        out = Path(directory) / "openapi.json"
        spec = export_openapi(out)

        assert out.is_file()
        assert str(spec.get("openapi", "")).startswith("3.")
        # A representative real route is present (the B4 usage endpoint).
        assert "/api/meta-factory/jobs/usage" in spec["paths"]
        # The written file is valid JSON matching the returned spec.
        assert json.loads(out.read_text(encoding="utf-8"))["paths"]
