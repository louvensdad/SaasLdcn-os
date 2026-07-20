from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

# Live App Preview (MLTagente vault gap #1, "Preview de app rodando" -- see
# 08 - Experiencia do Usuario/Fluxo do Preview.md, Sistema de Preview.md,
# Navegador integrado.md). Scope agreed with the user before building: a
# minimal dev/host-only slice, not the vault's full Docker-isolated proxy
# system -- it reuses the exact same HostExecutionRuntime primitives (and the
# same dev/local-only gate) that runtime_functional_test_service.py already
# established, except the process pair is kept alive across requests instead
# of being torn down at the end of a single run() call. Same honest-degrade
# pattern: unsupported stack or disallowed environment -> status="unsupported"
# with a reason, never a false "running".

LivePreviewStatus = Literal["starting", "running", "failed", "stopped", "unsupported"]


class LivePreviewSession(ApiModel):
    session_id: str
    project_id: str
    status: LivePreviewStatus
    reason: str = ""
    # Direct http://127.0.0.1:{port}/ URL for the iframe; None until running.
    # Not proxied through the API -- see live_preview_service.py's module
    # docstring for why a same-origin subpath proxy doesn't work here.
    preview_url: str | None = None
    started_at: str
    last_activity_at: str


class StartLivePreviewRequest(ApiModel):
    project_id: str = Field(min_length=1)


class ConsoleLogEntry(ApiModel):
    type: str
    text: str
    at: str


class NavigateRequest(ApiModel):
    path: str = Field(default="/", min_length=1)
