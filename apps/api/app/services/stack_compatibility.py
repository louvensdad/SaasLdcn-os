from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

# Stack Compatibility Engine: ecosystem coherence for generated dependencies.
#
# The canonical incident: the frontend agent emitted React 18.2.0 together with
# @testing-library/react-native@14.0.1 (which peer-requires React >=19) and the
# install died with ERESOLVE. LLMs pick each dependency version in isolation;
# nothing guaranteed the versions were coherent AS A SET.
#
# Three deterministic pieces fix that structurally:
#   1. Stack Lock  — the project's anchor versions (react / react-native / expo /
#      node) are captured once into stack.lock.json and become IMMUTABLE during
#      generation: no automatic fix may ever change them, and a manifest that
#      drifts from the lock is rewritten back to it.
#   2. Compatibility Matrix — per React-major rules for the ecosystem packages
#      that are version-coupled to the anchors. Every generated dependency is
#      validated against the matrix BEFORE npm ever runs.
#   3. Auto Version Fixer — an incompatible DEPENDENT package is moved to the
#      matrix-suggested compatible version (e.g. @testing-library/react-native
#      ^14 -> ^12.9.0 under React 18). If the only possible fix would change an
#      anchor (upgrade React), the engine refuses and asks for a user decision.

EventSink = Callable[[dict[str, Any]], None]

_NPM_MANIFEST_SECTIONS = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")

STACK_LOCK_FILE = "stack.lock.json"
COMPATIBILITY_REPORT_FILE = "stack.compatibility.json"

# Packages whose versions define the stack. Immutable during generation: the
# fixer never changes them; manifests that drift are restored to the lock.
ANCHOR_PACKAGES = ("react", "react-native", "expo")

# Anchors used to fix the Stack Lock BEFORE any manifest exists (React 18 line —
# the only window the Compatibility Matrix and generated scaffolds currently
# target). Real manifests are still restored to these on drift by
# validate_and_fix(); default_lock() only decides the values up front.
DEFAULT_ANCHORS: dict[str, str] = {
    "react": "^18.2.0",
    "react_native": "0.74.5",
    "expo": "~51.0.0",
}

# Technology Governance (Engineering Policy gap #5): a second, real anchor set
# for the React 19 window the Compatibility Matrix above already fully models.
# Values pulled straight from COMPATIBILITY_MATRIX[19]'s own suggested versions
# for react-dom/react-native/expo -- no new version knowledge invented here.
# "18" stays the DEFAULT_ANCHORS alias so react_major=None/"18" behaves
# identically to before this existed.
ANCHORS_BY_REACT_MAJOR: dict[str, dict[str, str]] = {
    "18": DEFAULT_ANCHORS,
    "19": {"react": "^19.0.0", "react_native": "0.79.2", "expo": "~53.0.0"},
}

_VERSION_RE = re.compile(r"(\d+)(?:\.(\d+))?")

# npm ERESOLVE log shape (stable across npm 8-10):
#   Found: react@18.2.0
#   peer react@">=19.0.0" from @testing-library/react-native@14.0.1
_ERESOLVE_FOUND_RE = re.compile(r"Found:\s+(\S+?)@(\d[\w.\-]*)")
_ERESOLVE_PEER_RE = re.compile(r"peer\s+(\S+?)@\"([^\"]+)\"\s+from\s+(\S+?)@(\d[\w.\-]*)")


def _parse_version(spec: str | None) -> tuple[int, int] | None:
    """'^18.2.0' -> (18, 2); '>=19.0.0' -> (19, 0); '0.74.5' -> (0, 74).
    None when the spec carries no number ('latest', '*', 'workspace:*')."""
    if not spec:
        return None
    match = _VERSION_RE.search(str(spec))
    if not match:
        return None
    return int(match.group(1)), int(match.group(2) or 0)


@dataclass(frozen=True)
class CompatibilityRule:
    """One matrix entry: which version window of `package` is coherent with the
    anchor (React major), and which version to use when outside the window."""

    package: str
    min_version: tuple[int, int]  # inclusive (major, minor)
    max_version: tuple[int, int]  # inclusive
    suggested: str
    reason: str
    impact: str

    def accepts(self, version: tuple[int, int]) -> bool:
        return self.min_version <= version <= self.max_version


