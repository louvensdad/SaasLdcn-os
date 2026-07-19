from __future__ import annotations

import difflib

from app.schemas.change_request import FileDiff
from app.services.file_protocol import EmittedFile


def build_file_diffs(
    before: dict[str, str | None],
    after: dict[str, EmittedFile],
    *,
    deleted: list[str] | None = None,
) -> list[FileDiff]:
    """Real content diffs for a Change Request patch, using stdlib difflib.

    `before` is a snapshot dict (path -> content, None meaning "did not exist").
    `after` is the accepted, in-scope emitted files the patch engine wants to
    write (path -> EmittedFile). `deleted` are scoped paths the patch explicitly
    removes (a distinct signal from the patch engine, never inferred from diffing).
    """
    diffs: list[FileDiff] = []
    for path, emitted in after.items():
        before_content = before.get(path)
        after_content = emitted.content
        change_kind = "added" if before_content is None else "modified"
        diffs.append(
            FileDiff(
                path=path,
                before=before_content,
                after=after_content,
                unified_diff=_unified_diff(path, before_content, after_content),
                change_kind=change_kind,
            )
        )
    for path in deleted or []:
        before_content = before.get(path)
        diffs.append(
            FileDiff(
                path=path,
                before=before_content,
                after=None,
                unified_diff=_unified_diff(path, before_content, None),
                change_kind="deleted",
            )
        )
    return diffs


def _unified_diff(path: str, before: str | None, after: str | None) -> str:
    before_lines = (before or "").splitlines(keepends=True)
    after_lines = (after or "").splitlines(keepends=True)
    lines = difflib.unified_diff(before_lines, after_lines, fromfile=f"a/{path}", tofile=f"b/{path}")
    return "".join(lines)
