from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

# Internal Dependency Registry: the deterministic gate that runs BEFORE npm install.
#
# LLM agents occasionally invent package names that do not exist on the npm
# registry (the canonical incident: "@radix-ui/react-badge" -> npm E404 and the
# whole build sinks). This registry validates every generated package.json against
# (a) npm naming rules, (b) an allowlist of the Radix UI packages that actually
# exist, and (c) a known-bad table with a safe deterministic fix for each entry.
# Anything it cannot prove valid it repairs (when a fix is known) or flags so the
# build pipeline can block it instead of shipping a manifest that can never install.

EventSink = Callable[[dict[str, Any]], None]

_NPM_MANIFEST_SECTIONS = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")

# npm name rules (new packages): lowercase, URL-safe, <= 214 chars, optional scope.
_VALID_NPM_NAME_RE = re.compile(r"^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$")

# Radix UI primitives that really exist on the npm registry. Any other
# "@radix-ui/react-*" name is treated as invented until proven otherwise.
RADIX_ALLOWLIST = frozenset({
    "@radix-ui/react-accordion",
    "@radix-ui/react-alert-dialog",
    "@radix-ui/react-aspect-ratio",
    "@radix-ui/react-avatar",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-collapsible",
    "@radix-ui/react-context-menu",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-hover-card",
    "@radix-ui/react-label",
    "@radix-ui/react-menubar",
    "@radix-ui/react-navigation-menu",
    "@radix-ui/react-popover",
    "@radix-ui/react-progress",
    "@radix-ui/react-radio-group",
    "@radix-ui/react-scroll-area",
    "@radix-ui/react-select",
    "@radix-ui/react-separator",
    "@radix-ui/react-slider",
    "@radix-ui/react-slot",
    "@radix-ui/react-switch",
    "@radix-ui/react-tabs",
    "@radix-ui/react-toast",
    "@radix-ui/react-toggle",
    "@radix-ui/react-toggle-group",
    "@radix-ui/react-toolbar",
    "@radix-ui/react-tooltip",
    "@radix-ui/react-icons",
    "@radix-ui/colors",
})

_BADGE_COMPONENT_PATH = "components/ui/badge.tsx"

# A dependency-free Badge (Tailwind classes only) so removing the invented
# package never leaves a dangling import.
_BADGE_COMPONENT = '''import * as React from "react";

const VARIANTS: Record<string, string> = {
  default: "border-transparent bg-slate-900 text-slate-50 dark:bg-slate-50 dark:text-slate-900",
  secondary: "border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50",
  destructive: "border-transparent bg-red-500 text-slate-50 dark:bg-red-900",
  outline: "text-slate-950 dark:text-slate-50",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof VARIANTS;
}

export function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  const variantClass = VARIANTS[variant] ?? VARIANTS.default;
  return (
    <div
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${variantClass} ${className}`.trim()}
      {...props}
    />
  );
}

export default Badge;
'''


@dataclass(frozen=True)
class KnownBadPackage:
    """A package name LLMs are known to invent, plus its deterministic fix."""

    name: str
    reason: str
    fix: str  # human-readable patch description
    local_component: str | None = None  # file to materialize (relative to manifest dir)
    local_component_content: str | None = None
    import_replacement: str | None = None  # module specifier that replaces the bad import


KNOWN_BAD_PACKAGES: dict[str, KnownBadPackage] = {
    "@radix-ui/react-badge": KnownBadPackage(
        name="@radix-ui/react-badge",
        reason="O pacote '@radix-ui/react-badge' nao existe no registro npm (Radix UI nao publica um primitive Badge).",
        fix="Remover a dependencia e gerar um Badge local em components/ui/badge.tsx (Tailwind, sem dependencias).",
        local_component=_BADGE_COMPONENT_PATH,
        local_component_content=_BADGE_COMPONENT,
        import_replacement="@/components/ui/badge",
    ),
}


@dataclass
class DependencyFindingRecord:
    manifest: str
    package: str
    section: str
    status: str  # "blocked" | "fixed" | "invalid_name"
    reason: str
    patch: str | None = None
    files_written: list[str] = field(default_factory=list)
    files_rewritten: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "manifest": self.manifest,
            "package": self.package,
            "section": self.section,
            "status": self.status,
            "reason": self.reason,
            "patch": self.patch,
            "files_written": self.files_written,
            "files_rewritten": self.files_rewritten,
        }