def _rules(entries: list[tuple[str, tuple[int, int], tuple[int, int], str, str, str]]) -> dict[str, CompatibilityRule]:
    return {
        name: CompatibilityRule(name, low, high, suggested, reason, impact)
        for name, low, high, suggested, reason, impact in entries
    }


# Dependency Compatibility Matrix, keyed by the LOCKED React major.
# min/max are inclusive (major, minor) windows of the DEPENDENT package.
COMPATIBILITY_MATRIX: dict[int, dict[str, CompatibilityRule]] = {
    18: _rules([
        ("react-dom", (18, 0), (18, 99), "^18.2.0",
         "react-dom deve ter exatamente o mesmo major do react.",
         "Nenhuma mudanca de API; apenas coerencia de versao."),
        ("react-test-renderer", (18, 0), (18, 99), "^18.2.0",
         "react-test-renderer deve espelhar a versao do react.",
         "Nenhuma mudanca de API; apenas coerencia de versao."),
        ("@types/react", (18, 0), (18, 99), "^18.3.3",
         "@types/react deve acompanhar o major do react.",
         "Tipos coerentes com o runtime; sem impacto de codigo."),
        ("@types/react-dom", (18, 0), (18, 99), "^18.3.0",
         "@types/react-dom deve acompanhar o major do react.",
         "Tipos coerentes com o runtime; sem impacto de codigo."),
        ("@testing-library/react-native", (11, 0), (12, 99), "^12.9.0",
         "@testing-library/react-native v13+ exige React 19; com React 18 use a serie 12.x.",
         "API de testes praticamente identica (render/screen/fireEvent); downgrade seguro."),
        ("@testing-library/react", (13, 0), (16, 99), "^16.3.0",
         "@testing-library/react 13-16 suporta React 18.",
         "Sem impacto: a serie 16.x e compativel com React 18 e 19."),
        ("next", (13, 0), (14, 99), "^14.2.3",
         "Next.js 15 exige React 19; com React 18 use Next 13/14.",
         "Next 14 (App Router estavel); evita APIs exclusivas do Next 15."),
        ("react-native", (0, 72), (0, 76), "0.74.5",
         "React Native 0.72-0.76 e a janela compativel com React 18.",
         "Downgrade/upgrade dentro da janela suportada pelo Expo SDK 51."),
        ("expo", (50, 0), (51, 99), "~51.0.0",
         "Expo SDK 50/51 usa React 18; SDK 52+ migra para React 18.3/19.",
         "SDK 51 e o LTS de React 18; APIs Expo estaveis."),
    ]),
    19: _rules([
        ("react-dom", (19, 0), (19, 99), "^19.0.0",
         "react-dom deve ter exatamente o mesmo major do react.",
         "Nenhuma mudanca de API; apenas coerencia de versao."),
        ("react-test-renderer", (19, 0), (19, 99), "^19.0.0",
         "react-test-renderer deve espelhar a versao do react.",
         "Nenhuma mudanca de API; apenas coerencia de versao."),
        ("@types/react", (19, 0), (19, 99), "^19.0.0",
         "@types/react deve acompanhar o major do react.",
         "Tipos coerentes com o runtime; sem impacto de codigo."),
        ("@types/react-dom", (19, 0), (19, 99), "^19.0.0",
         "@types/react-dom deve acompanhar o major do react.",
         "Tipos coerentes com o runtime; sem impacto de codigo."),
        ("@testing-library/react-native", (13, 0), (14, 99), "^14.0.0",
         "Com React 19 use @testing-library/react-native 13/14.",
         "Serie atual da lib; sem downgrade."),
        ("@testing-library/react", (16, 0), (16, 99), "^16.3.0",
         "Com React 19 use @testing-library/react 16.x.",
         "Serie atual da lib; sem downgrade."),
        ("next", (15, 0), (15, 99), "^15.3.0",
         "Next.js 15 e a serie construida para React 19.",
         "APIs assincronas de params/cookies do Next 15 se aplicam."),
        ("react-native", (0, 78), (0, 99), "0.79.2",
         "React Native 0.78+ e a janela compativel com React 19.",
         "Exige New Architecture; janela do Expo SDK 53."),
        ("expo", (53, 0), (53, 99), "~53.0.0",
         "Expo SDK 53 usa React 19.",
         "SDK alinhado ao react/react-native travados."),
    ]),
}


