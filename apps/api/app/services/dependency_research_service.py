from __future__ import annotations

import json
import re
import tomllib
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.generation_validation import DependencyAuditReport, DependencyFinding, VulnerabilityFinding


_REQ_RE = re.compile(r"^\s*([A-Za-z0-9_.-]+)\s*(?:==|~=|>=|<=|>|<)?\s*([^#;\s]+)?")
_SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9_.@/+:-]+$")

# OSV.dev speaks its own ecosystem names, not ours -- this is the exact mapping
# (https://ossf.github.io/osv-schema/#ecosystems). Every ecosystem this service
# already resolves versions for has a real OSV ecosystem, so CVE coverage is
# additive to all 8, not a new npm-only special case.
_OSV_ECOSYSTEM: dict[str, str] = {
    "pypi": "PyPI", "npm": "npm", "maven": "Maven", "packagist": "Packagist",
    "crates": "crates.io", "rubygems": "RubyGems", "nuget": "NuGet", "go": "Go",
}
_SEVERITY_RANK: dict[str, int] = {"UNKNOWN": 0, "LOW": 1, "MODERATE": 2, "HIGH": 3, "CRITICAL": 4}


@dataclass(frozen=True)
class VersionLookup:
    ecosystem: str
    name: str
    latest_version: str | None
    skipped_reason: str | None = None