@dataclass
class DependencyValidationResult:
    status: str  # "passed" | "fixed" | "blocked" | "skipped"
    findings: list[DependencyFindingRecord] = field(default_factory=list)
    checked_packages: int = 0
    manifests: list[str] = field(default_factory=list)
    report_path: str | None = None

    @property
    def repaired(self) -> bool:
        return any(item.status == "fixed" for item in self.findings)

    @property
    def blocked(self) -> bool:
        return any(item.status in {"blocked", "invalid_name"} for item in self.findings)

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "checked_packages": self.checked_packages,
            "manifests": self.manifests,
            "findings": [item.as_dict() for item in self.findings],
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        }


class DependencyRegistry:
    """Deterministic manifest gate: validate + auto-fix before any npm install."""

    def bad_package(self, name: str) -> KnownBadPackage | None:
        return KNOWN_BAD_PACKAGES.get(name)

    def is_forbidden(self, name: str) -> bool:
        """True when the package must never reach a generated package.json."""
        if name in KNOWN_BAD_PACKAGES:
            return True
        # Any Radix primitive outside the verified allowlist is treated as invented.
        return name.startswith("@radix-ui/") and name not in RADIX_ALLOWLIST

    def validate_manifest_data(self, data: dict[str, Any], manifest_label: str) -> list[DependencyFindingRecord]:
        findings: list[DependencyFindingRecord] = []
        for section in _NPM_MANIFEST_SECTIONS:
            deps = data.get(section)
            if not isinstance(deps, dict):
                continue
            for name in sorted(deps):
                if not isinstance(name, str):
                    continue
                if not _VALID_NPM_NAME_RE.match(name):
                    findings.append(DependencyFindingRecord(
                        manifest=manifest_label, package=name, section=section,
                        status="invalid_name",
                        reason=f"'{name}' nao e um nome de pacote npm valido.",
                    ))
                    continue
                known = KNOWN_BAD_PACKAGES.get(name)
                if known is not None:
                    findings.append(DependencyFindingRecord(
                        manifest=manifest_label, package=name, section=section,
                        status="blocked", reason=known.reason, patch=known.fix,
                    ))
                elif self.is_forbidden(name):
                    findings.append(DependencyFindingRecord(
                        manifest=manifest_label, package=name, section=section,
                        status="blocked",
                        reason=(
                            f"'{name}' nao esta na allowlist de pacotes Radix reais; "
                            "pacotes fora da allowlist sao tratados como inventados."
                        ),
                        patch="Remover a dependencia do package.json.",
                    ))
        return findings

    def validate_and_fix(self, root: Path, *, sink: EventSink | None = None) -> DependencyValidationResult:
        """Validate every package.json under `root` (top level of each app dir),
        auto-fix what has a known deterministic fix, and persist
        dependency.validation.json at the project root.

        Fix = remove the invented dependency, materialize the local replacement
        component (e.g. components/ui/badge.tsx) beside the manifest, and rewrite
        source imports to the local module so no dangling import remains."""
        manifests = self._manifests(root)
        if not manifests:
            return DependencyValidationResult(status="skipped")

        result = DependencyValidationResult(status="passed")
        for manifest in manifests:
            label = manifest.relative_to(root).as_posix()
            result.manifests.append(label)
            try:
                data = json.loads(manifest.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                result.findings.append(DependencyFindingRecord(
                    manifest=label, package="package.json", section="-",
                    status="blocked", reason="package.json invalido (JSON malformado).",
                ))
                continue
            result.checked_packages += sum(
                len(data.get(section) or {}) for section in _NPM_MANIFEST_SECTIONS if isinstance(data.get(section), dict)
            )
            findings = self.validate_manifest_data(data, label)
            changed = False
            for finding in findings:
                fixed = self._apply_fix(root, manifest, data, finding)
                changed = changed or fixed
                result.findings.append(finding)
                self._emit(sink, finding)
            if changed:
                manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                lock = manifest.parent / "package-lock.json"
                if lock.is_file():
                    lock.unlink()

        if result.blocked:
            result.status = "blocked"
        elif result.repaired:
            result.status = "fixed"
        result.report_path = str(self.write_report(root, result))
        return result

    def fix_missing_package(self, root: Path, package: str, *, sink: EventSink | None = None) -> DependencyFindingRecord | None:
        """Repair path for an npm E404 raised at install time: remove the package
        from every manifest and apply the known replacement when there is one."""
        record: DependencyFindingRecord | None = None
        for manifest in self._manifests(root):
            label = manifest.relative_to(root).as_posix()
            try:
                data = json.loads(manifest.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            section_hit = next(
                (section for section in _NPM_MANIFEST_SECTIONS
                 if isinstance(data.get(section), dict) and package in data[section]),
                None,
            )
            if section_hit is None:
                continue
            known = KNOWN_BAD_PACKAGES.get(package)
            record = DependencyFindingRecord(
                manifest=label, package=package, section=section_hit,
                status="blocked",
                reason=known.reason if known else f"'{package}' nao existe no registro npm (E404).",
                patch=known.fix if known else "Remover a dependencia do package.json.",
            )
            self._apply_fix(root, manifest, data, record)
            manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            lock = manifest.parent / "package-lock.json"
            if lock.is_file():
                lock.unlink()
            self._emit(sink, record)
            break
        return record

    def write_report(self, root: Path, result: DependencyValidationResult) -> Path:
        target = root / "dependency.validation.json"
        payload = result.as_dict()
        payload["report_path"] = str(target)
        target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return target

    # ----------------------------------------------------------------- internal
    def _apply_fix(self, root: Path, manifest: Path, data: dict[str, Any], finding: DependencyFindingRecord) -> bool:
        """Mutates `data` in place; returns True when the manifest changed."""
        if finding.status not in {"blocked", "invalid_name"}:
            return False
        removed = False
        for section in _NPM_MANIFEST_SECTIONS:
            deps = data.get(section)
            if isinstance(deps, dict) and finding.package in deps:
                deps.pop(finding.package)
                removed = True
        if not removed:
            return False
        finding.status = "fixed"
        known = KNOWN_BAD_PACKAGES.get(finding.package)
        if known and known.local_component and known.local_component_content:
            component = manifest.parent / known.local_component
            if not component.is_file():
                component.parent.mkdir(parents=True, exist_ok=True)
                component.write_text(known.local_component_content, encoding="utf-8")
                finding.files_written.append(component.relative_to(root).as_posix())
        if known and known.import_replacement:
            finding.files_rewritten.extend(
                self._rewrite_imports(root, manifest.parent, known.name, known.import_replacement)
            )
        finding.patch = finding.patch or f"Dependencia '{finding.package}' removida do package.json."
        return True

    def _rewrite_imports(self, root: Path, app_dir: Path, bad_module: str, replacement: str) -> list[str]:
        rewritten: list[str] = []
        for pattern in ("**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"):
            for source in app_dir.glob(pattern):
                if "node_modules" in source.parts:
                    continue
                try:
                    text = source.read_text(encoding="utf-8")
                except (OSError, UnicodeDecodeError):
                    continue
                if bad_module not in text:
                    continue
                updated = text.replace(f'"{bad_module}"', f'"{replacement}"').replace(f"'{bad_module}'", f"'{replacement}'")
                if updated != text:
                    source.write_text(updated, encoding="utf-8")
                    rewritten.append(source.relative_to(root).as_posix())
        return rewritten

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
    def _emit(sink: EventSink | None, finding: DependencyFindingRecord) -> None:
        if sink is None:
            return
        try:
            sink({
                "type": "repair_applied" if finding.status == "fixed" else "command_output",
                "stream": "stderr",
                "level": "warning",
                "message": (
                    f"Dependency Registry: {finding.reason} "
                    + (f"Patch: {finding.patch}" if finding.patch else "")
                ).strip(),
            })
        except Exception:  # noqa: BLE001 — the registry must never break the build
            pass


dependency_registry = DependencyRegistry()
