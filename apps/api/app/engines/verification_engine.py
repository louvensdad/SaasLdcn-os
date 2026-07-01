from __future__ import annotations

import concurrent.futures as cf
import json
import time
from collections.abc import Iterator
from pathlib import PurePosixPath
from typing import Any, Callable

from app.engines.agent_executor import submit_agent
from app.engines.agent_prompts import AGENT_PROMPTS
from app.engines.factory_pipeline import HEARTBEAT_EVERY_S, _agent_request, _language_for
from app.engines.generation_validation_engine import generation_validation_engine
from app.engines.llm.router import LLMRouter
from app.schemas.orchestrator import ProjectSpec
from app.services.file_protocol import parse_agent_output
from app.services.generated_project_service import GeneratedProjectService
from app.services.project_writer import ProjectWriteError, ProjectWriter

# The "sala de teste": after generation, build the project for real (npm/pip/mvn via
# generation_validation_engine), and if it fails, hand the failures to a repair agent
# that rewrites the broken files, then re-validate — up to MAX_REPAIR_ROUNDS. The
# verdict is persisted on the project marker so download/export can gate on it.
MAX_REPAIR_ROUNDS = 2
_CONTEXT_CHAR_BUDGET = 48_000
_FILE_CHAR_CAP = 12_000
# Manifests / configs most likely to be the root cause of a failed build.
_MANIFEST_HINTS = (
    "package.json", "package-lock.json", "tsconfig.json", "tsconfig.app.json", "angular.json",
    "vite.config", "next.config", "requirements.txt", "pyproject.toml", "pom.xml",
    "build.gradle", "dockerfile", "docker-compose", ".env.example", "tailwind.config",
)


def _with_heartbeat(label: str, fn: Callable[[], Any], holder: dict) -> Iterator[dict]:
    """Run fn() on a worker thread, yielding heartbeat events while it blocks. Fills
    holder['value']/holder['error']. The build can take minutes, so this keeps the
    SSE stream alive (same pattern as factory_pipeline.iter_single_agent). Runs on
    the shared, bounded agent pool (audit B5) instead of a per-call executor."""
    future = submit_agent(fn)
    started = time.monotonic()
    while True:
        try:
            holder["value"] = future.result(timeout=HEARTBEAT_EVERY_S)
            holder["error"] = None
            return
        except cf.TimeoutError:
            yield {"type": "heartbeat", "role": label, "elapsed_ms": int((time.monotonic() - started) * 1000)}
        except Exception as exc:  # build/repair blew up — surface it, don't crash the stream
            holder["value"] = None
            holder["error"] = exc
            return


def _summarize_issues(report) -> list[str]:
    issues: list[str] = []
    build = report.build
    if not build.ok:
        issues.append(f"build falhou (install={build.installed}, build={build.built}).")
    quality = report.quality if isinstance(report.quality, dict) else {}
    for path in (quality.get("missing_files") or [])[:20]:
        issues.append(f"arquivo ausente: {path}")
    for check in quality.get("checks") or []:
        if isinstance(check, dict) and check.get("status") == "failed":
            issues.append(f"check falhou: {check.get('id')} — {check.get('failure_reason') or check.get('label')}")
    dep = report.dependency_audit
    if getattr(dep, "status", None) == "failed":
        for finding in getattr(dep, "findings", [])[:10]:
            issues.append(f"dependencia: {getattr(finding, 'message', finding)}")
    for finding in report.security_findings or []:
        if isinstance(finding, dict) and finding.get("severity") in {"high", "critical"}:
            issues.append(f"seguranca({finding.get('severity')}): {finding.get('message')} [{finding.get('path')}]")
    return issues