class DependencyResearchService:
    def __init__(self, timeout: float = 2.5) -> None:
        self.timeout = timeout
        self._cache: dict[tuple[str, str], VersionLookup] = {}
        self._vuln_cache: dict[tuple[str, str, str, str], list[VulnerabilityFinding]] = {}

    def latest_pypi(self, package: str) -> VersionLookup:
        if get_settings().force_mock:
            return VersionLookup("pypi", package, None, "dependency research skipped in mock mode")
        return self._cached("pypi", package, lambda: self._latest_pypi(package))

    def latest_npm(self, package: str) -> VersionLookup:
        if get_settings().force_mock:
            return VersionLookup("npm", package, None, "dependency research skipped in mock mode")
        return self._cached("npm", package, lambda: self._latest_npm(package))

    def latest_maven(self, group: str, artifact: str) -> VersionLookup:
        name = f"{group}:{artifact}"
        if get_settings().force_mock:
            return VersionLookup("maven", name, None, "dependency research skipped in mock mode")
        return self._cached("maven", name, lambda: self._latest_maven(group, artifact))

    def latest_packagist(self, package: str) -> VersionLookup:
        if get_settings().force_mock:
            return VersionLookup("packagist", package, None, "dependency research skipped in mock mode")
        return self._cached("packagist", package, lambda: self._latest_packagist(package))

    def latest_crates(self, package: str) -> VersionLookup:
        if get_settings().force_mock:
            return VersionLookup("crates", package, None, "dependency research skipped in mock mode")
        return self._cached("crates", package, lambda: self._latest_crates(package))

    def latest_rubygems(self, package: str) -> VersionLookup:
        if get_settings().force_mock:
            return VersionLookup("rubygems", package, None, "dependency research skipped in mock mode")
        return self._cached("rubygems", package, lambda: self._latest_rubygems(package))

    def latest_nuget(self, package: str) -> VersionLookup:
        if get_settings().force_mock:
            return VersionLookup("nuget", package, None, "dependency research skipped in mock mode")
        return self._cached("nuget", package, lambda: self._latest_nuget(package))

    def latest_go(self, module: str) -> VersionLookup:
        if get_settings().force_mock:
            return VersionLookup("go", module, None, "dependency research skipped in mock mode")
        return self._cached("go", module, lambda: self._latest_go(module))

    def core_versions(self, stack: Any) -> str:
        framework = str(getattr(stack, "framework", "") or "").lower()
        runtime = str(getattr(stack, "runtime", "") or "").lower()
        language = str(getattr(stack, "language", "") or "").lower()

        lookups: list[VersionLookup] = []
        if "fastapi" in framework or "python" in language:
            for package in ["fastapi", "uvicorn", "pydantic"]:
                lookups.append(self.latest_pypi(package))
        elif "next" in framework or "react" in framework:
            for package in ["next", "react", "react-dom", "typescript"]:
                lookups.append(self.latest_npm(package))
        elif "nest" in framework:
            for package in ["@nestjs/core", "@nestjs/common", "typescript"]:
                lookups.append(self.latest_npm(package))
        elif "kotlin" in language or "ktor" in framework:
            for package in ["io.ktor:ktor-server-netty", "io.ktor:ktor-server-content-negotiation"]:
                group, artifact = package.split(":")
                lookups.append(self.latest_maven(group, artifact))
        elif "spring" in framework or "java" in language or "maven" in runtime:
            lookups.append(self.latest_maven("org.springframework.boot", "spring-boot-starter-web"))
            lookups.append(self.latest_maven("org.springframework.boot", "spring-boot-starter-test"))
        elif "go" == language or "golang" in language or "gin" in framework:
            for module in ["github.com/gin-gonic/gin"]:
                lookups.append(self.latest_go(module))
        elif "php" in language or "laravel" in framework or "slim" in framework:
            packages = ["laravel/framework"] if "laravel" in framework else ["slim/slim", "slim/psr7"]
            for package in packages:
                lookups.append(self.latest_packagist(package))
        elif "rust" in language or "axum" in framework:
            for package in ["axum", "tokio", "serde"]:
                lookups.append(self.latest_crates(package))
        elif "ruby" in language or "rails" in framework or "sinatra" in framework:
            packages = ["rails"] if "rails" in framework else ["sinatra", "puma"]
            for package in packages:
                lookups.append(self.latest_rubygems(package))
        elif "c#" in language or "csharp" in language or "dotnet" in language or "aspnet" in framework or ".net" in framework:
            for package in ["Microsoft.EntityFrameworkCore", "Swashbuckle.AspNetCore"]:
                lookups.append(self.latest_nuget(package))

        lines = ["## Verified current dependency versions"]
        if not lookups:
            lines.append("- skipped: no supported core dependency set was mapped for the selected stack.")
            return "\n".join(lines)

        for item in lookups:
            if item.latest_version:
                lines.append(f"- {item.ecosystem}:{item.name} latest={item.latest_version}")
            else:
                lines.append(f"- {item.ecosystem}:{item.name} skipped ({item.skipped_reason or 'lookup failed'})")
        lines.append("Use these verified versions where direct dependency versions are needed; do not invent package names or versions.")
        return "\n".join(lines)

    def audit_manifest(self, files: list[dict[str, Any]]) -> DependencyAuditReport:
        findings: list[DependencyFinding] = []
        saw_manifest = False
        skipped_reasons: list[str] = []

        for item in files:
            path = str(item.get("relative_path") or "")
            content = item.get("content")
            if isinstance(content, bytes):
                text = content.decode("utf-8", errors="ignore")
            else:
                text = str(content or "")
            lower = path.lower()
            if lower.endswith("requirements.txt"):
                saw_manifest = True
                findings.extend(self._audit_requirements(path, text, skipped_reasons))
            elif lower.endswith("composer.json"):
                saw_manifest = True
                findings.extend(self._audit_composer(path, text, skipped_reasons))
            elif lower.endswith("package.json"):
                saw_manifest = True
                findings.extend(self._audit_package_json(path, text, skipped_reasons))
            elif lower.endswith("pom.xml"):
                saw_manifest = True
                findings.extend(self._audit_pom(path, text, skipped_reasons))
            elif lower.endswith("go.mod"):
                saw_manifest = True
                findings.extend(self._audit_go_mod(path, text, skipped_reasons))
            elif lower.endswith("cargo.toml"):
                saw_manifest = True
                findings.extend(self._audit_cargo(path, text, skipped_reasons))
            elif lower.endswith("gemfile"):
                saw_manifest = True
                findings.extend(self._audit_gemfile(path, text, skipped_reasons))
            elif lower.endswith(".csproj"):
                saw_manifest = True
                findings.extend(self._audit_csproj(path, text, skipped_reasons))

        if not saw_manifest:
            return DependencyAuditReport(status="skipped", skipped_reason="No supported dependency manifest was emitted.")
        if skipped_reasons and not findings:
            return DependencyAuditReport(status="skipped", skipped_reason="; ".join(sorted(set(skipped_reasons))))
        failed = any(f.status in {"missing", "outdated", "vulnerable"} for f in findings)
        return DependencyAuditReport(status="failed" if failed else "passed", findings=findings)

    def _audit_requirements(self, path: str, text: str, skipped: list[str]) -> list[DependencyFinding]:
        findings: list[DependencyFinding] = []
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or stripped.startswith("-"):
                continue
            match = _REQ_RE.match(stripped)
            if not match:
                continue
            name, requested = match.group(1), match.group(2)
            if not _SAFE_NAME_RE.match(name):
                continue
            lookup = self.latest_pypi(name)
            findings.append(self._finding("pypi", name, requested, lookup, path, skipped))
        return findings

    def _audit_package_json(self, path: str, text: str, skipped: list[str]) -> list[DependencyFinding]:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return [
                DependencyFinding(
                    ecosystem="npm",
                    name="package.json",
                    requested_version=None,
                    latest_version=None,
                    status="missing",
                    message="package.json is not valid JSON.",
                    manifest_path=path,
                )
            ]
        findings: list[DependencyFinding] = []
        for section in ["dependencies", "devDependencies", "peerDependencies"]:
            deps = data.get(section) or {}
            if not isinstance(deps, dict):
                continue
            for name, requested in deps.items():
                if not isinstance(name, str) or not _SAFE_NAME_RE.match(name):
                    continue
                lookup = self.latest_npm(name)
                findings.append(self._finding("npm", name, str(requested), lookup, path, skipped))
        return findings

    def _audit_pom(self, path: str, text: str, skipped: list[str]) -> list[DependencyFinding]:
        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            return [
                DependencyFinding(
                    ecosystem="maven",
                    name="pom.xml",
                    requested_version=None,
                    latest_version=None,
                    status="missing",
                    message="pom.xml is not valid XML.",
                    manifest_path=path,
                )
            ]

        findings: list[DependencyFinding] = []
        for dep in root.findall(".//{*}dependency"):
            group = self._xml_text(dep, "groupId")
            artifact = self._xml_text(dep, "artifactId")
            version = self._xml_text(dep, "version")
            if not group or not artifact:
                continue
            if not version:
                findings.append(
                    DependencyFinding(
                        ecosystem="maven",
                        name=f"{group}:{artifact}",
                        requested_version=None,
                        latest_version=None,
                        status="managed",
                        message="Dependency version is managed by the Maven parent or dependencyManagement.",
                        manifest_path=path,
                    )
                )
                continue
            lookup = self.latest_maven(group, artifact)
            findings.append(self._finding("maven", f"{group}:{artifact}", version, lookup, path, skipped))
        return findings

    def _audit_composer(self, path: str, text: str, skipped: list[str]) -> list[DependencyFinding]:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return [
                DependencyFinding(
                    ecosystem="packagist", name="composer.json", requested_version=None,
                    latest_version=None, status="missing",
                    message="composer.json is not valid JSON.", manifest_path=path,
                )
            ]
        findings: list[DependencyFinding] = []
        for section in ["require", "require-dev"]:
            deps = data.get(section) or {}
            if not isinstance(deps, dict):
                continue
            for name, requested in deps.items():
                # "php" and "ext-*" are platform/runtime requirements, not packagist packages.
                if not isinstance(name, str) or name == "php" or name.startswith("ext-"):
                    continue
                if not _SAFE_NAME_RE.match(name):
                    continue
                lookup = self.latest_packagist(name)
                findings.append(self._finding("packagist", name, str(requested), lookup, path, skipped))
        return findings

    def _audit_go_mod(self, path: str, text: str, skipped: list[str]) -> list[DependencyFinding]:
        findings: list[DependencyFinding] = []
        in_require_block = False
        for raw_line in text.splitlines():
            line = raw_line.split("//", 1)[0].strip()
            if not line:
                continue
            if line == "require (":
                in_require_block = True
                continue
            if in_require_block and line == ")":
                in_require_block = False
                continue
            if line.startswith("require "):
                line = line[len("require "):].strip()
            elif not in_require_block:
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            module, version = parts[0], parts[1]
            if not _SAFE_NAME_RE.match(module):
                continue
            lookup = self.latest_go(module)
            findings.append(self._finding("go", module, version, lookup, path, skipped))
        return findings

    def _audit_cargo(self, path: str, text: str, skipped: list[str]) -> list[DependencyFinding]:
        try:
            data = tomllib.loads(text)
        except tomllib.TOMLDecodeError:
            return [
                DependencyFinding(
                    ecosystem="crates", name="Cargo.toml", requested_version=None,
                    latest_version=None, status="missing",
                    message="Cargo.toml is not valid TOML.", manifest_path=path,
                )
            ]
        findings: list[DependencyFinding] = []
        for section in ["dependencies", "dev-dependencies", "build-dependencies"]:
            deps = data.get(section) or {}
            if not isinstance(deps, dict):
                continue
            for name, spec in deps.items():
                if not isinstance(name, str) or not _SAFE_NAME_RE.match(name):
                    continue
                requested = spec.get("version") if isinstance(spec, dict) else spec
                if not isinstance(requested, str):
                    continue
                lookup = self.latest_crates(name)
                findings.append(self._finding("crates", name, requested, lookup, path, skipped))
        return findings

    def _audit_gemfile(self, path: str, text: str, skipped: list[str]) -> list[DependencyFinding]:
        findings: list[DependencyFinding] = []
        gem_re = re.compile(r"""^\s*gem\s+['"]([A-Za-z0-9_.-]+)['"](?:\s*,\s*['"]([^'"]+)['"])?""")
        for line in text.splitlines():
            match = gem_re.match(line)
            if not match:
                continue
            name, requested = match.group(1), match.group(2)
            if not _SAFE_NAME_RE.match(name):
                continue
            lookup = self.latest_rubygems(name)
            findings.append(self._finding("rubygems", name, requested, lookup, path, skipped))
        return findings

    def _audit_csproj(self, path: str, text: str, skipped: list[str]) -> list[DependencyFinding]:
        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            return [
                DependencyFinding(
                    ecosystem="nuget", name=".csproj", requested_version=None,
                    latest_version=None, status="missing",
                    message=".csproj is not valid XML.", manifest_path=path,
                )
            ]
        findings: list[DependencyFinding] = []
        for ref in root.findall(".//{*}PackageReference"):
            name = ref.get("Include")
            version = ref.get("Version") or self._xml_text(ref, "Version")
            if not name or not _SAFE_NAME_RE.match(name):
                continue
            if not version:
                findings.append(
                    DependencyFinding(
                        ecosystem="nuget", name=name, requested_version=None, latest_version=None,
                        status="managed", message="Dependency version is managed centrally (Directory.Packages.props).",
                        manifest_path=path,
                    )
                )
                continue
            lookup = self.latest_nuget(name)
            findings.append(self._finding("nuget", name, version, lookup, path, skipped))
        return findings

    def _finding(
        self,
        ecosystem: str,
        name: str,
        requested: str | None,
        lookup: VersionLookup,
        path: str,
        skipped: list[str],
    ) -> DependencyFinding:
        if lookup.skipped_reason:
            skipped.append(lookup.skipped_reason)
            return DependencyFinding(
                ecosystem=ecosystem, name=name, requested_version=requested,
                latest_version=None, status="skipped",
                message=f"Registry lookup skipped: {lookup.skipped_reason}.",
                manifest_path=path,
            )
        if not lookup.latest_version:
            return DependencyFinding(
                ecosystem=ecosystem, name=name, requested_version=requested,
                latest_version=None, status="missing",
                message="Dependency was not found in the registry.",
                manifest_path=path,
            )
        normalized = self._normalize_requested(requested)
        status = "current" if normalized == lookup.latest_version else "outdated"
        message = (
            "Dependency is current."
            if status == "current"
            else f"Dependency version differs from latest registry version {lookup.latest_version}."
        )
        # CVE check: real, regardless of whether the requested version happens to
        # also be "current" -- a package can be the newest release and STILL carry
        # a disclosed, unpatched vulnerability. Checked against the exact requested
        # (installed) version, not "latest", since that's what actually ships.
        vulns = self.vulnerabilities_for(ecosystem, name, normalized)
        if vulns:
            status = "vulnerable"
            worst = max(vulns, key=lambda v: _SEVERITY_RANK.get(v.severity, 0))
            ids = ", ".join(sorted({v.id for v in vulns})[:5])
            message = f"{len(vulns)} known vulnerability(ies) in {name}@{requested} (worst: {worst.severity}, {ids})."
        return DependencyFinding(
            ecosystem=ecosystem,
            name=name,
            requested_version=requested,
            latest_version=lookup.latest_version,
            status=status,
            message=message,
            manifest_path=path,
            vulnerabilities=vulns,
        )

    def vulnerabilities_for(self, ecosystem: str, name: str, version: str | None) -> list[VulnerabilityFinding]:
        """Real, structured CVE/GHSA data from OSV.dev (the aggregator GitHub
        Advisory/PyPA/RustSec/Go vuln DB/etc. all feed into) for the EXACT
        requested version -- never a curated table, never invented. Fails open
        (empty list) on any network/parsing problem or unmapped ecosystem: a CVE
        check that can't reach the network must never block a pipeline on its own."""
        osv_ecosystem = _OSV_ECOSYSTEM.get(ecosystem)
        if not osv_ecosystem or not version or get_settings().force_mock:
            return []
        key = ("osv", ecosystem, name.lower(), version)
        if key not in self._vuln_cache:
            self._vuln_cache[key] = self._query_osv(osv_ecosystem, name, version)
        return self._vuln_cache[key]

    def _query_osv(self, osv_ecosystem: str, name: str, version: str) -> list[VulnerabilityFinding]:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    "https://api.osv.dev/v1/query",
                    json={"package": {"name": name, "ecosystem": osv_ecosystem}, "version": version},
                )
                response.raise_for_status()
                vulns = response.json().get("vulns") or []
        except httpx.HTTPError:
            return []  # network/registry hiccup -- never block a pipeline on OSV being down
        out: list[VulnerabilityFinding] = []
        for vuln in vulns:
            if not isinstance(vuln, dict) or not vuln.get("id"):
                continue
            severity = self._osv_severity(vuln)
            references = vuln.get("references") or []
            url = next((str(r.get("url")) for r in references if isinstance(r, dict) and r.get("url")), "")
            out.append(VulnerabilityFinding(
                id=str(vuln["id"]),
                aliases=[str(a) for a in (vuln.get("aliases") or []) if isinstance(a, str)],
                summary=str(vuln.get("summary") or vuln.get("details") or "")[:500],
                severity=severity,
                url=url,
            ))
        return out

    @staticmethod
    def _osv_severity(vuln: dict[str, Any]) -> str:
        # OSV carries severity two ways: a simple GitHub-style band in
        # database_specific.severity (most GHSA entries), or a raw CVSS vector
        # string under severity[] (score-only, no precomputed band) -- fall back
        # to parsing the CVSS base score into the same LOW/MODERATE/HIGH/CRITICAL
        # bands GitHub itself uses, rather than reporting UNKNOWN whenever GitHub
        # didn't set the simple field.
        band = str((vuln.get("database_specific") or {}).get("severity") or "").upper()
        if band in {"CRITICAL", "HIGH", "MODERATE", "LOW"}:
            return band
        for entry in vuln.get("severity") or []:
            score = str((entry or {}).get("score") or "")
            match = re.search(r"(\d+\.\d+)$", score) or re.search(r"^(\d+(?:\.\d+)?)$", score)
            if not match:
                continue
            value = float(match.group(1))
            if value >= 9.0:
                return "CRITICAL"
            if value >= 7.0:
                return "HIGH"
            if value >= 4.0:
                return "MODERATE"
            return "LOW"
        return "UNKNOWN"

    def _cached(self, ecosystem: str, name: str, fn) -> VersionLookup:
        key = (ecosystem, name.lower())
        if key not in self._cache:
            self._cache[key] = fn()
        return self._cache[key]

    def _latest_pypi(self, package: str) -> VersionLookup:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(f"https://pypi.org/pypi/{package}/json")
                if response.status_code == 404:
                    return VersionLookup("pypi", package, None)
                response.raise_for_status()
                return VersionLookup("pypi", package, response.json().get("info", {}).get("version"))
        except httpx.HTTPError as exc:
            return VersionLookup("pypi", package, None, str(exc))

    def _latest_npm(self, package: str) -> VersionLookup:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(f"https://registry.npmjs.org/{package}")
                if response.status_code == 404:
                    return VersionLookup("npm", package, None)
                response.raise_for_status()
                latest = response.json().get("dist-tags", {}).get("latest")
                return VersionLookup("npm", package, latest)
        except httpx.HTTPError as exc:
            return VersionLookup("npm", package, None, str(exc))

    def _latest_maven(self, group: str, artifact: str) -> VersionLookup:
        name = f"{group}:{artifact}"
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(
                    "https://search.maven.org/solrsearch/select",
                    params={"q": f'g:"{group}" AND a:"{artifact}"', "rows": 1, "wt": "json"},
                )
                response.raise_for_status()
                docs = response.json().get("response", {}).get("docs", [])
                latest = docs[0].get("latestVersion") if docs else None
                return VersionLookup("maven", name, latest)
        except httpx.HTTPError as exc:
            return VersionLookup("maven", name, None, str(exc))

    def _latest_packagist(self, package: str) -> VersionLookup:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(f"https://repo.packagist.org/p2/{package}.json")
                if response.status_code == 404:
                    return VersionLookup("packagist", package, None)
                response.raise_for_status()
                versions = response.json().get("packages", {}).get(package, [])
                latest = versions[0].get("version") if versions else None
                return VersionLookup("packagist", package, latest)
        except httpx.HTTPError as exc:
            return VersionLookup("packagist", package, None, str(exc))

    def _latest_crates(self, package: str) -> VersionLookup:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(f"https://crates.io/api/v1/crates/{package}")
                if response.status_code == 404:
                    return VersionLookup("crates", package, None)
                response.raise_for_status()
                crate = response.json().get("crate", {})
                return VersionLookup("crates", package, crate.get("max_stable_version") or crate.get("newest_version"))
        except httpx.HTTPError as exc:
            return VersionLookup("crates", package, None, str(exc))

    def _latest_rubygems(self, package: str) -> VersionLookup:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(f"https://rubygems.org/api/v1/gems/{package}.json")
                if response.status_code == 404:
                    return VersionLookup("rubygems", package, None)
                response.raise_for_status()
                return VersionLookup("rubygems", package, response.json().get("version"))
        except httpx.HTTPError as exc:
            return VersionLookup("rubygems", package, None, str(exc))

    def _latest_nuget(self, package: str) -> VersionLookup:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(f"https://api.nuget.org/v3-flatcontainer/{package.lower()}/index.json")
                if response.status_code == 404:
                    return VersionLookup("nuget", package, None)
                response.raise_for_status()
                versions = response.json().get("versions") or []
                return VersionLookup("nuget", package, versions[-1] if versions else None)
        except httpx.HTTPError as exc:
            return VersionLookup("nuget", package, None, str(exc))

    def _latest_go(self, module: str) -> VersionLookup:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(f"https://proxy.golang.org/{module.lower()}/@latest")
                if response.status_code in {404, 410}:
                    return VersionLookup("go", module, None)
                response.raise_for_status()
                return VersionLookup("go", module, response.json().get("Version"))
        except httpx.HTTPError as exc:
            return VersionLookup("go", module, None, str(exc))

    @staticmethod
    def _xml_text(node: ET.Element, child: str) -> str | None:
        found = node.find(f"{{*}}{child}")
        if found is None or found.text is None:
            return None
        return found.text.strip() or None

    @staticmethod
    def _normalize_requested(version: str | None) -> str | None:
        if not version:
            return None
        return version.strip().lstrip("^~=> <")


dependency_research_service = DependencyResearchService()
