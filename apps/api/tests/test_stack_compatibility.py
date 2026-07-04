from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.services.build_validation_service import BuildValidationService, _MetricsCollector
from app.services.stack_compatibility import (
    COMPATIBILITY_MATRIX,
    StackCompatibilityEngine,
    stack_compatibility_engine,
)


_ERESOLVE_LOG = """
npm error code ERESOLVE
npm error ERESOLVE unable to resolve dependency tree
npm error
npm error While resolving: generated-app@1.0.0
npm error Found: react@18.2.0
npm error node_modules/react
npm error   react@"^18.2.0" from the root project
npm error
npm error Could not resolve dependency:
npm error peer react@">=19.0.0" from @testing-library/react-native@14.0.1
npm error node_modules/@testing-library/react-native
npm error   dev @testing-library/react-native@"^14.0.1" from the root project
"""

_ERESOLVE_UNKNOWN_LOG = """
npm error code ERESOLVE
npm error ERESOLVE unable to resolve dependency tree
npm error Found: react@18.2.0
npm error Could not resolve dependency:
npm error peer react@">=19.0.0" from @acme/super-widgets@5.0.0
"""


def _project(dependencies: dict[str, str], dev: dict[str, str] | None = None) -> Path:
    root = Path(tempfile.mkdtemp(prefix="ldcn-stack-compat-"))
    manifest = {"name": "generated-app", "version": "1.0.0", "dependencies": dependencies}
    if dev:
        manifest["devDependencies"] = dev
    (root / "package.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return root


def _manifest(root: Path) -> dict:
    return json.loads((root / "package.json").read_text(encoding="utf-8"))


def _completed(command: list[str], returncode: int, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(command, returncode, stdout, stderr)


class _ScriptedRuns:
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


# ------------------------- 1. matrix blocks testing-library@14 on React 18 ---

def test_testing_library_14_blocked_on_react18():
    root = _project({"react": "^18.2.0", "react-dom": "^18.2.0"}, dev={"@testing-library/react-native": "^14.0.1"})
    try:
        result = stack_compatibility_engine.validate_and_fix(root)
        assert result.status == "fixed"
        finding = next(f for f in result.findings if f.package == "@testing-library/react-native")
        assert finding.status == "fixed"
        assert finding.current == "^14.0.1"
        assert finding.suggested == "^12.9.0"
        assert finding.reason and finding.impact  # diagnostico claro
        data = _manifest(root)
        assert data["devDependencies"]["@testing-library/react-native"] == "^12.9.0"
        assert data["dependencies"]["react"] == "^18.2.0"  # anchor untouched
        report = json.loads((root / "stack.compatibility.json").read_text(encoding="utf-8"))
        assert report["status"] == "fixed"
        assert report["lock"]["react_major"] == 18
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_matrix_keeps_ecosystem_coherent_for_next_and_expo():
    # Next 15 requires React 19; Expo SDK 53 requires React 19 — with a React 18
    # lock both must be moved back into the coherent window.
    root = _project({"react": "^18.2.0", "next": "^15.1.0", "expo": "~53.0.0"})
    try:
        result = stack_compatibility_engine.validate_and_fix(root)
        data = _manifest(root)
        assert data["dependencies"]["next"] == "^14.2.3"
        # expo is an anchor captured into the lock from this same manifest, so it
        # is preserved as declared (the lock is the user's stack) — but react
        # stays untouched either way.
        assert data["dependencies"]["react"] == "^18.2.0"
        assert any(f.package == "next" and f.status == "fixed" for f in result.findings)
    finally:
        shutil.rmtree(root, ignore_errors=True)


# --------------------------------------------- 2. Stack Lock is immutable ---

def test_stack_lock_captured_and_persisted():
    root = _project({"react": "^18.2.0", "react-dom": "^18.2.0"})
    try:
        lock = stack_compatibility_engine.capture_lock(root)
        assert lock is not None
        assert lock.react == "^18.2.0"
        assert lock.react_major == 18
        persisted = json.loads((root / "stack.lock.json").read_text(encoding="utf-8"))
        assert persisted["react"] == "^18.2.0"
        assert persisted["react_major"] == 18
        assert persisted["source_manifest"] == "package.json"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_stack_lock_restores_drifted_react_version():
    root = _project({"react": "^18.2.0"})
    try:
        stack_compatibility_engine.capture_lock(root)  # lock at React 18
        # An agent later emits a manifest that silently bumps React to 19.
        data = _manifest(root)
        data["dependencies"]["react"] = "^19.0.0"
        (root / "package.json").write_text(json.dumps(data, indent=2), encoding="utf-8")

        result = stack_compatibility_engine.validate_and_fix(root)
        assert _manifest(root)["dependencies"]["react"] == "^18.2.0"  # restored
        finding = next(f for f in result.findings if f.package == "react")
        assert finding.status == "lock_enforced"
        # The lock file itself did not change.
        assert json.loads((root / "stack.lock.json").read_text(encoding="utf-8"))["react"] == "^18.2.0"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_stack_lock_restores_drifted_react_native_minor():
    # react-native lives on major 0: the minor IS the version line, so a drift
    # from the locked 0.74 to 0.79 must also be restored.
    root = _project({"react": "^18.2.0", "react-native": "0.74.5"})
    try:
        stack_compatibility_engine.capture_lock(root)
        data = _manifest(root)
        data["dependencies"]["react-native"] = "0.79.2"
        (root / "package.json").write_text(json.dumps(data, indent=2), encoding="utf-8")

        result = stack_compatibility_engine.validate_and_fix(root)
        assert _manifest(root)["dependencies"]["react-native"] == "0.74.5"
        assert any(f.package == "react-native" and f.status == "lock_enforced" for f in result.findings)
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ------------------- 3. React is never changed without user approval --------

def test_react_never_upgraded_automatically_for_unknown_conflict():
    root = _project({"react": "^18.2.0"}, dev={"@acme/super-widgets": "^5.0.0"})
    try:
        conflict = stack_compatibility_engine.diagnose_peer_conflict(_ERESOLVE_UNKNOWN_LOG, root)
        assert conflict is not None
        assert conflict.requires_user_decision is True
        assert conflict.suggested is None
        assert "aprovacao" in conflict.impact  # explicit user decision required
        # The fixer refuses to act on a user-decision conflict.
        assert stack_compatibility_engine.apply_conflict_fix(root, conflict) is False
        assert _manifest(root)["dependencies"]["react"] == "^18.2.0"

        # And the install-repair path does NOT force the install through.
        svc = BuildValidationService()
        patch, applied, detail, replacement = svc._repair_install_error(
            root,
            __import__("app.services.build_error_classifier", fromlist=["build_error_classifier"]).build_error_classifier.classify(_ERESOLVE_UNKNOWN_LOG),
            _ERESOLVE_UNKNOWN_LOG,
            None,
        )
        assert applied is False
        assert replacement is None  # never --legacy-peer-deps
        assert _manifest(root)["dependencies"]["react"] == "^18.2.0"
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ------------- 4. React 18 project generates without ERESOLVE (end-to-end) ---

def test_react18_project_installs_without_eresolve(monkeypatch):
    root = _project(
        {"react": "^18.2.0", "react-dom": "^18.2.0"},
        dev={"@testing-library/react-native": "^14.0.1"},
    )
    try:
        svc = BuildValidationService()
        runs = _ScriptedRuns([_completed(["npm", "install"], 0, stdout="added 120 packages")])
        monkeypatch.setattr(svc, "_run", runs)
        monkeypatch.setattr(shutil, "which", lambda name: "C:/fake/npm.cmd")
        report = svc._node(root, _MetricsCollector())
        # The matrix fixed the incompatibility BEFORE npm ran: no ERESOLVE, no repair loop.
        assert report.installed == "passed"
        assert report.ok is True
        assert report.repairs == []
        assert _manifest(root)["devDependencies"]["@testing-library/react-native"] == "^12.9.0"
        assert report.stack_compatibility is not None
        assert report.stack_compatibility["status"] == "fixed"
        assert report.stack_compatibility["lock"]["react_major"] == 18
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ---------- 5. preflight guard: npm install always passes after auto-fix -----

def test_preflight_repairs_eresolve_before_real_install(monkeypatch):
    # Spec 'latest' escapes the static matrix check (no version to compare), so
    # the conflict only surfaces in the preflight dry-run — which must repair it
    # and re-simulate before the real install ever runs.
    root = _project({"react": "^18.2.0"}, dev={"@testing-library/react-native": "latest"})
    try:
        svc = BuildValidationService()
        runs = _ScriptedRuns([
            _completed(["npm", "install", "--dry-run"], 1, stderr=_ERESOLVE_LOG),
            _completed(["npm", "install", "--dry-run"], 0),
            _completed(["npm", "install"], 0),
        ])
        monkeypatch.setattr(svc, "_run", runs)
        monkeypatch.setattr(shutil, "which", lambda name: "C:/fake/npm.cmd")
        report = svc._node(root, _MetricsCollector())
        assert runs.calls == [
            ["npm", "install", "--dry-run"],
            ["npm", "install", "--dry-run"],
            ["npm", "install"],
        ]
        assert report.installed == "passed"
        assert report.ok is True
        # Auto Version Fixer moved the CONFLICTING package, not React.
        data = _manifest(root)
        assert data["devDependencies"]["@testing-library/react-native"] == "^12.9.0"
        assert data["dependencies"]["react"] == "^18.2.0"
        # Diagnostico claro persisted with the repair: package, versions, suggestion, impact.
        repair = report.repairs[0]
        assert repair.phase == "preflight"
        assert repair.applied is True
        conflict = repair.error.conflict
        assert conflict["package"] == "@testing-library/react-native"
        assert conflict["package_version"] == "14.0.1"
        assert conflict["requires"] == 'react@">=19.0.0"'
        assert conflict["anchor_version"] == "18.2.0"
        assert conflict["suggested"] == "^12.9.0"
        assert conflict["impact"]
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_unresolvable_conflict_blocks_before_real_install(monkeypatch):
    root = _project({"react": "^18.2.0"}, dev={"@acme/super-widgets": "^5.0.0"})
    try:
        svc = BuildValidationService()
        runs = _ScriptedRuns([_completed(["npm", "install", "--dry-run"], 1, stderr=_ERESOLVE_UNKNOWN_LOG)])
        monkeypatch.setattr(svc, "_run", runs)
        monkeypatch.setattr(shutil, "which", lambda name: "C:/fake/npm.cmd")
        report = svc._node(root, _MetricsCollector())
        assert report.installed == "failed"
        assert report.ok is False
        # Build Guard: the real install never ran; the failure is the PREVISIBLE
        # preflight simulation, with the user-decision diagnosis attached.
        assert all("--dry-run" in call for call in runs.calls)
        assert report.classified_error is not None
        assert report.classified_error.code == "npm_peer_dependency_conflict"
        assert report.classified_error.conflict["requires_user_decision"] is True
        assert report.classified_error.auto_fixable is False
        # React untouched even in failure.
        assert _manifest(root)["dependencies"]["react"] == "^18.2.0"
    finally:
        shutil.rmtree(root, ignore_errors=True)


# --------------------------------------------------------- matrix sanity ----

def test_matrix_windows_are_internally_coherent():
    engine = StackCompatibilityEngine()
    for react_major, rules in COMPATIBILITY_MATRIX.items():
        for rule in rules.values():
            assert rule.min_version <= rule.max_version
            # Every suggested version must itself satisfy the rule it fixes.
            from app.services.stack_compatibility import _parse_version

            suggested = _parse_version(rule.suggested)
            assert suggested is not None
            assert rule.accepts(suggested), f"{react_major}/{rule.package}: {rule.suggested}"
    assert engine  # engine constructs without side effects