def _repair_context(spec: ProjectSpec, report, files_service: GeneratedProjectService, project: dict) -> str:
    listing = files_service.list_files(project)
    paths = [
        str(item["relative_path"])
        for item in listing.get("files", [])
        if item.get("relative_path") != ".ldcn-generation.json"
    ]
    issues = _summarize_issues(report)
    build_logs = (report.build.logs_tail or "")[-_FILE_CHAR_CAP:]

    # Pull contents of the files most likely implicated: manifests + paths named in findings.
    implicated: list[str] = []
    for finding in report.security_findings or []:
        if isinstance(finding, dict) and finding.get("path"):
            implicated.append(str(finding["path"]))
    wanted: list[str] = []
    for path in paths:
        low = PurePosixPath(path).name.lower()
        if path in implicated or any(hint in low for hint in _MANIFEST_HINTS):
            wanted.append(path)

    snippets: list[dict[str, str]] = []
    total = 0
    for path in wanted:
        if total >= _CONTEXT_CHAR_BUDGET:
            break
        try:
            data = files_service.read_file(project, path)
        except Exception:
            continue
        content = data.get("content")
        if not isinstance(content, str) or not content:
            continue
        text = content[: min(_FILE_CHAR_CAP, _CONTEXT_CHAR_BUDGET - total)]
        total += len(text)
        snippets.append({"path": path, "content": text})

    payload = {
        "intent": spec.product_summary,
        "suggested_stack": spec.suggested_stack.model_dump(),
        "validation_issues": issues,
        "build_logs_tail": build_logs,
        "project_tree": paths,
        "implicated_files": snippets,
    }
    return (
        "O projeto gerado FALHOU na verificacao. Corrija a raiz e reemita apenas os arquivos "
        "necessarios.\n\n" + json.dumps(payload, ensure_ascii=False, indent=2)
    )


def _run_repair(router: LLMRouter, context: str, user_model_choice: str | None, api_key: str | None):
    response = router.route(
        _agent_request(AGENT_PROMPTS["repair"], context, "repair"),
        user_choice=user_model_choice,
        agent_role="repair",
        api_key=api_key,
    )
    return parse_agent_output(response.text, agent_role="repair")


def iter_verification(
    project: dict,
    spec: ProjectSpec,
    *,
    router: LLMRouter | None = None,
    user_model_choice: str | None = None,
    api_key: str | None = None,
    max_rounds: int = MAX_REPAIR_ROUNDS,
) -> Iterator[dict]:
    """Build the project for real, auto-repair on failure, and persist the verdict.

    Event shapes: verify_started, heartbeat, validation_report, repair_started,
    file_emitted, repair_finished, verify_done (terminal), error.
    """
    router = router or LLMRouter()
    project_id = str(project["project_id"])
    files_service = GeneratedProjectService()
    yield {"type": "verify_started", "project_id": project_id}

    report = None
    for round_no in range(max_rounds + 1):
        holder: dict = {}
        yield from _with_heartbeat("verify", lambda: generation_validation_engine.validate(project), holder)
        if holder["error"] is not None:
            yield {"type": "error", "detail": f"verification failed: {holder['error']}"}
            report = None
            break
        report = holder["value"]
        yield {"type": "validation_report", "report": report.model_dump(mode="json")}
        if report.passed or round_no == max_rounds:
            break

        yield {"type": "repair_started", "round": round_no + 1, "issues": _summarize_issues(report)[:8]}
        context = _repair_context(spec, report, files_service, project)
        repair_holder: dict = {}
        yield from _with_heartbeat(
            "repair", lambda: _run_repair(router, context, user_model_choice, api_key), repair_holder
        )
        if repair_holder["error"] is not None:
            yield {"type": "repair_finished", "round": round_no + 1, "applied": 0, "detail": str(repair_holder["error"])}
            break
        parsed = repair_holder["value"]
        applied = 0
        if parsed.files:
            try:
                ProjectWriter().append(project_id, parsed.files, metadata={"repaired_round": round_no + 1})
            except ProjectWriteError as exc:
                yield {"type": "repair_finished", "round": round_no + 1, "applied": 0, "detail": str(exc)}
                break
            applied = len(parsed.files)
            for emitted in parsed.files:
                yield {"type": "file_emitted", "role": "repair", "path": emitted.path, "language": _language_for(emitted.path)}
        yield {"type": "repair_finished", "round": round_no + 1, "applied": applied}
        if applied == 0:  # nothing changed — re-validating would loop forever
            break

    passed = bool(report and report.passed)
    score = int(report.score) if report else 0
    try:
        ProjectWriter().set_verification(project_id, verified=passed, score=score)
    except ProjectWriteError:
        pass
    yield {
        "type": "verify_done",
        "passed": passed,
        "score": score,
        "report": report.model_dump(mode="json") if report else None,
    }
