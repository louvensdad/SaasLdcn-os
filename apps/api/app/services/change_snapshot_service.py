from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.services.file_protocol import EmittedFile
from app.services.generated_project_service import GeneratedProjectService
from app.services.project_writer import ProjectWriter

# Pre-patch snapshot of exactly the scoped files of a Change Request, so a build
# failure or an explicit rollback can restore the generated project to its exact
# prior state. Mirrors project_room_service._blueprint_version's "store the whole
# thing as JSON" philosophy (full content, not a diff) so restore needs no replay
# logic -- but unlike a Blueprint version, a scoped file may not exist yet (the
# patch is creating it), so capture() maps that to None and restore() deletes it.

# A "minimal patch" (per the Protocolo de alteracao incremental) should only ever
# touch a handful of files. This is a safety backstop against a runaway scope
# bloating the change_requests.snapshot_json column, not a business scoping rule.
MAX_SNAPSHOT_TOTAL_BYTES = 512 * 1024


class ChangeSnapshotError(RuntimeError):
    """Raised when a snapshot cannot be safely captured or restored."""

    def __init__(self, message: str, *, failed_paths: list[str] | None = None) -> None:
        super().__init__(message)
        self.failed_paths = failed_paths or []


class ChangeSnapshotService:
    def __init__(self, files_service: GeneratedProjectService | None = None) -> None:
        self.files_service = files_service or GeneratedProjectService()

    def capture(self, project: dict[str, Any], scope: list[str]) -> dict[str, str | None]:
        """Read current content of exactly the scoped files, before any patch is
        applied. A path not yet on disk maps to None (patch will create it)."""
        snapshot: dict[str, str | None] = {}
        total_bytes = 0
        for path in scope:
            try:
                data = self.files_service.read_file(project, path)
            except HTTPException as exc:
                if exc.status_code == 404:
                    snapshot[path] = None
                    continue
                raise ChangeSnapshotError(
                    f"Cannot snapshot '{path}': {exc.detail}", failed_paths=[path]
                ) from exc
            if not data.get("preview_supported", True):
                raise ChangeSnapshotError(
                    f"Cannot snapshot '{path}': binary content is not supported by Change Request patching.",
                    failed_paths=[path],
                )
            content = data.get("content") or ""
            total_bytes += len(content.encode("utf-8"))
            if total_bytes > MAX_SNAPSHOT_TOTAL_BYTES:
                raise ChangeSnapshotError(
                    "Change Request scope exceeds the snapshot size limit "
                    f"({MAX_SNAPSHOT_TOTAL_BYTES} bytes total) -- this is not a minimal patch.",
                    failed_paths=[path],
                )
            snapshot[path] = content
        return snapshot

    def restore(
        self,
        project_id: str,
        snapshot: dict[str, str | None],
        *,
        writer: ProjectWriter | None = None,
    ) -> None:
        """Write scoped files back to their pre-patch content; delete files that
        did not exist before the patch. Aggregates every failure into a single
        ChangeSnapshotError rather than leaving a half-restored project."""
        writer = writer or ProjectWriter()
        failed: list[str] = []
        to_write = [
            EmittedFile(path=path, content=content)
            for path, content in snapshot.items()
            if content is not None
        ]
        if to_write:
            try:
                writer.append(project_id, to_write)
            except Exception:  # noqa: BLE001 — fall back to per-file so one bad path doesn't block the rest
                for emitted in to_write:
                    try:
                        writer.append(project_id, [emitted])
                    except Exception:  # noqa: BLE001
                        failed.append(emitted.path)

        for path, content in snapshot.items():
            if content is not None:
                continue
            try:
                writer.delete(project_id, path)
            except Exception:  # noqa: BLE001
                failed.append(path)

        if failed:
            raise ChangeSnapshotError(
                f"Failed to restore {len(failed)} file(s) from snapshot: {', '.join(sorted(set(failed)))}",
                failed_paths=sorted(set(failed)),
            )
