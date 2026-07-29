from __future__ import annotations

import logging
import os
import shutil
import stat
import time
from pathlib import Path

# Windows-hardened "assemble in staging, publish by rename" helpers.
#
# On Windows, renaming a directory fails with ERROR_ACCESS_DENIED (5) or
# ERROR_SHARING_VIOLATION (32) while an external process (antivirus real-time
# scan, search indexer, backup agent) holds a handle on ANY file inside it —
# which is exactly what happens right after writing hundreds of generated
# files at once. That race produced pipeline failures like:
#   [WinError 5] Acesso negado: '...\\.staging-<project>-...'

logger = logging.getLogger(__name__)

_TRANSIENT_WINERRORS = {5, 32}
_PUBLISH_RETRY_DELAYS = (0.1, 0.25, 0.5, 1.0, 2.0, 3.0)


def _clear_readonly_and_retry(func, path, exc):  # noqa: ANN001 - shutil onexc signature
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except OSError:
        pass


def force_rmtree(path: Path) -> None:
    """rmtree that also removes read-only files (never raises)."""
    shutil.rmtree(path, onexc=_clear_readonly_and_retry)


def is_transient_lock(exc: OSError) -> bool:
    return getattr(exc, "winerror", None) in _TRANSIENT_WINERRORS


def publish_directory(staging: Path, destination: Path) -> None:
    """Move a fully assembled staging dir into its final place.

    Retries the rename with backoff while a transient Windows lock is held on
    the tree; if the lock never clears, falls back to copying the tree —
    publishing non-atomically beats failing the caller and discarding every
    staged file. On any failure the partially copied destination is removed
    and the original exception propagates (staging cleanup is the caller's
    responsibility, as on any other failure mode).
    """
    for attempt, delay in enumerate((0.0, *_PUBLISH_RETRY_DELAYS)):
        if delay:
            time.sleep(delay)
        try:
            os.replace(staging, destination)
            if attempt:
                logger.info("Publish rename for %s succeeded after %d retries.", destination.name, attempt)
            return
        except OSError as exc:
            if not is_transient_lock(exc):
                raise
            logger.warning(
                "Publish rename for %s hit a transient lock (attempt %d): %s",
                destination.name, attempt + 1, exc,
            )

    logger.warning(
        "Publish rename for %s still locked after retries; falling back to copy.", destination.name
    )
    try:
        shutil.copytree(staging, destination)
    except BaseException:
        force_rmtree(destination)
        raise
    force_rmtree(staging)
