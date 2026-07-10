from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.engines.generation_job_engine import StageFailure
from app.schemas.generation_validation import BuildValidationReport
from app.services.build_error_classifier import build_error_classifier
from app.services.build_validation_service import (
    MAX_AUTO_REPAIR_ATTEMPTS,
    MAX_ATTEMPTS_PER_PHASE,
    BuildValidationService,
    _MetricsCollector,
)
from app.services.dependency_registry import DependencyRegistry, dependency_registry


# ---------------------------------------------------------------- helpers ---

_NPM_404_LOG = """
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@radix-ui%2freact-badge - Not found
npm error 404  The requested resource '@radix-ui/react-badge@^1.0.4' could not be found or you do not have permission to access it.
"""

_NPM_404_GHOST_LOG = """
npm error code E404
npm error 404  The requested resource '@acme/ghost-package@^2.0.0' could not be found or you do not have permission to access it.
"""


def _npm_project(dependencies: dict[str, str], *, scripts: dict[str, str] | None = None, sources: dict[str, str] | None = None) -> Path:
    root = Path(tempfile.mkdtemp(prefix="ldcn-dep-registry-"))
    manifest = {"name": "generated-app", "version": "1.0.0", "dependencies": dependencies}
    if scripts:
        manifest["scripts"] = scripts
    (root / "package.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    for rel, content in (sources or {}).items():
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return root


def _completed(command: list[str], returncode: int, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(command, returncode, stdout, stderr)


_COMMON_POM = """<?xml version="1.0" encoding="UTF-8"?>
<project>
    <artifactId>common</artifactId>
    <packaging>jar</packaging>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>
</project>
"""


def _java_module(module: str = "common") -> tuple[Path, Path]:
    """A minimal multi-module-style Maven layout: <root>/<module>/pom.xml plus one
    .java source file, so the failed-module path-walk in
    _maven_failed_module_poms has a real pom.xml to find."""
    root = Path(tempfile.mkdtemp(prefix="ldcn-maven-"))
    module_dir = root / module / "src" / "main" / "java" / "com" / "x"
    module_dir.mkdir(parents=True, exist_ok=True)
    java_file = module_dir / "CommonConfig.java"
    java_file.write_text("package com.x;\n", encoding="utf-8")
    (root / module / "pom.xml").write_text(_COMMON_POM, encoding="utf-8")
    return root, java_file


_MAVEN_MISSING_DEP_LOG_TEMPLATE = """[ERROR] {java_file}:[4,54] package org.springframework.data.jpa.repository.config does not exist
[ERROR] {java_file}:[7,2] cannot find symbol
[ERROR]   symbol: class EnableJpaAuditing
[ERROR] {java_file}:[4,44] package org.springframework.amqp.rabbit.core does not exist
[ERROR] -> [Help 1]
[ERROR]   mvn <args> -rf :common
"""


class _ScriptedRuns:
    """Deterministic stand-in for BuildValidationService._run: returns the scripted
    results in order (repeating the last one), while still recording commands the
    way the real _run does."""

    def __init__(self, results: list[subprocess.CompletedProcess]):
        self.results = list(results)
        self.calls: list[list[str]] = []

    def __call__(self, command, root, collector=None, phase="build", sink=None, records=None, record_phase=None):
        result = self.results.pop(0) if len(self.results) > 1 else self.results[0]
        self.calls.append(list(command))
        if records is not None:
            records.append({
                "phase": record_phase or phase, "command": subprocess.list2cmdline(command),
                "cwd": str(root), "exit_code": result.returncode, "duration_ms": 1,
                "stdout_tail": result.stdout, "stderr_tail": result.stderr,
            })
        return result


def _engineering_approved_room(client: TestClient, *, approve_stack: bool = False) -> str:
    room = client.post("/api/project-rooms", json={"title": "Loja", "raw_intent": "quero uma loja online completa"}).json()
    room_id = room["room_id"]
    assert client.post(f"/api/project-rooms/{room_id}/generate-prompt").status_code == 200
    assert client.post(f"/api/project-rooms/{room_id}/approve").status_code == 200
    assert client.post(f"/api/project-rooms/{room_id}/blueprint").status_code == 200
    assert client.post(f"/api/project-rooms/{room_id}/engineering-review").status_code == 200
    assert client.post(
        f"/api/project-rooms/{room_id}/acknowledge-preview",
        json={"confirmation": "CONTINUAR COM PREVIEW"},
    ).status_code == 200
    assert client.post(f"/api/project-rooms/{room_id}/approve").status_code == 200
    if approve_stack:
        assert client.post(f"/api/project-rooms/{room_id}/stack/approve", json={}).status_code == 200
    return room_id


def _spec_payload() -> dict:
    return {
        "raw_intent": "loja online",
        "product_summary": "Loja",
        "entities": ["Product"],
        "business_rules": ["Apenas admin publica produto"],
        "core_workflows": ["Comprar produto"],
        "suggested_stack": {"language": "typescript", "framework": "NestJS"},
    }


# ------------------------------------- 1. invented dependency is rejected ---

def test_package_json_with_radix_badge_is_rejected():
    registry = DependencyRegistry()
    findings = registry.validate_manifest_data(
        {"dependencies": {"@radix-ui/react-badge": "^1.0.4", "react": "^18.2.0"}},
        "package.json",
    )
    assert [f.package for f in findings] == ["@radix-ui/react-badge"]
    assert findings[0].status == "blocked"
    assert dependency_registry.is_forbidden("@radix-ui/react-badge")
    # Real Radix primitives stay valid.
    assert not dependency_registry.is_forbidden("@radix-ui/react-dialog")
    assert registry.validate_manifest_data({"dependencies": {"@radix-ui/react-dialog": "^1.0.0"}}, "p") == []


# --------------------------------------- 2. auto-repair removes the badge ---

def test_auto_repair_removes_radix_badge_and_writes_validation_report():
    root = _npm_project({"@radix-ui/react-badge": "^1.0.4", "react": "^18.2.0"})
    try:
        result = dependency_registry.validate_and_fix(root)
        data = json.loads((root / "package.json").read_text(encoding="utf-8"))
        assert "@radix-ui/react-badge" not in data["dependencies"]
        assert data["dependencies"]["react"] == "^18.2.0"
        assert result.status == "fixed"
        report = json.loads((root / "dependency.validation.json").read_text(encoding="utf-8"))
        assert report["status"] == "fixed"
        assert report["findings"][0]["package"] == "@radix-ui/react-badge"
        assert report["findings"][0]["patch"]
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ------------------------------------------- 3. local Badge is generated ---

def test_local_badge_component_is_created_and_imports_rewritten():
    root = _npm_project(
        {"@radix-ui/react-badge": "^1.0.4"},
        sources={"app/page.tsx": 'import { Badge } from "@radix-ui/react-badge";\nexport default function P(){return <Badge>ok</Badge>;}\n'},
    )
    try:
        result = dependency_registry.validate_and_fix(root)
        badge = root / "components" / "ui" / "badge.tsx"
        assert badge.is_file()
        assert "HTMLAttributes" in badge.read_text(encoding="utf-8")
        page = (root / "app" / "page.tsx").read_text(encoding="utf-8")
        assert "@radix-ui/react-badge" not in page
        assert '@/components/ui/badge' in page
        finding = result.findings[0]
        assert "components/ui/badge.tsx" in finding.files_written
        assert "app/page.tsx" in finding.files_rewritten
    finally:
        shutil.rmtree(root, ignore_errors=True)


# --------------------------------- 4. npm install re-runs after a repair ---

def test_npm_install_is_rerun_after_e404_repair(monkeypatch):
    root = _npm_project({"@acme/ghost-package": "^2.0.0", "react": "^18.2.0"})
    try:
        svc = BuildValidationService()
        runs = _ScriptedRuns([
            _completed(["npm", "install"], 1, stderr=_NPM_404_GHOST_LOG),
            _completed(["npm", "install"], 0, stdout="added 2 packages"),
        ])
        monkeypatch.setattr(svc, "_run", runs)
        monkeypatch.setattr(shutil, "which", lambda name: "C:/fake/npm.cmd")
        report = svc._node(root, _MetricsCollector())
        # Preflight dry-run fails with E404, the repair applies, the dry-run is
        # re-executed, and only then the real install runs.
        assert runs.calls == [
            ["npm", "install", "--dry-run"],
            ["npm", "install", "--dry-run"],
            ["npm", "install"],
        ]
        assert report.installed == "passed"
        assert len(report.repairs) == 1
        assert report.repairs[0].error.code == "npm_package_not_found"
        assert report.repairs[0].applied is True
        assert report.repairs[0].phase == "preflight"
        data = json.loads((root / "package.json").read_text(encoding="utf-8"))
        assert "@acme/ghost-package" not in data["dependencies"]
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ------------------------------------- 5. build only passes after repair ---

def test_build_passes_only_after_repair(monkeypatch):
    root = _npm_project({"@acme/ghost-package": "^2.0.0"}, scripts={"build": "next build"})
    try:
        svc = BuildValidationService()
        runs = _ScriptedRuns([
            _completed(["npm", "install", "--dry-run"], 1, stderr=_NPM_404_GHOST_LOG),
            _completed(["npm", "install", "--dry-run"], 0),
            _completed(["npm", "install"], 0),
            _completed(["npm", "run", "build"], 0, stdout="compiled"),
        ])
        monkeypatch.setattr(svc, "_run", runs)
        monkeypatch.setattr(shutil, "which", lambda name: "C:/fake/npm.cmd")
        report = svc._node(root, _MetricsCollector())
        assert report.installed == "passed"
        assert report.built == "passed"
        assert report.ok is True
        assert report.classified_error is None
        assert [c.phase for c in report.commands] == ["preflight", "preflight", "install", "build"]
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ------------------- 6. Meta-Factory blocks generation without approval ---

def test_meta_factory_blocks_generation_without_stack_approval(client: TestClient):
    room_id = _engineering_approved_room(client, approve_stack=False)
    response = client.post("/api/meta-factory/jobs", json={
        "projectId": room_id, "projectName": "Loja",
        "spec": _spec_payload(), "blueprint": {"decisions": []},
        "blueprintVersion": 1, "mode": "deterministic",
    })
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "STACK_APPROVAL_REQUIRED"


# ----------------------- 7. user can alter the stack before generation ---

def test_user_can_alter_stack_before_generation(client: TestClient):
    room_id = _engineering_approved_room(client)
    response = client.post(f"/api/project-rooms/{room_id}/stack/approve", json={
        "selected_backend": "FastAPI",
        "selected_frontend": "Next.js 15",
        "selected_language": "python",
    })
    assert response.status_code == 200, response.text
    room = response.json()
    approval = room["architecture_blueprint"]["stack_approval"]
    assert approval["status"] == "APPROVED"
    assert approval["selected_backend"] == "FastAPI"
    assert approval["selected_frontend"] == "Next.js 15"
    # Deterministic enforcement into the spec: generation reads these fields.
    assert room["spec"]["suggested_stack"]["language"] == "python"
    assert room["spec"]["suggested_stack"]["framework"] == "FastAPI"
    assert room["stack_proposal"]["status"] == "APPROVED"


# ----------------------------------- 8. approved stack is persisted ------

def test_approved_stack_is_persisted(client: TestClient):
    room_id = _engineering_approved_room(client, approve_stack=True)
    room = client.get(f"/api/project-rooms/{room_id}").json()
    approval = room["architecture_blueprint"]["stack_approval"]
    assert approval["status"] == "APPROVED"
    assert approval["approved_by"]
    assert approval["approved_at"]
    assert "stack_approval" in {c["id"] for c in room["readiness_checklist"]}
    check = next(c for c in room["readiness_checklist"] if c["id"] == "stack_approval")
    assert check["status"] == "passed"


# --------------------------- 9. generation uses the approved stack -------

def test_generation_uses_approved_stack(client: TestClient, monkeypatch):
    import tempfile as _tempfile

    from app.core.config import get_settings
    from app.repositories.generation_job_repository import GenerationJobRepository
    from app.engines.generation_job_engine import GenerationJobEngine
    from app.routes import meta_factory as route

    room_id = _engineering_approved_room(client)
    assert client.post(f"/api/project-rooms/{room_id}/stack/approve", json={
        "selected_language": "go", "selected_backend": "Gin",
    }).status_code == 200

    checkpoints = Path(_tempfile.mkdtemp(prefix="ldcn-stack-job-"))
    engine = GenerationJobEngine(GenerationJobRepository(get_settings().sqlite_path), checkpoints)
    monkeypatch.setattr(route, "generation_job_engine", engine)
    monkeypatch.setattr(engine, "start", lambda *args, **kwargs: None)
    try:
        response = client.post("/api/meta-factory/jobs", json={
            "projectId": room_id, "projectName": "Loja",
            "spec": _spec_payload(),  # the client still says typescript/NestJS
            "blueprint": {"decisions": []}, "blueprintVersion": 1, "mode": "deterministic",
        })
        assert response.status_code == 202, response.text
        user_id = client.get("/api/auth/me").json()["user_id"]
        spec_data, blueprint = engine.repository.inputs(response.json()["id"], user_id)
        # The APPROVED stack won — not the spec the client sent.
        assert spec_data["suggested_stack"]["language"] == "go"
        assert spec_data["suggested_stack"]["framework"] == "Gin"
        assert blueprint["stack_approval"]["selected_language"] == "go"
    finally:
        shutil.rmtree(checkpoints, ignore_errors=True)


# ----------------- 10. build report records root cause and patch ---------

def test_build_report_records_root_cause_and_patch(monkeypatch):
    root = _npm_project({"@acme/ghost-package": "^2.0.0"})
    try:
        svc = BuildValidationService()
        runs = _ScriptedRuns([
            _completed(["npm", "install", "--dry-run"], 1, stderr=_NPM_404_GHOST_LOG),
            _completed(["npm", "install"], 0),
        ])
        monkeypatch.setattr(svc, "_run", runs)
        monkeypatch.setattr(shutil, "which", lambda name: "C:/fake/npm.cmd")
        report = svc._node(root, _MetricsCollector())
        payload = report.model_dump(mode="json")
        repair = payload["repairs"][0]
        assert repair["error"]["root_cause"]
        assert repair["patch"]
        assert repair["error"]["code"] == "npm_package_not_found"
        command = payload["commands"][0]
        assert command["command"].startswith("npm")
        assert command["phase"] == "preflight"
        assert command["cwd"] == str(root)
        assert command["exit_code"] == 1
        assert payload["dependency_validation"] is not None
    finally:
        shutil.rmtree(root, ignore_errors=True)


# -------------------- 11. a broken project can never become READY --------

def test_broken_project_never_becomes_ready(monkeypatch):
    import app.engines.generation_job_engine as job_module

    engine = job_module.GenerationJobEngine.__new__(job_module.GenerationJobEngine)
    job = {"id": "genjob_x", "valid": False, "generatedProjectId": None, "artifacts": [], "logs": [], "checkpoints": [], "provider": None, "model": None, "startedAt": None, "currentStage": "PACKAGE_CREATING"}
    with pytest.raises(StageFailure):
        engine._package(job, "user-1")


def test_failed_build_report_marks_generation_not_passed():
    from app.engines.generation_validation_engine import GenerationValidationEngine

    engine = GenerationValidationEngine()
    failing_build = BuildValidationReport(installed="failed", built="skipped", ok=False)
    engine.quality_engine = SimpleNamespace(quality_check=lambda project: {"score": 90, "passed": True, "warnings": [], "security_findings": []})
    engine.files_service = SimpleNamespace(export_files=lambda project: [])
    import app.engines.generation_validation_engine as validation_module

    original_build = validation_module.build_validation_service.validate
    original_audit = validation_module.dependency_research_service.audit_manifest
    validation_module.build_validation_service.validate = lambda project, event_sink=None: failing_build
    from app.schemas.generation_validation import DependencyAuditReport

    validation_module.dependency_research_service.audit_manifest = lambda files: DependencyAuditReport(status="skipped")
    try:
        report = engine.validate({"project_id": "p1"})
    finally:
        validation_module.build_validation_service.validate = original_build
        validation_module.dependency_research_service.audit_manifest = original_audit
    assert report.passed is False  # install/build failed -> never READY


# ------------- 12. the repair loop repeats until pass or the limit -------

def test_repair_loop_stops_at_limit_and_reports_classified_error(monkeypatch):
    root = _npm_project({"@acme/ghost-package": "^2.0.0"})
    try:
        svc = BuildValidationService()
        # npm never recovers: every install fails with the same E404.
        runs = _ScriptedRuns([_completed(["npm", "install", "--dry-run"], 1, stderr=_NPM_404_GHOST_LOG)])
        monkeypatch.setattr(svc, "_run", runs)
        monkeypatch.setattr(shutil, "which", lambda name: "C:/fake/npm.cmd")
        report = svc._node(root, _MetricsCollector())
        assert report.installed == "failed"
        assert report.ok is False
        assert report.classified_error is not None
        assert report.classified_error.code == "npm_package_not_found"
        # Bounded: never more command executions than the per-phase ceiling.
        assert len(runs.calls) <= MAX_ATTEMPTS_PER_PHASE
        assert len(runs.calls) >= 2  # it DID retry after the first repair
        # Build Guard: the predictable failure was contained in the preflight
        # simulation — the REAL npm install never executed.
        assert all("--dry-run" in call for call in runs.calls)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_build_fails_three_times_then_skips_with_manual_guide(monkeypatch):
    root = _npm_project({}, scripts={"build": "next build"})
    failure = _completed(
        ["npm", "run", "build"], 1,
        stderr="Cannot find module 'problem-package'",
    )
    try:
        svc = BuildValidationService()
        runs = _ScriptedRuns([
            _completed(["npm", "install", "--dry-run"], 0),
            _completed(["npm", "install"], 0),
            failure, failure, failure,
        ])
        monkeypatch.setattr(svc, "_run", runs)
        monkeypatch.setattr(shutil, "which", lambda _name: "C:/fake/npm.cmd")
        monkeypatch.setattr(
            svc, "_repair_build_error",
            lambda *args, **kwargs: (f"patch-{len(runs.calls)}", True, "patched package.json"),
        )

        report = svc._node(root, _MetricsCollector())

        build_calls = [call for call in runs.calls if call == ["npm", "run", "build"]]
        assert len(build_calls) == MAX_ATTEMPTS_PER_PHASE == 3
        assert len(report.repairs) == MAX_AUTO_REPAIR_ATTEMPTS == 2
        assert [repair.strategy for repair in report.repairs] == ["standard", "simplified"]
        assert report.built == "skipped_after_failure"
        assert report.recovery_status == "SKIPPED_AFTER_FAILURE"
        assert report.ok is False
        assert report.manual_fix_guide is not None
        assert report.manual_fix_guide.root_cause
        assert "problem-package" in report.manual_fix_guide.problematic_dependencies
        assert "npm run build" in report.manual_fix_guide.commands
        assert "Cannot find module" in report.manual_fix_guide.full_logs
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ------------------------------------------------ classifier edge cases ---

def test_classifier_covers_initial_error_catalog():
    cases = {
        "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@x%2fy": "npm_package_not_found",
        "npm error code ETARGET\nnpm error notarget No matching version found for react@99.0.0": "npm_version_not_found",
        "npm error code ERESOLVE\nnpm error ERESOLVE unable to resolve dependency tree": "npm_peer_dependency_conflict",
        "src/app.ts(3,7): error TS2322: Type 'string' is not assignable": "typescript_compile_error",
        "Error: Cannot find module 'left-pad'": "module_not_found",
        "Error: Cannot find module './lib/missing-local'": "missing_import",
        "npm error Missing script: \"build\"": "missing_script",
        "npm error code EBADENGINE\nnpm error Unsupported engine": "unsupported_node_version",
        "Error: ENOENT: no such file or directory, open 'C:/proj/tsconfig.json'": "missing_file",
        "'vite' is not recognized as an internal or external command": "build_command_missing",
    }
    for logs, expected in cases.items():
        classified = build_error_classifier.classify(logs)
        assert classified is not None, logs
        assert classified.code == expected, f"{logs} -> {classified.code} != {expected}"
    assert build_error_classifier.classify("npm error code ECONNRESET") is None


# --------------------------------------------- 13. Maven auto-repair loop ---

def test_maven_build_repairs_missing_dependency_and_retries(monkeypatch):
    root, java_file = _java_module()
    try:
        svc = BuildValidationService()
        log = _MAVEN_MISSING_DEP_LOG_TEMPLATE.format(java_file=java_file.as_posix())
        runs = _ScriptedRuns([
            _completed(["mvn", "-q", "-DskipTests", "compile"], 1, stdout=log),
            _completed(["mvn", "-q", "-DskipTests", "compile"], 0, stdout="BUILD SUCCESS"),
        ])
        monkeypatch.setattr(svc, "_run", runs)
        monkeypatch.setattr(shutil, "which", lambda name: "C:/fake/mvn.cmd")
        report = svc._maven(root, _MetricsCollector())

        assert runs.calls == [["mvn", "-q", "-DskipTests", "compile"]] * 2
        assert report.installed == "passed"
        assert report.built == "passed"
        assert report.ok is True
        assert len(report.repairs) == 1
        assert report.repairs[0].error.code == "maven_dependency_not_found"
        assert report.repairs[0].applied is True

        pom_text = (root / "common" / "pom.xml").read_text(encoding="utf-8")
        assert "spring-boot-starter-data-jpa" in pom_text
        assert "spring-boot-starter-amqp" in pom_text
        # Spring Boot starters are managed by spring-boot-starter-parent's BOM:
        # no explicit <version> should be injected for them.
        assert "<artifactId>spring-boot-starter-data-jpa</artifactId>\n    </dependency>" in pom_text \
            or "<artifactId>spring-boot-starter-data-jpa</artifactId>\n        </dependency>" in pom_text
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_maven_build_resolves_third_party_dependency_via_registry(monkeypatch):
    root, java_file = _java_module()
    try:
        svc = BuildValidationService()
        log = (
            f"[ERROR] {java_file.as_posix()}:[3,1] package io.jsonwebtoken does not exist\n"
            "[ERROR] -> [Help 1]\n"
        )
        runs = _ScriptedRuns([
            _completed(["mvn", "-q", "-DskipTests", "compile"], 1, stdout=log),
            _completed(["mvn", "-q", "-DskipTests", "compile"], 0, stdout="BUILD SUCCESS"),
        ])
        monkeypatch.setattr(svc, "_run", runs)
        monkeypatch.setattr(shutil, "which", lambda name: "C:/fake/mvn.cmd")
        # No live Maven Central call in the unit test: pin a fake resolved version.
        monkeypatch.setattr(svc, "_maven_registry_latest", lambda group, artifact: "0.12.6")
        report = svc._maven(root, _MetricsCollector())

        assert report.built == "passed"
        pom_text = (root / "common" / "pom.xml").read_text(encoding="utf-8")
        assert "<artifactId>jjwt-api</artifactId>" in pom_text
        assert "<version>0.12.6</version>" in pom_text
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_maven_build_exhausts_repair_and_produces_maven_manual_guide(monkeypatch):
    root, java_file = _java_module()
    try:
        svc = BuildValidationService()
        log = f"[ERROR] {java_file.as_posix()}:[3,1] package com.totally.unknown.thing does not exist\n"
        runs = _ScriptedRuns([_completed(["mvn", "-q", "-DskipTests", "compile"], 1, stdout=log)])
        monkeypatch.setattr(svc, "_run", runs)
        monkeypatch.setattr(shutil, "which", lambda name: "C:/fake/mvn.cmd")
        report = svc._maven(root, _MetricsCollector())

        assert report.built == "skipped_after_failure"
        assert report.ok is False
        assert report.classified_error is not None
        assert report.classified_error.code == "maven_dependency_not_found"
        assert report.manual_fix_guide is not None
        # A Maven failure must never hand the user npm commands to run.
        assert report.manual_fix_guide.commands == ["mvn -q -DskipTests compile"]
        assert any(f.endswith("pom.xml") for f in report.manual_fix_guide.affected_files)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_resolve_java_import_maps_known_packages_to_maven_coordinates():
    from app.services.build_error_classifier import resolve_java_import

    assert resolve_java_import("jakarta.persistence") == ("org.springframework.boot", "spring-boot-starter-data-jpa", False)
    assert resolve_java_import("org.springframework.data.jpa.repository.config") == (
        "org.springframework.boot", "spring-boot-starter-data-jpa", False,
    )
    assert resolve_java_import("io.jsonwebtoken") == ("io.jsonwebtoken", "jjwt-api", True)
    assert resolve_java_import("io.swagger.v3.oas.models") == (
        "org.springdoc", "springdoc-openapi-starter-webmvc-ui", True,
    )
    assert resolve_java_import("io.github.bucket4j") == ("com.bucket4j", "bucket4j-core", True)
    assert resolve_java_import("com.totally.unknown.thing") is None


def test_classifier_recognizes_maven_missing_dependency_and_java_compile_error():
    log = (
        "[ERROR] C:/proj/common/src/main/java/com/x/CommonConfig.java:[4,54] "
        "package org.springframework.data.jpa.repository.config does not exist\n"
        "[ERROR] C:/proj/common/src/main/java/com/x/CommonConfig.java:[7,2] cannot find symbol\n"
        "[ERROR]   symbol: class EnableJpaAuditing\n"
    )
    classified = build_error_classifier.classify(log)
    assert classified is not None
    assert classified.code == "maven_dependency_not_found"
    assert classified.auto_fixable is True
    assert "org.springframework.data.jpa.repository.config" in classified.package

    # A pure "cannot find symbol" failure (no missing-package line, e.g. a typo in
    # code rather than an absent dependency) has no safe deterministic fix.
    symbol_only = "[ERROR] X.java:[1,1] cannot find symbol\n[ERROR]   symbol: class Foo\n"
    classified2 = build_error_classifier.classify(symbol_only)
    assert classified2 is not None
    assert classified2.code == "java_compile_error"
    assert classified2.auto_fixable is False


def test_classifier_extracts_the_real_package_from_webpack_s_cant_resolve_message():
    # Webpack/Next's own message contains an apostrophe INSIDE "Can't" before the
    # real package name's quotes; a naive lazy quote-to-quote match stops at that
    # apostrophe and captures garbage (e.g. "t resolve ") instead of the package,
    # which then gets fed straight into the auto-repair loop as a bogus install
    # target that can never succeed.
    logs = (
        "Module not found: Can't resolve 'next-themes'\n\n"
        "https://nextjs.org/docs/messages/module-not-found"
    )
    classified = build_error_classifier.classify(logs)
    assert classified is not None
    assert classified.code == "module_not_found"
    assert classified.package == "next-themes"
    assert classified.auto_fixable is True
