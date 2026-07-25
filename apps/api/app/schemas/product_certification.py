from __future__ import annotations

from typing import Literal

from app.schemas.common import ApiModel

# Product Certification Engine (Product Certification Engine P1, second slice):
# build passing != product complete. This report CONSOLIDATES already-computed
# signals (FunctionalCompletenessReport's 10 categories, FunctionalCoverageReport's
# per-app confidence-tagged findings, QualityGateReport's blocker count) into one
# status -- it detects nothing new itself.
#
# NEEDS_HUMAN_REVIEW is kept as a 6th value beyond the spec's 5 -- same honest
# addition kernel_phase already made for the same reason: collapsing "resource
# discovery couldn't even run for this stack" into BLOCKED or NEEDS_REPAIR would
# hide a real, already-established distinction (see functional_completeness.py's
# CompletenessStatus).
ProductCertificationStatus = Literal[
    "CERTIFIED", "PARTIALLY_CERTIFIED", "NEEDS_REPAIR", "BLOCKED",
    "FAILED_CERTIFICATION", "NEEDS_HUMAN_REVIEW",
]


class ProductCertificationReport(ApiModel):
    project_id: str
    status: ProductCertificationStatus
    reason: str
    backend: int = 0
    frontend: int | None = None
    mobile: int | None = None
    security: int | None = None
    documentation: int | None = None
    tests: int | None = None
    endpoint_coverage: int | None = None
    functional_coverage: int | None = None
    screen_coverage: int | None = None
    architecture: int = 100
    build: int = 0
    integrations: int | None = None
    overall: int = 0
    quality_gate_blocker_count: int = 0
    functional_coverage_blocking: bool = False
    # Frontend Authenticity Review Gate (PARTE 7): None when no frontend was
    # evaluated, same optionality as `frontend`/`functional_coverage` above.
    authenticity: int | None = None
    authenticity_blocking: bool = False
    generated_at: str