@dataclass
class StackLock:
    """The immutable anchor versions of a generated project. Captured from the
    first manifest that declares React and persisted as stack.lock.json; loaded
    (never re-derived) on every later pass so generation cannot drift."""

    react: str | None = None
    react_native: str | None = None
    expo: str | None = None
    node: str | None = None
    source_manifest: str | None = None
    captured_at: str = ""

    @property
    def react_major(self) -> int | None:
        version = _parse_version(self.react)
        return version[0] if version else None

    def anchor_spec(self, package: str) -> str | None:
        return {"react": self.react, "react-native": self.react_native, "expo": self.expo}.get(package)

    def as_dict(self) -> dict[str, Any]:
        return {
            "react": self.react,
            "react_major": self.react_major,
            "react_native": self.react_native,
            "expo": self.expo,
            "node": self.node,
            "source_manifest": self.source_manifest,
            "captured_at": self.captured_at,
        }


@dataclass
class CompatibilityFinding:
    manifest: str
    package: str
    section: str
    current: str
    required: str  # the coherent window / the locked anchor value
    suggested: str | None
    reason: str
    impact: str
    status: str  # "fixed" | "requires_user_decision" | "lock_enforced"

    def as_dict(self) -> dict[str, Any]:
        return {
            "manifest": self.manifest,
            "package": self.package,
            "section": self.section,
            "current": self.current,
            "required": self.required,
            "suggested": self.suggested,
            "reason": self.reason,
            "impact": self.impact,
            "status": self.status,
        }


@dataclass
class StackCompatibilityResult:
    status: str  # "passed" | "fixed" | "blocked" | "skipped"
    lock: StackLock | None = None
    findings: list[CompatibilityFinding] = field(default_factory=list)
    report_path: str | None = None

    @property
    def fixed(self) -> bool:
        return any(item.status in {"fixed", "lock_enforced"} for item in self.findings)

    @property
    def blocked(self) -> bool:
        return any(item.status == "requires_user_decision" for item in self.findings)

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "lock": self.lock.as_dict() if self.lock else None,
            "findings": [item.as_dict() for item in self.findings],
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        }


@dataclass(frozen=True)
class PeerConflict:
    """A parsed + diagnosed npm ERESOLVE conflict — the 'diagnostico claro':
    which package conflicts, what it requires, what the stack currently has,
    which compatible version is suggested and what changing it implies."""

    package: str
    package_version: str
    requires: str  # e.g. 'react@">=19.0.0"'
    anchor: str
    anchor_version: str
    suggested: str | None
    reason: str
    impact: str
    requires_user_decision: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "package": self.package,
            "package_version": self.package_version,
            "requires": self.requires,
            "anchor": self.anchor,
            "anchor_version": self.anchor_version,
            "suggested": self.suggested,
            "reason": self.reason,
            "impact": self.impact,
            "requires_user_decision": self.requires_user_decision,
        }


