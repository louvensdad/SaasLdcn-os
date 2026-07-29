from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from app.schemas.generation_validation import BuildRuntimeMetrics
from app.schemas.performance_review import PerformanceFinding, PerformanceReviewReport

# Real minimal Performance Review (Enterprise-only, enable_performance_review):
# reuses the build metrics _MetricsCollector already captures for real during
# Build Guarantee (build_ms, peak_memory_mb) plus a frontend built-output size
# check when a `.next`/`dist`/`build` directory is present. WARNING-level
# findings only — performance must never block the "no broken code" guarantee
# every profile has to keep, so this never raises/blocks the pipeline.

BUILD_MS_WARNING_THRESHOLD = 5 * 60 * 1000  # 5 minutes
PEAK_MEMORY_MB_WARNING_THRESHOLD = 2048.0
FRONTEND_BUNDLE_BYTES_WARNING_THRESHOLD = 15 * 1024 * 1024  # 15 MB of built static output

_BUNDLE_DIRS = ("apps/web/.next", ".next", "apps/web/dist", "dist", "build")


class PerformanceReviewEngine:
    def evaluate(
        self, project_id: str, generated_project_path: str, metrics: BuildRuntimeMetrics | None,
    ) -> PerformanceReviewReport:
        findings: list[PerformanceFinding] = []
        build_ms = metrics.build_ms if metrics else None
        peak_memory_mb = metrics.peak_memory_mb if metrics else None
        cpu_seconds = metrics.cpu_seconds if metrics else None

        if build_ms and build_ms > BUILD_MS_WARNING_THRESHOLD:
            findings.append(PerformanceFinding(
                id="build_time_high", title="Tempo de build acima do esperado",
                detail=f"O build levou {build_ms / 1000:.0f}s, acima do limite de {BUILD_MS_WARNING_THRESHOLD / 1000:.0f}s.",
                metric="build_ms", value=float(build_ms), threshold=float(BUILD_MS_WARNING_THRESHOLD),
            ))
        if peak_memory_mb and peak_memory_mb > PEAK_MEMORY_MB_WARNING_THRESHOLD:
            findings.append(PerformanceFinding(
                id="peak_memory_high", title="Pico de memoria acima do esperado",
                detail=f"O build usou {peak_memory_mb:.0f}MB de pico, acima do limite de {PEAK_MEMORY_MB_WARNING_THRESHOLD:.0f}MB.",
                metric="peak_memory_mb", value=peak_memory_mb, threshold=PEAK_MEMORY_MB_WARNING_THRESHOLD,
            ))

        bundle_bytes = self._frontend_bundle_bytes(Path(generated_project_path))
        if bundle_bytes and bundle_bytes > FRONTEND_BUNDLE_BYTES_WARNING_THRESHOLD:
            findings.append(PerformanceFinding(
                id="frontend_bundle_large", title="Bundle de frontend grande",
                detail=(
                    f"O build de frontend gerou {bundle_bytes / (1024 * 1024):.1f}MB de saida estatica, "
                    f"acima do limite de {FRONTEND_BUNDLE_BYTES_WARNING_THRESHOLD / (1024 * 1024):.0f}MB."
                ),
                metric="frontend_bundle_bytes", value=float(bundle_bytes),
                threshold=float(FRONTEND_BUNDLE_BYTES_WARNING_THRESHOLD),
            ))

        return PerformanceReviewReport(
            project_id=project_id,
            status="WARNING" if findings else "OK",
            findings=findings,
            build_ms=build_ms, peak_memory_mb=peak_memory_mb, cpu_seconds=cpu_seconds,
            frontend_bundle_bytes=bundle_bytes,
            generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
        )

    @staticmethod
    def _frontend_bundle_bytes(root: Path) -> int | None:
        for candidate in _BUNDLE_DIRS:
            target = root / candidate
            if target.is_dir():
                total = sum(f.stat().st_size for f in target.rglob("*") if f.is_file())
                if total:
                    return total
        return None


performance_review_engine = PerformanceReviewEngine()
