from __future__ import annotations

import json
import re
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.engines.auto_repair_engine import auto_repair_engine
from app.engines.codebase_analysis_engine import analyze, build_inventory
from app.engines.deep_engineering_engine import deep_engineering_engine
from app.engines.runtime_profile_engine import runtime_profile_engine
from app.engines.generation_validation_engine import generation_validation_engine
from app.engines.generated_project_quality_engine import GeneratedProjectQualityEngine
from app.engines.modernization_engine import build_migration_plan, modernize_with_factory
from app.engines.modernization_plan_engine import build_plan, issue_phase
from app.engines.modernize_analysis_engine import analyze_project, score_codebase, score_root
from app.engines.quality_gate_engine import quality_gate_engine
from app.engines.llm.base import LLMError
from app.engines.llm.router import LLMRouter
from app.data.model_registry import MODEL_REGISTRY
from app.repositories.modernize_job_repository import ModernizeJobRepository
from app.repositories.user_repository import AuditLogRepository
from app.schemas.api_collection import ApiCollectionResponse, GeneratedEndpointsResponse
from app.schemas.generated_export import GeneratedProjectExportRequest, GeneratedProjectExportResponse, GitProvider
from app.schemas.llm import LLMRequest
from app.schemas.modernize import (
    ApprovePlanRequest,
    CodeDiffSummary,
    CodebaseAnalysisReport,
    CodebaseScores,
    FixApproval,
    IngestGitRequest,
    IngestStats,
    ModernizeAskRequest,
    ModernizeAskResponse,
    ModernizeDeepAnalyzeRequest,
    ModernizeRuntimeRequest,
    RuntimeProfile,
    ModernizeDetectedTechnology,
    ModernizeExecutiveSummary,
    ModernizeFindingSummary,
    ModernizeScoreMetric,
    LlmConnectionTestRequest,
    LlmConnectionTestResult,
    LlmProviderCatalog,
    LlmProviderConfig,
    ModernizeConfigResponse,
    ModernizeFlags,
    ModernizeGenerateRequest,
    ModernizeGenerateResponse,
    ModernizeProjectIngest,
    ModernizeProjectSummary,
    ModernizeResponse,
    ModernizationPlan,
    ModernizationReportResponse,
    RefactorResult,
    RevalidationReport,
)
from app.services.api_collection_service import api_collection_service
from app.services.codebase_ingest_service import (
    INGEST_ROOT,
    CodebaseIngestError,
    IngestResult,
    codebase_ingest_service,
)
from app.services.file_protocol import EmittedFile
from app.services.generated_project_service import GeneratedProjectService
from app.services.git_provider_service import git_provider_service
from app.services.project_writer import DEFAULT_OUTPUT_ROOT
from app.services.project_writer import ProjectWriter, ProjectWriteError
from app.services.user_key_session_service import user_key_session
from app.services.llm_settings_service import llm_provider_resolver

router = APIRouter(tags=["modernize"])
service = codebase_ingest_service
_generated_project_service = GeneratedProjectService()
_quality_engine = GeneratedProjectQualityEngine()
_SAFE_PROJECT_ID = re.compile(r"^[A-Za-z0-9_.-]+$")

# Remembers source/skipped per ingest so /generate can rebuild the inventory
# without re-uploading. Process-local, like the other in-memory job stores.
_INGESTS: dict[str, dict] = {}

# Owner-scoped pipeline job store, now persisted in SQLite (survives restart).
# Keyed by the ingest id (== modernize project id). Foreign access yields 404.
_jobs_repo = ModernizeJobRepository()

# Provider catalog cards. DeepSeek is reached via the OpenRouter provider/key.
_PROVIDER_CARDS: list[dict] = [
    {"id": "openai", "name": "GPT / OpenAI", "description": "Bom para análise geral, arquitetura e documentação.", "recommended_for": "Arquitetura e documentação", "key_required": True},
    {"id": "anthropic", "name": "Claude / Anthropic", "description": "Forte em análise longa de codebase e refatoração.", "recommended_for": "Refatoração de codebase", "key_required": True},
    {"id": "google", "name": "Gemini / Google", "description": "Bom custo-benefício para leitura e análise ampla.", "recommended_for": "Análise ampla", "key_required": True},
    {"id": "openrouter", "name": "DeepSeek", "description": "Bom para análise de código e raciocínio técnico (via OpenRouter).", "recommended_for": "Análise de código", "key_required": True},
    {"id": "openrouter", "name": "OpenRouter", "description": "Muitos modelos por uma única chave OpenRouter.", "recommended_for": "Flexibilidade de modelos", "key_required": True},
    {"id": "ollama", "name": "Ollama Local", "description": "Modelos locais, sem chave (requer Ollama instalado).", "recommended_for": "Offline / local", "key_required": False},
]


def _audit(user_id: str, event_code: str) -> None:
    try:
        AuditLogRepository(get_settings().sqlite_path).record(user_id=user_id, event_code=event_code)
    except Exception:  # noqa: BLE001
        pass


