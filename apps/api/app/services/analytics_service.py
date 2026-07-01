"""Analytics Center V1 — real operational intelligence.

Every number here comes from data the LDCN OS already persists: AI Project
Rooms (SQLite), the LGPD audit trail, and generated-project metadata. There are
no fabricated metrics, no fake billing, no invented geography or revenue.

Design rules:
- Each collector is fault-isolated. If one raises, its section is returned with
  ``status="error"`` and a sanitized reason; the rest of the response still
  succeeds (the endpoint never 500s because of a single collector).
- Modules with no real persistence yet return ``status="empty"`` with
  ``reason="no_data_source"`` instead of inventing data.
- Secrets are redacted before anything leaves the service.
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Callable

from app.core.config import get_settings
from app.engines.factory_pipeline import PIPELINE_ORDER
from app.repositories.generation_job_repository import GenerationJobRepository
from app.repositories.project_room_repository import ProjectRoomRepository
from app.repositories.redaction import redact_text, redact_value
from app.repositories.user_repository import AuditLogRepository
from app.schemas.analytics import (
    AnalyticsFilterOptions,
    AnalyticsMetric,
    AnalyticsOverviewResponse,
    AnalyticsSection,
    AnalyticsSeriesPoint,
)
from app.services.llm_settings_service import llm_settings_service
from app.services.project_service import ProjectService

logger = logging.getLogger("ldcn.analytics")

# Room lifecycle groupings (mirrors project_room_service statuses).
_APPROVED_OR_BEYOND = {
    "PROMPT_APPROVED", "BLUEPRINT_READY", "ENGINEERING_REVIEW", "ENGINEERING_APPROVED",
    "WAITING_META_FACTORY", "META_FACTORY_RUNNING", "GENERATING", "VALIDATING", "READY",
}
_ENGINEERING_APPROVED = {
    "ENGINEERING_APPROVED", "WAITING_META_FACTORY", "META_FACTORY_RUNNING",
    "GENERATING", "VALIDATING", "READY",
}
_SENT_TO_META = {"WAITING_META_FACTORY", "META_FACTORY_RUNNING", "GENERATING", "VALIDATING", "READY"}

# Audit event codes per module (only SAFE_EVENT_CODES are ever stored).
_LLM_EVENTS = {
    "LLM_PROVIDER_CONFIRMED", "LLM_PROVIDER_FAILED", "LLM_FALLBACK_DETERMINISTIC_USED",
    "LLM_PROVIDER_SELECTED", "LLM_PROVIDER_TESTED", "LLM_PROVIDER_CONFIGURED",
    "LLM_ACTION_STARTED", "LLM_ACTION_COMPLETED",
}
_MODERNIZE_EVENTS = {
    "modernize_project_uploaded", "modernize_git_imported", "codebase_analysis_started",
    "codebase_analysis_completed", "modernization_plan_approved", "auto_refactor_started",
    "auto_refactor_completed", "revalidation_started", "revalidation_completed",
    "modernized_project_exported",
}
_QUALITY_EVENTS = {
    "quality_gate_run", "quality_gate_failed", "auto_repair_started", "auto_repair_action_applied",
    "auto_repair_failed", "auto_repair_completed", "revalidation_run",
    "force_release_requested", "force_release_confirmed", "git_export_blocked",
}

_SECTION_IDS = [
    "project_rooms", "llm", "meta_factory", "modernize",
    "documentation", "quality", "technology_trends", "laboratory",
]


@dataclass(frozen=True)
class AnalyticsFilters:
    period: str | None = None
    workspace: str | None = None
    project_type: str | None = None
    provider: str | None = None
    stack: str | None = None
    status: str | None = None
    module: str | None = None
    severity: str | None = None
    agent: str | None = None
    language: str | None = None
    framework: str | None = None


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _period_cutoff(period: str | None) -> datetime | None:
    """Parse a period token (e.g. '7d', '30d', '12m', 'all') into a UTC cutoff."""
    if not period or period in {"all", "max", "lifetime"}:
        return None
    token = period.strip().lower()
    try:
        if token.endswith("d"):
            days = int(token[:-1])
        elif token.endswith(("mo", "m")):
            months = int(token.rstrip("mo") or token[:-1])
            days = months * 30
        elif token.endswith("y"):
            days = int(token[:-1]) * 365
        else:
            days = int(token)
    except ValueError:
        return None
    if days <= 0:
        return None
    return datetime.now(UTC) - timedelta(days=days)


def _parse_dt(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _within(created_at: Any, cutoff: datetime | None) -> bool:
    if cutoff is None:
        return True
    parsed = _parse_dt(created_at)
    return parsed is None or parsed >= cutoff


def _metric(
    id_: str, label: str, value: float | int | None, *, source: str,
    severity: str = "neutral", unit: str | None = None, drilldown_count: int | None = None,
) -> AnalyticsMetric:
    return AnalyticsMetric(
        id=id_, label=label, value=value, unit=unit,
        severity=severity, drilldown_count=drilldown_count, source=source,  # type: ignore[arg-type]
    )


def _series(counter: Counter[str], *, series: str | None = None, limit: int = 12) -> list[AnalyticsSeriesPoint]:
    return [
        AnalyticsSeriesPoint(label=redact_text(str(label)), value=count, series=series)
        for label, count in counter.most_common(limit)
        if label
    ]


def _empty(id_: str, title: str, reason: str, description: str) -> AnalyticsSection:
    return AnalyticsSection(id=id_, title=title, description=description, status="empty", reason=reason)


# --------------------------------------------------------------------------- #
# Collectors — each returns one AnalyticsSection; each fails in isolation.
# --------------------------------------------------------------------------- #

def collect_project_room_metrics(ctx: "_Context") -> AnalyticsSection:
    rooms = [r for r in ctx.rooms if _within(r.get("created_at"), ctx.cutoff)]
    if ctx.filters.status:
        rooms = [r for r in rooms if r.get("status") == ctx.filters.status]

    by_status = Counter(r.get("status", "UNKNOWN") for r in rooms)
    prompts_generated = sum(1 for r in rooms if r.get("prompt_master_md") or r.get("prompt_master_versions"))
    prompts_approved = sum(1 for r in rooms if r.get("status") in _APPROVED_OR_BEYOND)
    blueprints = sum(1 for r in rooms if r.get("architecture_blueprint"))
    eng_approved = sum(1 for r in rooms if r.get("status") in _ENGINEERING_APPROVED)
    sent_to_meta = sum(1 for r in rooms if r.get("status") in _SENT_TO_META or r.get("generation_handoff"))

    records = [
        {
            "id": r.get("room_id"),
            "projectId": r.get("room_id"),
            "name": redact_text(str(r.get("title") or "")),
            "status": r.get("status"),
            "lastUpdated": r.get("updated_at"),
            "promptStatus": "approved" if r.get("status") in _APPROVED_OR_BEYOND
            else ("generated" if (r.get("prompt_master_md") or r.get("prompt_master_versions")) else "none"),
            "blueprintStatus": "ready" if r.get("architecture_blueprint") else "none",
        }
        for r in rooms
    ]

    return AnalyticsSection(
        id="project_rooms",
        title="Project Rooms",
        description="Métricas reais das salas de projeto.",
        status="available" if rooms else "empty",
        reason=None if rooms else "no_data_source",
        metrics=[
            _metric("project_rooms_total", "Salas de Projeto", len(rooms), source="project_rooms", drilldown_count=len(rooms)),
            _metric("prompt_masters_generated", "PromptMasters gerados", prompts_generated, source="project_rooms"),
            _metric("prompt_masters_approved", "PromptMasters aprovados", prompts_approved, source="project_rooms",
                    severity="positive" if prompts_approved else "neutral"),
            _metric("blueprints_generated", "Blueprints gerados", blueprints, source="project_rooms"),
            _metric("engineering_reviews_approved", "Engineering Reviews aprovados", eng_approved, source="project_rooms"),
            _metric("sent_to_meta_factory", "Enviados para Meta-Fábrica", sent_to_meta, source="project_rooms"),
        ],
        series=_series(by_status, series="status"),
        records=records,
        columns=["projectId", "name", "status", "lastUpdated", "promptStatus", "blueprintStatus"],
    )


def collect_llm_metrics(ctx: "_Context") -> AnalyticsSection:
    events = [e for e in ctx.audit if e.get("event_code") in _LLM_EVENTS and _within(e.get("created_at"), ctx.cutoff)]
    counts = Counter(e.get("event_code") for e in events)
    active = ctx.active_llm

    actions_with_llm = counts.get("LLM_PROVIDER_CONFIRMED", 0) + counts.get("LLM_ACTION_COMPLETED", 0)
    deterministic = counts.get("LLM_FALLBACK_DETERMINISTIC_USED", 0)
    failures = counts.get("LLM_PROVIDER_FAILED", 0)
    confirmations = counts.get("LLM_PROVIDER_CONFIRMED", 0)

    # Active provider LABEL only — the key never leaves the TTL vault.
    provider_label = active.providerLabel or "Nenhum"

    # Real, measured token consumption from persisted generation jobs (audit B4/AI2):
    # turns this section from event-counting into actual usage/cost attribution.
    usage = ctx.usage or {}
    input_tokens = int(usage.get("input_tokens", 0) or 0)
    output_tokens = int(usage.get("output_tokens", 0) or 0)
    total_tokens = int(usage.get("total_tokens", 0) or 0)
    gen_jobs = int(usage.get("job_count", 0) or 0)
    by_model = usage.get("by_model") or []

    records = [
        {"id": e.get("id"), "event": e.get("event_code"), "at": e.get("created_at")}
        for e in events[:50]
    ]
    has_data = bool(events or active.provider or total_tokens)

    return AnalyticsSection(
        id="llm",
        title="LLM",
        description="Uso real de LLM: eventos do audit log + tokens medidos por geração (sem expor chaves).",
        status="available" if has_data else "empty",
        reason=None if has_data else "no_data_source",
        metrics=[
            _metric("llm_active_provider", f"Provider ativo: {provider_label}", 1 if active.provider else 0,
                    source="llm", severity="positive" if active.mode == "llm" else "neutral"),
            _metric("llm_actions", "Ações com LLM", actions_with_llm, source="llm"),
            _metric("llm_deterministic", "Ações determinísticas", deterministic, source="llm",
                    severity="warning" if deterministic else "neutral"),
            _metric("llm_fallback_used", "Fallback determinístico", deterministic, source="llm",
                    severity="warning" if deterministic else "neutral"),
            _metric("llm_provider_failures", "Falhas de provider", failures, source="llm",
                    severity="critical" if failures else "neutral"),
            _metric("llm_confirmations", "Confirmações", confirmations, source="llm"),
            _metric("llm_input_tokens", "Tokens de entrada", input_tokens, source="llm"),
            _metric("llm_output_tokens", "Tokens de saída", output_tokens, source="llm"),
            _metric("llm_total_tokens", "Tokens totais", total_tokens, source="llm"),
            _metric("llm_generations", "Gerações medidas", gen_jobs, source="llm"),
        ],
        series=_series(counts, series="event"),
        records=records or [
            {"model": row.get("model") or "desconhecido", "input": row.get("input_tokens", 0),
             "output": row.get("output_tokens", 0), "jobs": row.get("job_count", 0)}
            for row in by_model[:20]
        ],
        columns=["event", "at"] if records else ["model", "input", "output", "jobs"],
    )


def collect_meta_factory_metrics(ctx: "_Context") -> AnalyticsSection:
    rooms = [r for r in ctx.rooms if _within(r.get("created_at"), ctx.cutoff)]
    runs = [r for r in rooms if r.get("generation_handoff") or r.get("status") in _SENT_TO_META]
    completed = [
        r for r in runs
        if (r.get("generation_handoff") or {}).get("status") == "generated" or r.get("status") == "READY"
    ]
    failed = [r for r in runs if r.get("status") == "FAILED"]

    records = []
    for r in runs:
        handoff = r.get("generation_handoff") or {}
        records.append({
            "id": r.get("room_id"),
            "runId": r.get("room_id"),
            "projectId": handoff.get("generated_project_id") or r.get("room_id"),
            "status": r.get("status"),
            "startedAt": r.get("created_at"),
            "completedAt": r.get("updated_at") if r.get("status") in {"READY", "FAILED"} else None,
            "agents": len(PIPELINE_ORDER),
            "failures": 1 if r.get("status") == "FAILED" else 0,
        })

    return AnalyticsSection(
        id="meta_factory",
        title="Meta-Fábrica",
        description="Runs derivadas do ciclo real das salas (handoff + status).",
        status="available" if runs else "empty",
        reason=None if runs else "no_data_source",
        metrics=[
            _metric("meta_factory_runs", "Runs iniciadas", len(runs), source="meta_factory", drilldown_count=len(runs)),
            _metric("meta_factory_completed", "Runs concluídas", len(completed), source="meta_factory",
                    severity="positive" if completed else "neutral"),
            _metric("meta_factory_failed", "Runs com falha", len(failed), source="meta_factory",
                    severity="critical" if failed else "neutral"),
            _metric("meta_factory_agents", "Agentes por run", len(PIPELINE_ORDER), source="meta_factory"),
        ],
        series=_series(Counter(r.get("status", "UNKNOWN") for r in runs), series="status"),
        records=records,
        columns=["runId", "projectId", "status", "startedAt", "completedAt", "agents", "failures"],
    )


def collect_modernize_metrics(ctx: "_Context") -> AnalyticsSection:
    events = [e for e in ctx.audit if e.get("event_code") in _MODERNIZE_EVENTS and _within(e.get("created_at"), ctx.cutoff)]
    if not events:
        return _empty("modernize", "Modernize", "no_data_source",
                      "Nenhuma ingestão ou modernização registrada no audit log para este usuário.")
    counts = Counter(e.get("event_code") for e in events)
    return AnalyticsSection(
        id="modernize",
        title="Modernize",
        description="Pipeline de modernização a partir de eventos reais de auditoria.",
        metrics=[
            _metric("modernize_uploaded", "Projetos enviados (upload)", counts.get("modernize_project_uploaded", 0), source="modernize"),
            _metric("modernize_git", "Projetos importados (git)", counts.get("modernize_git_imported", 0), source="modernize"),
            _metric("modernize_analyses", "Diagnósticos executados", counts.get("codebase_analysis_completed", 0), source="modernize"),
            _metric("modernize_plans", "Planos aprovados", counts.get("modernization_plan_approved", 0), source="modernize"),
            _metric("modernize_autofixes", "Auto-fixes aplicados", counts.get("auto_refactor_completed", 0), source="modernize"),
            _metric("modernize_exports", "Exports de modernização", counts.get("modernized_project_exported", 0), source="modernize"),
        ],
        series=_series(counts, series="event"),
        columns=["event", "at"],
    )


def collect_documentation_metrics(ctx: "_Context") -> AnalyticsSection:
    # Documentation Score/checks are computed on demand by the documentation
    # engine; there is no persistent analytics store yet, so the only honest
    # real signal is how many generated projects could carry docs.
    candidates = [p for p in ctx.projects if p.get("generated_project_path")]
    if not candidates:
        return _empty("documentation", "Documentation", "no_data_source",
                      "Sem store persistente de documentação; nenhum projeto gerado disponível para análise.")
    return AnalyticsSection(
        id="documentation",
        title="Documentation",
        description="Projetos gerados elegíveis para documentação (score calculado sob demanda).",
        metrics=[
            _metric("documentation_candidate_projects", "Projetos com saída gerada", len(candidates), source="documentation"),
        ],
        records=[{"id": p.get("project_id"), "projectId": p.get("project_id"),
                  "name": redact_text(str(p.get("project_name") or ""))} for p in candidates],
        columns=["projectId", "name"],
    )


def collect_quality_metrics(ctx: "_Context") -> AnalyticsSection:
    events = [e for e in ctx.audit if e.get("event_code") in _QUALITY_EVENTS and _within(e.get("created_at"), ctx.cutoff)]
    if not events:
        return _empty("quality", "Quality", "no_data_source",
                      "Nenhum evento de quality gate / auto-repair registrado para este usuário.")
    counts = Counter(e.get("event_code") for e in events)
    return AnalyticsSection(
        id="quality",
        title="Quality",
        description="Quality gates, auto-repair e revalidações a partir do audit log.",
        metrics=[
            _metric("quality_gate_runs", "Quality gates executados", counts.get("quality_gate_run", 0), source="quality"),
            _metric("quality_gate_failed", "Quality gates falhos", counts.get("quality_gate_failed", 0), source="quality",
                    severity="warning" if counts.get("quality_gate_failed") else "neutral"),
            _metric("auto_repair_completed", "Auto-repairs concluídos", counts.get("auto_repair_completed", 0), source="quality"),
            _metric("git_export_blocked", "Exports bloqueados", counts.get("git_export_blocked", 0), source="quality",
                    severity="critical" if counts.get("git_export_blocked") else "neutral"),
        ],
        series=_series(counts, series="event"),
        columns=["event", "at"],
    )


def collect_technology_trends(ctx: "_Context") -> AnalyticsSection:
    languages: Counter[str] = Counter()
    frameworks: Counter[str] = Counter()
    project_types: Counter[str] = Counter()
    for p in ctx.projects:
        graph = p.get("technology_graph") or {}
        language = (graph.get("language") or {}).get("id") if isinstance(graph.get("language"), dict) else graph.get("language")
        framework = (graph.get("framework") or {}).get("id") if isinstance(graph.get("framework"), dict) else graph.get("framework")
        if language and (not ctx.filters.language or ctx.filters.language == language):
            languages[str(language)] += 1
        if framework and (not ctx.filters.framework or ctx.filters.framework == framework):
            frameworks[str(framework)] += 1
        archetype = p.get("archetype_id")
        if archetype and (not ctx.filters.project_type or ctx.filters.project_type == archetype):
            project_types[str(archetype)] += 1

    total = sum(languages.values())
    if total == 0 and not frameworks:
        return _empty("technology_trends", "Technology Trends", "no_data_source",
                      "Nenhum projeto gerado com grafo de tecnologia disponível.")
    return AnalyticsSection(
        id="technology_trends",
        title="Technology Trends",
        description="Linguagens, frameworks e tipos detectados em projetos reais.",
        metrics=[
            _metric("tech_languages", "Linguagens detectadas", len(languages), source="technology_trends"),
            _metric("tech_frameworks", "Frameworks detectados", len(frameworks), source="technology_trends"),
            _metric("tech_project_types", "Tipos de projeto", len(project_types), source="technology_trends"),
        ],
        series=(
            _series(languages, series="language")
            + _series(frameworks, series="framework")
            + _series(project_types, series="project_type")
        ),
        columns=["label", "value", "series"],
    )


def collect_laboratory_metrics(ctx: "_Context") -> AnalyticsSection:
    # The Engineering Laboratory has no persistent backend store of runs/scans;
    # surface that honestly instead of inventing numbers.
    return _empty("laboratory", "Laboratory", "no_data_source",
                  "Nenhuma fonte real de execução do Laboratory (testes/scans/terminal) está persistida.")


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

@dataclass
class _Context:
    user_id: str
    filters: AnalyticsFilters
    cutoff: datetime | None
    rooms: list[dict[str, Any]]
    audit: list[dict[str, Any]]
    projects: list[dict[str, Any]]
    active_llm: Any
    usage: dict[str, Any] | None = None


_COLLECTORS: dict[str, Callable[["_Context"], AnalyticsSection]] = {
    "project_rooms": collect_project_room_metrics,
    "llm": collect_llm_metrics,
    "meta_factory": collect_meta_factory_metrics,
    "modernize": collect_modernize_metrics,
    "documentation": collect_documentation_metrics,
    "quality": collect_quality_metrics,
    "technology_trends": collect_technology_trends,
    "laboratory": collect_laboratory_metrics,
}

# Headline metrics promoted to the top-level `metrics` array.
_HEADLINE = {
    "project_rooms": ["project_rooms_total", "prompt_masters_approved"],
    "meta_factory": ["meta_factory_runs", "meta_factory_completed"],
    "llm": ["llm_actions", "llm_provider_failures"],
    "technology_trends": ["tech_languages"],
}


class AnalyticsService:
    def __init__(
        self,
        room_repository: ProjectRoomRepository | None = None,
        project_service: ProjectService | None = None,
        audit_repository: AuditLogRepository | None = None,
    ) -> None:
        # Optional overrides for unit tests. When unset, repositories are built
        # per request from the *current* settings DB path — required because the
        # test harness rebinds the SQLite path after this singleton is imported.
        self._room_override = room_repository
        self._project_override = project_service
        self._audit_override = audit_repository

    def _room_repository(self) -> ProjectRoomRepository:
        return self._room_override or ProjectRoomRepository(get_settings().sqlite_path)

    def _project_service(self) -> ProjectService:
        if self._project_override:
            return self._project_override
        from app.repositories.project_repository import ProjectRepository
        return ProjectService(project_repository=ProjectRepository(get_settings().sqlite_path))

    def _audit_repository(self) -> AuditLogRepository:
        return self._audit_override or AuditLogRepository(get_settings().sqlite_path)

    def _safe(self, section_id: str, fn: Callable[["_Context"], AnalyticsSection], ctx: "_Context") -> AnalyticsSection:
        try:
            return fn(ctx)
        except Exception as exc:  # noqa: BLE001 — isolation is the whole point
            logger.warning("analytics collector '%s' failed: %s", section_id, type(exc).__name__)
            return AnalyticsSection(
                id=section_id,
                title=section_id.replace("_", " ").title(),
                status="error",
                reason="collector_error",
                description="Falha isolada neste coletor; o restante do relatório continua disponível.",
            )

    def _load(self, user_id: str) -> tuple[list, list, list, Any]:
        """Best-effort load of each source; a failing source degrades to empty."""
        try:
            rooms = list(self._room_repository().list_for_owner(user_id))
        except Exception:  # noqa: BLE001
            rooms = []
        try:
            audit = list(self._audit_repository().list_for_user(user_id))
        except Exception:  # noqa: BLE001
            audit = []
        try:
            projects = list(self._project_service().list_projects())
        except Exception:  # noqa: BLE001
            projects = []
        try:
            active = llm_settings_service.active(user_id)
        except Exception:  # noqa: BLE001
            from app.schemas.llm_settings import ActiveLlmSettings
            active = ActiveLlmSettings(reason="indisponível")
        return rooms, audit, projects, active

    def _filter_options(self, ctx: "_Context") -> AnalyticsFilterOptions:
        statuses = sorted({r.get("status") for r in ctx.rooms if r.get("status")})
        languages: set[str] = set()
        frameworks: set[str] = set()
        project_types: set[str] = set()
        for p in ctx.projects:
            graph = p.get("technology_graph") or {}
            lang = (graph.get("language") or {}).get("id") if isinstance(graph.get("language"), dict) else graph.get("language")
            fw = (graph.get("framework") or {}).get("id") if isinstance(graph.get("framework"), dict) else graph.get("framework")
            if lang:
                languages.add(str(lang))
            if fw:
                frameworks.add(str(fw))
            if p.get("archetype_id"):
                project_types.add(str(p["archetype_id"]))
        providers = [ctx.active_llm.providerLabel] if getattr(ctx.active_llm, "provider", None) else []
        return AnalyticsFilterOptions(
            project_types=sorted(project_types),
            providers=[p for p in providers if p],
            statuses=statuses,
            modules=_SECTION_IDS,
            severities=["neutral", "positive", "warning", "critical"],
            agents=list(PIPELINE_ORDER),
            languages=sorted(languages),
            frameworks=sorted(frameworks),
        )

    def overview(self, user_id: str, filters: AnalyticsFilters) -> AnalyticsOverviewResponse:
        cutoff = _period_cutoff(filters.period)
        rooms, audit, projects, active = self._load(user_id)
        since = cutoff.replace(microsecond=0).isoformat() if cutoff else None
        try:
            usage = GenerationJobRepository(get_settings().sqlite_path).usage_summary_for_owner(user_id, since)
        except Exception:  # noqa: BLE001 — usage is best-effort; the report never 500s
            usage = None
        ctx = _Context(user_id=user_id, filters=filters, cutoff=cutoff,
                       rooms=rooms, audit=audit, projects=projects, active_llm=active, usage=usage)

        # A `module` filter narrows the report to one section but never errors.
        wanted = [filters.module] if filters.module in _COLLECTORS else _SECTION_IDS
        sections = [self._safe(sid, _COLLECTORS[sid], ctx) for sid in wanted]

        by_id = {s.id: s for s in sections}
        headline: list[AnalyticsMetric] = []
        for section_id, metric_ids in _HEADLINE.items():
            section = by_id.get(section_id)
            if not section or section.status == "error":
                continue
            for metric in section.metrics:
                if metric.id in metric_ids:
                    headline.append(metric)

        period_start = cutoff.replace(microsecond=0).isoformat() if cutoff else None
        return AnalyticsOverviewResponse(
            generated_at=_now_iso(),
            period_start=period_start,
            period_end=_now_iso() if cutoff else None,
            metrics=[redact_metric(m) for m in headline],
            sections=[redact_section(s) for s in sections],
            filters=self._filter_options(ctx),
        )


def redact_metric(metric: AnalyticsMetric) -> AnalyticsMetric:
    metric.label = redact_text(metric.label)
    return metric


def redact_section(section: AnalyticsSection) -> AnalyticsSection:
    """Final safety net: redact record values before they leave the service."""
    section.records = [redact_value(record) for record in section.records]
    return section


analytics_service = AnalyticsService()
