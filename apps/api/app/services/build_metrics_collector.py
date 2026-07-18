from __future__ import annotations

from app.schemas.generation_validation import BuildRuntimeMetrics


class _MetricsCollector:
    """Accumulates REAL build-resource measurements across the install/build phases."""

    def __init__(self) -> None:
        self.install_ms = 0
        self.build_ms = 0
        self.total_ms = 0
        self.peak_mb = 0.0
        self.cpu_s = 0.0
        self.ran = False
        self.mem_measured = False
        self.sampler = "wallclock"

    def add(self, phase: str, ms: int, peak_mb: float | None, cpu_s: float | None, sampler: str) -> None:
        self.ran = True
        self.total_ms += ms
        if phase == "install":
            self.install_ms += ms
        elif phase == "build":
            self.build_ms += ms
        if sampler == "psutil":
            self.sampler = "psutil"
        if peak_mb is not None:
            self.peak_mb = max(self.peak_mb, peak_mb)
            self.mem_measured = True
        if cpu_s is not None:
            self.cpu_s = max(self.cpu_s, cpu_s)

    def finalize(self) -> BuildRuntimeMetrics | None:
        if not self.ran:
            return None
        return BuildRuntimeMetrics(
            install_ms=self.install_ms,
            build_ms=self.build_ms,
            total_ms=self.total_ms,
            peak_memory_mb=round(self.peak_mb, 1) if self.mem_measured else None,
            cpu_seconds=round(self.cpu_s, 2) if self.mem_measured else None,
            sampler=self.sampler,  # type: ignore[arg-type]
        )