def _require_flag(flag: str) -> None:
    settings = get_settings()
    if not getattr(settings, "modernize_enabled", True) or not getattr(settings, flag, True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Esta ação está desativada por configuração.")


def _provider_cards(user_id: str) -> list[LlmProviderConfig]:
    active = {provider for provider, _masked, _expires_in in user_key_session.status(user_id)}
    return [
        LlmProviderConfig(
            id=card["id"], name=card["name"], description=card["description"],
            recommended_for=card["recommended_for"], key_required=card["key_required"],
            status="ready" if (card["id"] in active or not card["key_required"]) else "not_configured",
        )
        for card in _PROVIDER_CARDS
    ]


def _job(project_id: str, user_id: str) -> dict:
    job = _jobs_repo.get_for_owner(project_id, user_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto de modernização não encontrado.")
    return job


def _materialize(ingest_id: str, project_name: str) -> object:
    files: list[EmittedFile] = []
    for rel, abs_path, _lang in service.iter_files(ingest_id):
        try:
            content = abs_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        files.append(EmittedFile(path=rel, content=content))
    return ProjectWriter().write(files, project_name=project_name, metadata={"source": "modernize", "ingest_id": ingest_id})


def _modernize_project(project_id: str) -> dict:
    if not _SAFE_PROJECT_ID.match(project_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project id.")
    return {
        "project_id": project_id,
        "generated_project_path": str(DEFAULT_OUTPUT_ROOT / project_id),
    }


def _stats_schema(result: IngestResult) -> IngestStats:
    return IngestStats(**result.stats.as_dict())


async def _spool_upload(file: UploadFile) -> Path:
    """Stream an uploaded archive to a temp file on disk WITHOUT buffering it in
    memory, enforcing the (large) compressed-upload cap as we go. Returns the temp
    path; the caller must delete it."""
    max_upload = int(get_settings().modernize_max_upload_bytes)
    INGEST_ROOT.mkdir(parents=True, exist_ok=True)
    written = 0
    fd, tmp_name = tempfile.mkstemp(suffix=".zip", dir=str(INGEST_ROOT))
    tmp_path = Path(tmp_name)
    try:
        with open(fd, "wb") as out:
            while True:
                chunk = await file.read(1 << 20)  # 1 MiB
                if not chunk:
                    break
                written += len(chunk)
                if written > max_upload:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Upload exceeds the configured compressed-archive limit.",
                    )
                out.write(chunk)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise
    if written == 0:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty upload.")
    return tmp_path



_SCORE_LABELS = {
    "overall": "Overall Health",
    "architecture": "Architecture Score",
    "security": "Security Score",
    "performance": "Performance Score",
    "maintainability": "Maintainability",
    "tests": "Test Coverage",
    "production_readiness": "Project Health",
    "devops": "Documentation",
}


def _executive_summary(inventory, diagnosis, stats: IngestStats | None) -> ModernizeExecutiveSummary:
    scores = score_codebase(inventory, diagnosis)
    security_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for finding in diagnosis.security_findings:
        security_counts[finding.severity] = security_counts.get(finding.severity, 0) + 1
    smells = len(diagnosis.smells)
    dependency_issues = len([note for note in diagnosis.dependency_notes if not note.lower().startswith("nenhuma")])
    total = sum(security_counts.values()) + smells + dependency_issues
    findings = ModernizeFindingSummary(
        **security_counts,
        total=total,
        technical_debt=smells + dependency_issues,
        duplicated_code=0,
        dead_code=0,
        dependencies=dependency_issues,
    )
    score_metrics = [
        ModernizeScoreMetric(id=key, label=label, value=getattr(scores, key), basis="Derived by score_codebase from inventory, diagnosis, security findings and project evidence.")
        for key, label in _SCORE_LABELS.items()
    ]
    technologies: list[ModernizeDetectedTechnology] = []
    for language, count in sorted(inventory.languages.items(), key=lambda item: item[1], reverse=True):
        technologies.append(ModernizeDetectedTechnology(name=language, category="language", confidence=90, evidence=f"{count} indexed file(s)."))
    for framework in (stats.frameworks if stats else []):
        technologies.append(ModernizeDetectedTechnology(name=framework, category="framework", confidence=85, evidence="Detected by Smart Ingest framework markers."))
    if diagnosis.detected_stack and diagnosis.detected_stack != "unknown":
        technologies.insert(0, ModernizeDetectedTechnology(name=diagnosis.detected_stack, category="stack", confidence=88, evidence="Detected by backend stack markers."))
    risk_level = "high" if findings.critical or findings.high or scores.security < 60 else "medium" if total or scores.overall < 75 else "low"
    health_label = "Enterprise Ready" if scores.overall >= 85 else "Modernization advised" if scores.overall >= 65 else "High remediation required"
    minutes = max(8, min(180, 8 + (stats.analyzable_count if stats else inventory.file_count) * 2 + total * 4))
    top = []
    if diagnosis.security_findings:
        top.append("security findings")
    if dependency_issues:
        top.append("dependency drift")
    if smells:
        top.append("architecture and maintainability smells")
    if not top:
        top.append("no critical deterministic blockers")
    review = (
        "Backend deterministic analysis completed. "
        f"It found {total} governed improvement point(s). "
        f"Main risk areas: {', '.join(top)}. "
        "Run security modernization first when critical or high findings exist."
    )
    return ModernizeExecutiveSummary(
        overall_health=scores.overall,
        health_label=health_label,
        modernization_estimate=f"{minutes} min",
        complexity=stats.complexity if stats else "unknown",
        risk_level=risk_level,  # type: ignore[arg-type]
        analysis_confidence=92 if stats and not stats.truncated else 76,
        scores=score_metrics,
        findings=findings,
        technologies=technologies,
        review=review,
        priority="Security first, then architecture, tests and delivery automation.",
    )
def _diagnose(result: IngestResult) -> ModernizeResponse:
    _INGESTS[result.ingest_id] = {"source": result.source, "skipped": result.skipped, "stats": result.stats.as_dict()}
    inventory = build_inventory(result.ingest_id, result.source, result.skipped, service)
    diagnosis = analyze(result.ingest_id, inventory, service)
    plan = build_migration_plan(inventory, diagnosis)
    stats = _stats_schema(result)
    return ModernizeResponse(
        inventory=inventory,
        diagnosis=diagnosis,
        plan=plan,
        stats=stats,
        executive_summary=_executive_summary(inventory, diagnosis, stats),
    )


@router.post("/modernize/ingest/zip", response_model=ModernizeResponse)
async def ingest_zip(file: UploadFile = File(...)) -> ModernizeResponse:
    tmp_path = await _spool_upload(file)
    try:
        result = service.ingest_zip_path(tmp_path)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    finally:
        tmp_path.unlink(missing_ok=True)
    return _diagnose(result)


@router.post("/modernize/ingest/git", response_model=ModernizeResponse)
def ingest_git(payload: IngestGitRequest) -> ModernizeResponse:
    try:
        result = service.ingest_git(payload.git_url)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _diagnose(result)


def _deep_sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"


@router.post("/modernize/deep-analyze/stream")
def modernize_deep_analyze_stream(payload: ModernizeDeepAnalyzeRequest) -> StreamingResponse:
    """Stream a deliberate, deep engineering analysis of the ingested codebase
    (inventory, stack, smells, security, dependencies, risk, modernization plan,
    validation) BEFORE the modernization runs â€” so the analysis reads as real
    engineering, not an instant result."""
    meta = _INGESTS.get(payload.ingest_id)
    if meta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown ingest id.")
    try:
        inventory = build_inventory(payload.ingest_id, meta["source"], meta["skipped"], service)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    diagnosis = analyze(payload.ingest_id, inventory, service)
    plan = build_migration_plan(inventory, diagnosis)
    stats = IngestStats(**meta["stats"]) if meta.get("stats") else None

    def event_source():
        for event in deep_engineering_engine.iter_codebase_analysis(inventory, diagnosis, plan, stats, pace=payload.pace):
            yield _deep_sse(event)
        yield _deep_sse({"type": "done"})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


_ASK_SYSTEM_PROMPT = (
    "You are a senior software architect answering questions about ONE specific codebase. "
    "Answer ONLY from the provided project facts (stack, findings, smells, dependencies, plan). "
    "Be concise and concrete. Never invent files, metrics, vulnerabilities or recommendations "
    "that are not supported by the facts. If the facts do not cover the question, say so. "
    "Answer in the user's language."
)


def _deterministic_answer(question: str, inventory, diagnosis, plan, executive) -> tuple[str, list[str]]:
    """Honest, grounded answer built only from the real analysis â€” no LLM, no invention."""
    q = question.lower()
    grounded: list[str] = []
    sec = list(diagnosis.security_findings)
    smells = list(diagnosis.smells)
    deps = [n for n in diagnosis.dependency_notes if not n.lower().startswith("nenhuma")]

    def _sec_line() -> str:
        if not sec:
            return "Nenhum achado de segurança crítico foi retornado pela varredura."
        grounded.append("security_findings")
        top = "; ".join(f"{f.code} ({f.severity}) em {f.path}:{f.line or '?'}" for f in sec[:5])
        return f"{len(sec)} achado(s) de segurança. Principais: {top}."

    if any(k in q for k in ("segur", "security", "vulnerab", "owasp", "secret", "jwt")):
        answer = _sec_line()
    elif any(k in q for k in ("errado", "problema", "wrong", "issue", "ruim")):
        parts = [f"Saúde geral: {executive.overall_health}% ({executive.health_label})."]
        if sec:
            parts.append(_sec_line())
        if smells:
            grounded.append("smells")
            parts.append("Smells de arquitetura: " + "; ".join(s.message for s in smells[:4]) + ".")
        if deps:
            grounded.append("dependency_notes")
            parts.append("Dependências: " + "; ".join(deps[:3]) + ".")
        answer = " ".join(parts)
    elif any(k in q for k in ("melhor", "improve", "recomend", "priorid", "next", "começ")):
        grounded.append("plan")
        steps = "; ".join(f"{i+1}. {s}" for i, s in enumerate(plan.steps[:6])) or "plano ainda não gerado"
        answer = f"Prioridade: {executive.priority} Passos do plano: {steps}."
    elif any(k in q for k in ("arquitet", "architecture", "clean", "padr", "estrutura")):
        grounded.append("architecture")
        answer = (
            f"Stack detectada: {diagnosis.detected_stack} (linguagem principal: {diagnosis.primary_language}). "
            f"Arquitetura-alvo recomendada: {plan.target_architecture}. {plan.preserved_logic_note}"
        )
    elif any(k in q for k in ("microserv", "microservice", "monolit", "escal", "scal")):
        grounded.append("architecture")
        answer = (
            f"Com complexidade '{executive.complexity}' e risco '{executive.risk_level}', a recomendação atual é "
            f"'{plan.target_architecture}'. Migrar para microsserviços só compensa após estabilizar a base "
            "(testes, segurança e fronteiras de módulo claras)."
        )
    else:
        grounded.append("executive")
        answer = executive.review

    return answer, sorted(set(grounded))


@router.post("/modernize/ask", response_model=ModernizeAskResponse)
def modernize_ask(payload: ModernizeAskRequest, user: CurrentUser) -> ModernizeAskResponse:
    """Grounded Q&A about an ingested project. Uses the configured LLM with the
    user's key when available; otherwise an honest deterministic answer built only
    from the real analysis (never invented)."""
    meta = _INGESTS.get(payload.ingest_id)
    if meta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown ingest id.")
    try:
        inventory = build_inventory(payload.ingest_id, meta["source"], meta["skipped"], service)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    diagnosis = analyze(payload.ingest_id, inventory, service)
    plan = build_migration_plan(inventory, diagnosis)
    stats = IngestStats(**meta["stats"]) if meta.get("stats") else None
    executive = _executive_summary(inventory, diagnosis, stats)

    context = llm_provider_resolver.resolve(
        workspace_id=None, user_id=user["user_id"], requested_capability="modernize_assistant",
        requested_model=payload.user_model_choice,
    )
    api_key = context.api_key if context.resolution.mode == "llm" else None

    if api_key:
        facts = {
            "detected_stack": diagnosis.detected_stack,
            "primary_language": diagnosis.primary_language,
            "technologies": [t.name for t in executive.technologies],
            "scores": {m.id: m.value for m in executive.scores},
            "security_findings": [f"{f.code} ({f.severity}) {f.path}:{f.line or ''}" for f in diagnosis.security_findings[:20]],
            "smells": [s.message for s in diagnosis.smells],
            "dependency_notes": diagnosis.dependency_notes,
            "target_architecture": plan.target_architecture,
            "plan_steps": plan.steps,
        }
        # Ecosystem specialist layer: answers about a Go/PHP/.NET codebase cite the
        # real toolchain (manifests, test/build commands) instead of generic advice.
        from app.data.language_agent_profiles import ecosystem_brief

        brief = ecosystem_brief(diagnosis.primary_language, diagnosis.detected_stack)
        system = f"{_ASK_SYSTEM_PROMPT}\n\n{brief}" if brief else _ASK_SYSTEM_PROMPT
        try:
            response = LLMRouter().route(
                LLMRequest(
                    system=system,
                    user=f"PROJECT FACTS (JSON):\n{json.dumps(facts, ensure_ascii=False)}\n\nQUESTION: {payload.question}",
                    max_output_tokens=1200,
                ),
                user_choice=payload.user_model_choice,
                api_key=api_key,
            )
            if not response.served_by_fallback and response.text.strip():
                _audit(user["user_id"], "llm_connection_tested")
                return ModernizeAskResponse(answer=response.text.strip(), mode="llm", grounded_on=["project_facts"])
        except LLMError:
            pass  # fall through to the honest deterministic answer

    answer, grounded = _deterministic_answer(payload.question, inventory, diagnosis, plan, executive)
    return ModernizeAskResponse(answer=answer, mode="deterministic", grounded_on=grounded)


@router.post("/modernize/runtime-profile", response_model=RuntimeProfile)
def modernize_runtime_profile(payload: ModernizeRuntimeRequest) -> RuntimeProfile:
    """Real runtime PROFILE of the ingested codebase, computed by reading the code
    (the legacy project is never executed). Returns measured metrics + clearly
    labeled heuristic estimates."""
    meta = _INGESTS.get(payload.ingest_id)
    if meta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown ingest id.")
    try:
        inventory = build_inventory(payload.ingest_id, meta["source"], meta["skipped"], service)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    diagnosis = analyze(payload.ingest_id, inventory, service)
    stats = IngestStats(**meta["stats"]) if meta.get("stats") else None
    return RuntimeProfile.model_validate(
        runtime_profile_engine.profile(payload.ingest_id, service, inventory, diagnosis, stats)
    )


@router.post("/modernize/generate", response_model=ModernizeGenerateResponse)
def modernize_generate(payload: ModernizeGenerateRequest, user: CurrentUser) -> ModernizeGenerateResponse:
    meta = _INGESTS.get(payload.ingest_id)
    if meta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown ingest id.")

    context = llm_provider_resolver.resolve(
        workspace_id=None, user_id=user["user_id"], requested_capability="modernize_generation",
        requested_model=payload.user_model_choice,
    )
    api_key = context.api_key if context.resolution.mode == "llm" else None
    if payload.use_user_key and api_key is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{context.resolution.reason} API key não disponível.")

    try:
        inventory = build_inventory(payload.ingest_id, meta["source"], meta["skipped"], service)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    diagnosis = analyze(payload.ingest_id, inventory, service)
    plan = build_migration_plan(inventory, diagnosis)
    pipeline = modernize_with_factory(
        payload.ingest_id, inventory, diagnosis, plan, service,
        user_model_choice=payload.user_model_choice, api_key=api_key,
    )
    degraded = any(run.response.served_by_fallback for run in pipeline.runs)

    response = ModernizeGenerateResponse(
        ok=pipeline.ok, errors=pipeline.errors, warnings=pipeline.warnings, degraded=degraded
    )
    # Persist whatever was produced even if an agent failed (don't discard work).
    files = [f for run in pipeline.runs for f in run.parsed.files]
    if payload.persist and files:
        try:
            write_result = ProjectWriter().write(
                files,
                project_name=payload.project_name,
                metadata={"source": "modernization", "ingest_id": payload.ingest_id},
                owner=user["user_id"],
            )
        except ProjectWriteError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        response.project_id = write_result.project_id
        response.file_count = write_result.file_count
        response.written = True
        response.validation_report = generation_validation_engine.validate(_modernize_project(write_result.project_id))
    return response


def _default_model_for(provider: str) -> str | None:
    for model_id, meta in MODEL_REGISTRY.items():
        if meta.get("provider") == provider:
            return model_id
    return None


@router.get("/modernize/config", response_model=ModernizeConfigResponse)
def modernize_config(user: CurrentUser) -> ModernizeConfigResponse:
    s = get_settings()
    flags = ModernizeFlags(
        modernize_enabled=s.modernize_enabled,
        modernize_git_import=s.modernize_git_import,
        modernize_zip_upload=s.modernize_zip_upload,
        modernize_auto_refactor=s.modernize_auto_refactor,
        modernize_user_llm_key=s.modernize_user_llm_key,
        modernize_export=s.modernize_export,
    )
    return ModernizeConfigResponse(flags=flags, providers=_provider_cards(user["user_id"]))


@router.get("/modernize/llm/providers", response_model=LlmProviderCatalog)
def modernize_llm_providers(user: CurrentUser) -> LlmProviderCatalog:
    return LlmProviderCatalog(providers=_provider_cards(user["user_id"]))


@router.post("/modernize/llm/test", response_model=LlmConnectionTestResult)
def modernize_llm_test(payload: LlmConnectionTestRequest, user: CurrentUser) -> LlmConnectionTestResult:
    provider = payload.provider.strip().lower()
    _audit(user["user_id"], "llm_provider_selected")
    if provider == "ollama":
        _audit(user["user_id"], "llm_connection_tested")
        return LlmConnectionTestResult(ok=True, provider=provider, model=None, message="Ollama local: nenhuma chave necessária.", degraded=True)
    api_key = user_key_session.get(user["user_id"], provider)
    if api_key is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhuma chave na sessão para este provedor. Cole a chave primeiro.")
    try:
        response = LLMRouter().route(
            LLMRequest(system="ping", user="responda apenas: ok"),
            user_choice=_default_model_for(provider),
            api_key=api_key,
        )
    except Exception as exc:  # noqa: BLE001 Ã¢â‚¬â€ any provider/SDK/network failure means "not connected"
        _audit(user["user_id"], "llm_connection_tested")
        return LlmConnectionTestResult(ok=False, provider=provider, model=None, message=f"Falha na conexão: {exc}"[:300], degraded=False)
    _audit(user["user_id"], "llm_connection_tested")
    return LlmConnectionTestResult(ok=True, provider=provider, model=response.model, message="Conexão validada. LLM pronto.", degraded=False)


@router.post("/modernize/projects/upload", response_model=ModernizeProjectIngest, status_code=status.HTTP_201_CREATED)
async def modernize_upload(user: CurrentUser, file: UploadFile = File(...)) -> ModernizeProjectIngest:
    _require_flag("modernize_zip_upload")
    tmp_path = await _spool_upload(file)
    try:
        result = service.ingest_zip_path(tmp_path)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    finally:
        tmp_path.unlink(missing_ok=True)
    return _register_job(result, user["user_id"], "modernize_project_uploaded")


@router.post("/modernize/projects/git", response_model=ModernizeProjectIngest, status_code=status.HTTP_201_CREATED)
def modernize_git_import(payload: IngestGitRequest, user: CurrentUser) -> ModernizeProjectIngest:
    _require_flag("modernize_git_import")
    try:
        result = service.ingest_git(payload.git_url)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _register_job(result, user["user_id"], "modernize_git_imported")


def _project_summary(project_id: str, data: dict, created_at: str, updated_at: str) -> ModernizeProjectSummary:
    stats = data.get("stats") or {}
    report = data.get("report")
    scores = None
    overall = None
    findings = None
    detected_stack = None
    if report:
        detected_stack = report.get("detected_stack")
        raw_scores = report.get("scores") or {}
        scores = CodebaseScores.model_validate(raw_scores)
        overall = raw_scores.get("overall")
        findings = len((report.get("technical") or {}).get("issues") or [])
    return ModernizeProjectSummary(
        project_id=project_id,
        source=data.get("source", "zip"),  # type: ignore[arg-type]
        file_count=int(stats.get("analyzable_count", 0)),
        total_bytes=int(stats.get("total_bytes", 0)),
        languages=stats.get("languages", {}) or {},
        created_at=created_at,
        updated_at=updated_at,
        has_report=bool(report),
        detected_stack=detected_stack,
        overall_score=overall,
        findings_count=findings,
        scores=scores,
    )


@router.get("/modernize/projects/latest", response_model=ModernizeProjectSummary | None)
def modernize_latest_project(user: CurrentUser) -> ModernizeProjectSummary | None:
    """Most recent analysis for the current user so Auto-Fix can open it without
    re-uploading. Returns null when the user has no analyses yet."""
    row = _jobs_repo.latest_for_owner(user["user_id"])
    if row is None:
        return None
    return _project_summary(row["project_id"], row["data"], row["created_at"], row["updated_at"])


@router.get("/modernize/projects", response_model=list[ModernizeProjectSummary])
def modernize_list_projects(user: CurrentUser) -> list[ModernizeProjectSummary]:
    """Recent analyses for the current user (newest first) for the Auto-Fix picker."""
    rows = _jobs_repo.list_for_owner(user["user_id"])
    return [_project_summary(r["project_id"], r["data"], r["created_at"], r["updated_at"]) for r in rows]


@router.delete("/modernize/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def modernize_delete_project(project_id: str, user: CurrentUser) -> Response:
    """Delete a persisted analysis (shared by Modernize and Auto-Fix) and its
    ingest sandbox on disk."""
    if not _jobs_repo.delete_for_owner(project_id, user["user_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto de modernizacao nao encontrado.")
    service.remove(project_id)
    _audit(user["user_id"], "modernize_project_deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/modernize/{project_id}/analyze", response_model=ModernizationReportResponse)
def modernize_analyze(
    project_id: str,
    user: CurrentUser,
    use_user_key: bool = Query(False),
    user_model_choice: str | None = Query(None),
) -> ModernizationReportResponse:
    job = _job(project_id, user["user_id"])
    context = llm_provider_resolver.resolve(
        workspace_id=None, user_id=user["user_id"], requested_capability="codebase_analysis",
        requested_model=user_model_choice,
    )
    api_key = context.api_key if context.resolution.mode == "llm" else None
    _audit(user["user_id"], "codebase_analysis_started")
    try:
        _inventory, _diagnosis, report = analyze_project(
            project_id, service, source=job["source"], skipped=job["skipped"],
            api_key=api_key, user_model_choice=user_model_choice,
        )
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    plan = build_plan(report)
    _jobs_repo.update(
        project_id,
        user["user_id"],
        {
            "report": report.model_dump(mode="json"),
            "plan": plan.model_dump(mode="json"),
            "before_scores": report.scores.model_dump(mode="json"),
        },
    )
    _audit(user["user_id"], "codebase_analysis_completed")
    return ModernizationReportResponse(report=report, plan=plan)


@router.get("/modernize/{project_id}/report", response_model=ModernizationReportResponse)
def modernize_get_report(project_id: str, user: CurrentUser) -> ModernizationReportResponse:
    job = _job(project_id, user["user_id"])
    if not job.get("report"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Rode a análise primeiro.")
    return ModernizationReportResponse(
        report=CodebaseAnalysisReport.model_validate(job["report"]),
        plan=ModernizationPlan.model_validate(job["plan"]),
    )


@router.post("/modernize/{project_id}/approve-plan", response_model=FixApproval)
def modernize_approve_plan(project_id: str, payload: ApprovePlanRequest, user: CurrentUser) -> FixApproval:
    job = _job(project_id, user["user_id"])
    plan = job.get("plan")
    if not plan:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Análise/plano ausente. Rode a análise primeiro.")
    all_ids = [phase["id"] for phase in plan["phases"]]
    if payload.mode == "full":
        approved = all_ids
    elif payload.mode == "critical_only":
        approved = [pid for pid in all_ids if pid in ("critical", "security")]
    else:
        approved = [pid for pid in payload.phase_ids if pid in all_ids]
    _jobs_repo.update(project_id, user["user_id"], {"approved_phase_ids": approved})
    _audit(user["user_id"], "modernization_plan_approved")
    return FixApproval(project_id=project_id, approved_phase_ids=approved)


@router.post("/modernize/{project_id}/apply-fixes", response_model=RefactorResult)
def modernize_apply_fixes(project_id: str, user: CurrentUser) -> RefactorResult:
    _require_flag("modernize_auto_refactor")
    job = _job(project_id, user["user_id"])
    approved = job.get("approved_phase_ids")
    if not approved:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Aprove o plano antes de aplicar correções.")
    _audit(user["user_id"], "auto_refactor_started")
    try:
        write_result = _materialize(project_id, f"modernized-{project_id}")
    except (CodebaseIngestError, ProjectWriteError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    materialized = {"project_id": write_result.project_id, "generated_project_path": write_result.root_path}
    gate = quality_gate_engine.evaluate(materialized, run_build=False)
    approved_set = set(approved)
    filtered_issues = [i for i in gate.issues if i.auto_fixable and issue_phase(i.id) in approved_set]
    filtered_report = gate.model_copy(update={"issues": filtered_issues})
    result = auto_repair_engine.repair(materialized, filtered_report)

    refactor = RefactorResult(
        project_id=project_id,
        materialized_project_id=write_result.project_id,
        applied_count=result.applied_count,
        failed_count=result.failed_count,
        actions=[a.title for a in result.actions if a.status == "applied"],
        diff_summary=result.diff_summary,
    )
    _jobs_repo.update(
        project_id,
        user["user_id"],
        {"materialized_project_id": write_result.project_id, "refactor": refactor.model_dump(mode="json")},
    )
    _audit(user["user_id"], "auto_refactor_completed")
    return refactor


@router.post("/modernize/{project_id}/revalidate", response_model=RevalidationReport)
def modernize_revalidate(project_id: str, user: CurrentUser) -> RevalidationReport:
    job = _job(project_id, user["user_id"])
    materialized_id = job.get("materialized_project_id")
    if not materialized_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Aplique correções antes de revalidar.")
    _audit(user["user_id"], "revalidation_started")
    before = CodebaseScores.model_validate(job["before_scores"]) if job.get("before_scores") else CodebaseScores()
    after = score_root(DEFAULT_OUTPUT_ROOT / materialized_id, service)
    _jobs_repo.update(project_id, user["user_id"], {"after_scores": after.model_dump(mode="json")})
    deltas = {dim: getattr(after, dim) - getattr(before, dim) for dim in before.model_dump()}
    _audit(user["user_id"], "revalidation_completed")
    report = job.get("report")
    degraded = bool(report and report.get("degraded"))
    return RevalidationReport(project_id=project_id, before=before, after=after, deltas=deltas, degraded=degraded)


@router.get("/modernize/{project_id}/diff", response_model=CodeDiffSummary)
def modernize_diff(project_id: str, user: CurrentUser) -> CodeDiffSummary:
    job = _job(project_id, user["user_id"])
    refactor = job.get("refactor")
    if not refactor:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Aplique correções antes de ver o diff.")
    before = job.get("before_scores")
    after = job.get("after_scores")
    deltas: dict[str, int] = {}
    if before and after:
        deltas = {dim: after[dim] - before[dim] for dim in before}
    return CodeDiffSummary(
        project_id=project_id, changed_paths=list(refactor.get("diff_summary", [])), score_deltas=deltas
    )


def _register_job(result: IngestResult, user_id: str, audit_code: str) -> ModernizeProjectIngest:
    # _diagnose builds the full diagnosis bundle (inventory/diagnosis/plan/stats/
    # executive_summary) AND populates _INGESTS, so the ingest-keyed endpoints
    # (runtime-profile, ask, deep-analyze, generate) keep working with project_id.
    response = _diagnose(result)
    stats_dict = result.stats.as_dict()
    _jobs_repo.create(
        owner_user_id=user_id,
        project_id=result.ingest_id,
        data={
            "source": result.source,
            "skipped": result.skipped,
            "stats": stats_dict,
            "report": None,
            "plan": None,
            "before_scores": None,
            "approved_phase_ids": None,
            "materialized_project_id": None,
            "after_scores": None,
            "refactor": None,
        },
    )
    _audit(user_id, audit_code)
    return ModernizeProjectIngest(
        **response.model_dump(),
        project_id=result.ingest_id,
        source=result.source,  # type: ignore[arg-type]
        created_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
        file_count=response.inventory.file_count,
        total_bytes=response.inventory.total_bytes,
        skipped_count=response.inventory.skipped_count,
        languages=response.inventory.languages,
    )


def _materialized_modernize_project(project_id: str, user_id: str, *, action: str) -> dict:
    """Resolve the actual materialized generated project for a modernize job,
    enforcing ownership (diagnosis: the three routes below used to call
    _modernize_project(project_id) directly, which both skipped the ownership
    check every other {project_id} route in this file performs AND resolved the
    wrong directory — for a job, project_id is the ingest id, not the
    materialized project's own id).

    Two distinct callers pass a project_id here: the analyze->apply-fixes job
    pipeline (project_id = ingest/job id; the real project lives at
    job['materialized_project_id']), and the legacy one-shot /modernize/generate
    flow, which writes a project directly with no job entry at all (project_id
    IS already the materialized project's own id there). Try the job first;
    fall back to treating project_id as a materialized project id (same
    unowned-is-unrestricted rule as meta_factory's _owned_meta_project) so the
    legacy flow keeps working instead of 404ing on a project that exists."""
    job = _jobs_repo.get_for_owner(project_id, user_id)
    if job is not None:
        materialized_id = job.get("materialized_project_id")
        if not materialized_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Aplique correções antes de {action}.")
        return _modernize_project(materialized_id)
    project = _modernize_project(project_id)
    owner = ProjectWriter().read_owner(project_id)
    if owner is not None and owner != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto de modernização não encontrado.")
    return project


@router.post("/modernize/{project_id}/export/{provider}", response_model=GeneratedProjectExportResponse)
def export_modernized_project(
    project_id: str,
    provider: GitProvider,
    payload: GeneratedProjectExportRequest,
    user: CurrentUser,
) -> GeneratedProjectExportResponse:
    project = _materialized_modernize_project(project_id, user["user_id"], action="exportar")
    return _export_generated_project(user["user_id"], project, provider, payload)


@router.get("/modernize/{project_id}/endpoints", response_model=GeneratedEndpointsResponse)
def list_modernized_endpoints(project_id: str, user: CurrentUser) -> GeneratedEndpointsResponse:
    project = _materialized_modernize_project(project_id, user["user_id"], action="listar endpoints")
    return api_collection_service.list_endpoints(project)


@router.get("/modernize/{project_id}/api-collection", response_model=ApiCollectionResponse)
def get_modernized_api_collection(
    project_id: str,
    user: CurrentUser,
    format: str = Query("postman", pattern="^(postman|insomnia)$"),
) -> ApiCollectionResponse:
    project = _materialized_modernize_project(project_id, user["user_id"], action="gerar a coleção")
    return api_collection_service.collection(project, format)  # type: ignore[arg-type]


def _export_generated_project(
    user_id: str,
    project: dict,
    provider: GitProvider,
    payload: GeneratedProjectExportRequest,
) -> GeneratedProjectExportResponse:
    _require_flag("modernize_export")

    # Quality Gate: block export when critical problems remain, unless a conscious
    # force release (payload.force) or a persisted override is on the project.
    gate = quality_gate_engine.evaluate(project, run_build=False)
    if gate.blocker_count > 0 and not gate.release_override and not payload.force:
        _audit(user_id, "git_export_blocked")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Exportação bloqueada: {gate.blocker_count} problema(s) crítico(s). Corrija "
                "automaticamente, rode a validação novamente ou libere conscientemente."
            ),
        )

    status_info = git_provider_service.status(user_id, provider)
    if status_info.get("status") != "connected":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{provider} is not connected. Connect the provider in /settings#integrations before exporting.",
        )

    quality = _quality_engine.quality_check(project)
    blockers = [
        finding for finding in quality.get("security_findings", [])
        if finding.get("severity") in {"high", "critical"}
    ]
    if blockers:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Export blocked by high or critical generated-project security findings.",
        )

    files = _generated_project_service.export_files(project)
    repository = git_provider_service.create_repository(
        user_id,
        provider,
        namespace=payload.namespace,
        repo_name=payload.repo_name,
        visibility=payload.visibility,
        branch=payload.branch,
    )
    repository = git_provider_service.push_initial_commit(
        user_id,
        provider,
        namespace=payload.namespace,
        repo_name=payload.repo_name,
        branch=payload.branch,
        commit_message=payload.commit_message,
        files=files,
    )
    _audit(user_id, "modernized_project_exported")
    return GeneratedProjectExportResponse(
        provider=provider,
        namespace=payload.namespace,
        repo_name=payload.repo_name,
        branch=payload.branch,
        visibility=payload.visibility,
        status=repository.get("status", "ready"),
        repo_url=repository.get("repo_url"),
        file_count=len(files),
        message="Generated project exported successfully.",
    )