class StackCompatibilityEngine:
    # ------------------------------------------------------------- stack lock
    def default_lock(self, *, delivery_type: str | None, react_major: str | None = None) -> StackLock:
        """Fix the anchor versions BEFORE any code is generated. The caller
        persists the result as the job's stack.lock.json artifact so it lands in
        the project root ahead of every generation step; capture_lock() then
        finds it already present and loads it instead of deriving a fresh lock
        from whatever an agent happened to write (which is too late to prevent
        drift — only to repair it).

        `react_major` is the Stack Approval Gate's Technology Governance choice
        ("18"/"19", see StackApproval.selected_frontend_version) -- None (no
        explicit choice) or any unrecognized value falls back to DEFAULT_ANCHORS
        (React 18), preserving every caller's behavior from before this existed."""
        anchors = ANCHORS_BY_REACT_MAJOR.get(react_major or "", DEFAULT_ANCHORS)
        includes_mobile = delivery_type in {"mobile", "full_stack"}
        return StackLock(
            react=anchors["react"],
            react_native=anchors["react_native"] if includes_mobile else None,
            expo=anchors["expo"] if includes_mobile else None,
            node=None,
            source_manifest="pre_generation_default",
            captured_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        )

    def capture_lock(self, root: Path) -> StackLock | None:
        """Load the existing stack.lock.json (immutable during generation) or
        capture the anchors from the first manifest that declares React and
        persist them. Returns None for projects without a React ecosystem."""
        lock_path = root / STACK_LOCK_FILE
        if lock_path.is_file():
            try:
                data = json.loads(lock_path.read_text(encoding="utf-8"))
                return StackLock(
                    react=data.get("react"), react_native=data.get("react_native"),
                    expo=data.get("expo"), node=data.get("node"),
                    source_manifest=data.get("source_manifest"),
                    captured_at=data.get("captured_at") or "",
                )
            except (OSError, json.JSONDecodeError):
                pass
        for manifest in self._manifests(root):
            data = self._load(manifest)
            if data is None:
                continue
            deps = self._all_deps(data)
            if "react" not in deps and "react-native" not in deps and "expo" not in deps:
                continue
            engines = data.get("engines") if isinstance(data.get("engines"), dict) else {}
            lock = StackLock(
                react=deps.get("react"),
                react_native=deps.get("react-native"),
                expo=deps.get("expo"),
                node=engines.get("node"),
                source_manifest=manifest.relative_to(root).as_posix(),
                captured_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            )
            lock_path.write_text(json.dumps(lock.as_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            return lock
        return None

    # ----------------------------------------------------- validate + auto-fix
    def check_manifest(self, lock: StackLock, label: str, data: dict[str, Any]) -> list[CompatibilityFinding]:
        """Pure, in-memory enforcement of the (already locked) anchors + the
        Compatibility Matrix against a single manifest dict, mutating `data` in
        place for every auto-fix. Shared by validate_and_fix() (disk manifests,
        checked once more at BUILD_RUNNING) and by the per-stage Conflict
        Detector gate in generation_job_engine (checked right after each of
        backend/frontend/mobile emits its package.json, instead of only at the
        end of the pipeline)."""
        if lock.react_major is None:
            return []
        rules = COMPATIBILITY_MATRIX.get(lock.react_major, {})
        findings: list[CompatibilityFinding] = []
        for section in _NPM_MANIFEST_SECTIONS:
            deps = data.get(section)
            if not isinstance(deps, dict):
                continue
            for name in sorted(deps):
                spec = str(deps[name])
                version = _parse_version(spec)
                if version is None:
                    continue
                # Stack Lock enforcement: an anchor that drifted from the lock is
                # restored — never silently upgraded/downgraded by an agent.
                locked_spec = lock.anchor_spec(name)
                if locked_spec is not None and name in ANCHOR_PACKAGES:
                    locked_version = _parse_version(locked_spec)
                    # For 0.x anchors (react-native) the minor IS the version
                    # line, so drift is judged on (major, minor), not major.
                    drifted = locked_version is not None and (
                        version[0] != locked_version[0]
                        or (locked_version[0] == 0 and version[1] != locked_version[1])
                    )
                    if drifted:
                        deps[name] = locked_spec
                        findings.append(CompatibilityFinding(
                            manifest=label, package=name, section=section,
                            current=spec, required=locked_spec, suggested=locked_spec,
                            reason=f"Stack Lock: '{name}' esta travado em {locked_spec} durante a geracao.",
                            impact="Restaura a versao aprovada da stack; nenhuma dependencia decide o React sozinha.",
                            status="lock_enforced",
                        ))
                        continue
                rule = rules.get(name)
                if rule is None or name in ANCHOR_PACKAGES:
                    continue
                if not rule.accepts(version):
                    deps[name] = rule.suggested
                    findings.append(CompatibilityFinding(
                        manifest=label, package=name, section=section,
                        current=spec,
                        required=f">={rule.min_version[0]}.{rule.min_version[1]} <={rule.max_version[0]}.{rule.max_version[1]} (React {lock.react_major})",
                        suggested=rule.suggested, reason=rule.reason, impact=rule.impact,
                        status="fixed",
                    ))
        return findings

    def check_duplicate_versions(self, manifests: dict[str, dict[str, Any]]) -> list[CompatibilityFinding]:
        """Dependency Graph gap: the same (non-anchor) package declared with
        different version specs across frontend/mobile/backend manifests —
        anchors are already governed by the Stack Lock and skipped here.
        Reconciles every later occurrence to the first manifest's spec (stable,
        insertion-ordered) and mutates `manifests` in place."""
        seen: dict[str, tuple[str, str]] = {}
        findings: list[CompatibilityFinding] = []
        for label, data in manifests.items():
            for section in _NPM_MANIFEST_SECTIONS:
                deps = data.get(section)
                if not isinstance(deps, dict):
                    continue
                for name in sorted(deps):
                    if name in ANCHOR_PACKAGES:
                        continue
                    spec = str(deps[name])
                    if name not in seen:
                        seen[name] = (label, spec)
                        continue
                    first_label, first_spec = seen[name]
                    if spec != first_spec:
                        deps[name] = first_spec
                        findings.append(CompatibilityFinding(
                            manifest=label, package=name, section=section,
                            current=spec, required=first_spec, suggested=first_spec,
                            reason=f"'{name}' declarado como {first_spec} em {first_label} e {spec} em {label}; monorepo exige uma unica versao.",
                            impact="Reconciliado para a versao do primeiro manifesto que declarou a dependencia.",
                            status="fixed",
                        ))
        return findings

    def validate_and_fix(self, root: Path, *, sink: EventSink | None = None) -> StackCompatibilityResult:
        """Dependency Resolver + Auto Version Fixer, BEFORE npm ever runs:

        1. capture/load the Stack Lock;
        2. restore any manifest that drifted from a locked anchor (Stack Lock is
           immutable during generation — React is never changed automatically);
        3. validate every dependency against the Compatibility Matrix for the
           locked React major and move incompatible DEPENDENT packages to the
           suggested compatible version;
        4. persist stack.compatibility.json with every finding."""
        lock = self.capture_lock(root)
        if lock is None or lock.react_major is None:
            return StackCompatibilityResult(status="skipped")
        result = StackCompatibilityResult(status="passed", lock=lock)

        for manifest in self._manifests(root):
            data = self._load(manifest)
            if data is None:
                continue
            label = manifest.relative_to(root).as_posix()
            findings = self.check_manifest(lock, label, data)
            for finding in findings:
                result.findings.append(finding)
                self._emit(sink, finding)

            if findings:
                manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                stale_lock = manifest.parent / "package-lock.json"
                if stale_lock.is_file():
                    stale_lock.unlink()

        if result.blocked:
            result.status = "blocked"
        elif result.fixed:
            result.status = "fixed"
        result.report_path = str(self._write_report(root, result))
        return result

    # -------------------------------------------------------- ERESOLVE repair
    def diagnose_peer_conflict(self, logs: str, root: Path) -> PeerConflict | None:
        """Parse an npm ERESOLVE log into a clear diagnosis and consult the
        matrix for the compatible version of the CONFLICTING package. When the
        only possible fix would change a locked anchor (e.g. upgrade React),
        requires_user_decision is True and nothing is suggested."""
        found = _ERESOLVE_FOUND_RE.search(logs)
        peer = _ERESOLVE_PEER_RE.search(logs)
        if not found or not peer:
            return None
        anchor_name, anchor_version = found.group(1), found.group(2)
        peer_name, peer_range, offender, offender_version = peer.groups()
        lock = self.capture_lock(root)
        anchor_major = (_parse_version(anchor_version) or (0, 0))[0]
        if lock is not None and lock.react_major is not None and anchor_name == "react":
            anchor_major = lock.react_major
        rule = COMPATIBILITY_MATRIX.get(anchor_major, {}).get(offender)
        if rule is not None and offender not in ANCHOR_PACKAGES:
            return PeerConflict(
                package=offender, package_version=offender_version,
                requires=f'{peer_name}@"{peer_range}"',
                anchor=anchor_name, anchor_version=anchor_version,
                suggested=rule.suggested, reason=rule.reason, impact=rule.impact,
                requires_user_decision=False,
            )
        # No compatible version known for the offender: the only remaining fix
        # would be changing the anchor itself (e.g. upgrading React) — NEVER
        # automatic. Surface a clear diagnosis and ask the user.
        return PeerConflict(
            package=offender, package_version=offender_version,
            requires=f'{peer_name}@"{peer_range}"',
            anchor=anchor_name, anchor_version=anchor_version,
            suggested=None,
            reason=(
                f"'{offender}@{offender_version}' exige {peer_name} {peer_range}, mas a stack travada usa "
                f"{anchor_name}@{anchor_version} e a matriz nao conhece uma versao de '{offender}' compativel."
            ),
            impact=f"Resolver exigiria mudar '{anchor_name}' — mudanca de stack requer aprovacao explicita do usuario.",
            requires_user_decision=True,
        )

    def apply_conflict_fix(self, root: Path, conflict: PeerConflict) -> bool:
        """Auto Version Fixer for a diagnosed ERESOLVE: move the CONFLICTING
        package to the suggested compatible version. Anchors are never touched."""
        if not conflict.suggested or conflict.requires_user_decision:
            return False
        fixed = False
        for manifest in self._manifests(root):
            data = self._load(manifest)
            if data is None:
                continue
            changed = False
            for section in _NPM_MANIFEST_SECTIONS:
                deps = data.get(section)
                if isinstance(deps, dict) and conflict.package in deps:
                    deps[conflict.package] = conflict.suggested
                    changed = True
            if changed:
                manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                stale_lock = manifest.parent / "package-lock.json"
                if stale_lock.is_file():
                    stale_lock.unlink()
                fixed = True
        return fixed

    # ---------------------------------------------------------------- helpers
    def _write_report(self, root: Path, result: StackCompatibilityResult) -> Path:
        target = root / COMPATIBILITY_REPORT_FILE
        payload = result.as_dict()
        payload["report_path"] = str(target)
        target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return target

    def _manifests(self, root: Path) -> list[Path]:
        candidates = ["", "apps/web", "apps/api", "apps/mobile", "frontend", "backend"]
        found: list[Path] = []
        seen: set[Path] = set()
        for candidate in candidates:
            manifest = (root / candidate / "package.json").resolve()
            if manifest.is_file() and manifest not in seen:
                found.append(manifest)
                seen.add(manifest)
        if not found:
            for manifest in sorted(root.rglob("package.json"), key=lambda path: len(path.parts)):
                if "node_modules" not in manifest.parts:
                    found.append(manifest.resolve())
                    break
        return found

    @staticmethod
    def _load(manifest: Path) -> dict[str, Any] | None:
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        return data if isinstance(data, dict) else None

    @staticmethod
    def _all_deps(data: dict[str, Any]) -> dict[str, str]:
        merged: dict[str, str] = {}
        for section in _NPM_MANIFEST_SECTIONS:
            deps = data.get(section)
            if isinstance(deps, dict):
                for name, spec in deps.items():
                    merged.setdefault(str(name), str(spec))
        return merged

    @staticmethod
    def _emit(sink: EventSink | None, finding: CompatibilityFinding) -> None:
        if sink is None:
            return
        try:
            sink({
                "type": "repair_applied" if finding.status in {"fixed", "lock_enforced"} else "repair_failed",
                "stream": "stderr",
                "level": "warning",
                "message": (
                    f"Stack Compatibility: '{finding.package}' {finding.current} -> {finding.suggested or 'sem fix automatico'}. "
                    f"{finding.reason}"
                ),
            })
        except Exception:  # noqa: BLE001 — compatibility engine must never break the build
            pass


stack_compatibility_engine = StackCompatibilityEngine()
