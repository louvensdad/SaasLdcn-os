from __future__ import annotations

from app.engines.quality_gate_engine import QualityGateEngine
from app.schemas.generation_validation import DependencyAuditReport, DependencyFinding, VulnerabilityFinding
from app.services.dependency_research_service import DependencyResearchService, VersionLookup


def _vuln(id_="GHSA-xxxx", severity="HIGH", aliases=None) -> VulnerabilityFinding:
    return VulnerabilityFinding(id=id_, aliases=aliases or ["CVE-2024-0001"], summary="test vuln", severity=severity)


def test_finding_reports_vulnerable_status_when_osv_finds_a_match(monkeypatch):
    service = DependencyResearchService()
    monkeypatch.setattr(service, "vulnerabilities_for", lambda ecosystem, name, version: [_vuln()])

    report = service.audit_manifest([
        {"relative_path": "package.json", "content": '{"dependencies":{"lodash":"4.17.15"}}'},
    ])

    assert report.status == "failed"
    finding = report.findings[0]
    assert finding.status == "vulnerable"
    assert finding.vulnerabilities[0].id == "GHSA-xxxx"
    assert "CVE-2024-0001" in finding.message or "GHSA-xxxx" in finding.message


def test_finding_stays_current_when_no_vulnerabilities_found(monkeypatch):
    service = DependencyResearchService()
    monkeypatch.setattr(service, "vulnerabilities_for", lambda ecosystem, name, version: [])
    monkeypatch.setattr(service, "latest_npm", lambda name: VersionLookup("npm", name, "4.17.15"))

    report = service.audit_manifest([
        {"relative_path": "package.json", "content": '{"dependencies":{"lodash":"4.17.15"}}'},
    ])

    assert report.findings[0].status == "current"
    assert report.findings[0].vulnerabilities == []


def test_vulnerabilities_for_returns_empty_for_unmapped_ecosystem_or_missing_version():
    service = DependencyResearchService()
    assert service.vulnerabilities_for("unknown-ecosystem", "x", "1.0.0") == []
    assert service.vulnerabilities_for("npm", "x", None) == []


def test_query_osv_fails_open_on_network_error(monkeypatch):
    service = DependencyResearchService()

    class _BoomClient:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, *a, **k):
            import httpx
            raise httpx.ConnectError("boom")

    monkeypatch.setattr("app.services.dependency_research_service.httpx.Client", lambda **k: _BoomClient())

    assert service._query_osv("npm", "left-pad", "1.0.0") == []


def test_osv_severity_prefers_database_specific_band():
    assert DependencyResearchService._osv_severity({"database_specific": {"severity": "critical"}}) == "CRITICAL"


def test_osv_severity_falls_back_to_cvss_score_parsing():
    high = {"severity": [{"type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/7.5"}]}
    assert DependencyResearchService._osv_severity(high) == "HIGH"


def test_osv_severity_unknown_when_no_severity_data_at_all():
    assert DependencyResearchService._osv_severity({}) == "UNKNOWN"


def test_quality_gate_maps_critical_vulnerability_to_blocker(monkeypatch):
    import app.engines.quality_gate_engine as gate_module

    finding = DependencyFinding(
        ecosystem="npm", name="lodash", requested_version="4.17.15", latest_version="4.17.21",
        status="vulnerable", message="1 known vulnerability(ies) in lodash@4.17.15 (worst: CRITICAL, GHSA-xxxx).",
        manifest_path="package.json", vulnerabilities=[_vuln(severity="CRITICAL")],
    )
    project = {"project_id": "p1", "generated_project_path": None}
    quality = {"checks": [], "warnings": [], "missing_files": [], "security_findings": [], "score": 50}
    engine = QualityGateEngine()

    # Exercise the real code path through evaluate()'s dependency branch by
    # monkeypatching generation_validation_engine.validate() to return our finding.
    from app.schemas.generation_validation import BuildValidationReport, GenerationValidationReport

    synthetic = GenerationValidationReport(
        project_id="p1", score=50, passed=False, quality=quality, security_findings=[],
        dependency_audit=DependencyAuditReport(status="failed", findings=[finding]),
        build=BuildValidationReport(installed="passed", built="passed", ok=True),
    )
    monkeypatch.setattr(gate_module.generation_validation_engine, "validate", lambda _project: synthetic)

    result = engine.evaluate(project, run_build=True)
    issue = next(i for i in result.issues if i.id.startswith("dependency_cve:"))
    assert issue.severity == "BLOCKER"
    assert "GHSA-xxxx" in issue.suggested_fix


def test_quality_gate_maps_low_severity_vulnerability_to_warning(monkeypatch):
    import app.engines.quality_gate_engine as gate_module
    from app.schemas.generation_validation import BuildValidationReport, GenerationValidationReport

    finding = DependencyFinding(
        ecosystem="npm", name="left-pad", requested_version="1.0.0", latest_version="1.0.0",
        status="vulnerable", message="1 known vulnerability(ies) in left-pad@1.0.0 (worst: LOW, GHSA-yyyy).",
        manifest_path="package.json", vulnerabilities=[_vuln(id_="GHSA-yyyy", severity="LOW")],
    )
    project = {"project_id": "p2", "generated_project_path": None}
    quality = {"checks": [], "warnings": [], "missing_files": [], "security_findings": [], "score": 80}
    synthetic = GenerationValidationReport(
        project_id="p2", score=80, passed=True, quality=quality, security_findings=[],
        dependency_audit=DependencyAuditReport(status="failed", findings=[finding]),
        build=BuildValidationReport(installed="passed", built="passed", ok=True),
    )
    monkeypatch.setattr(gate_module.generation_validation_engine, "validate", lambda _project: synthetic)

    result = QualityGateEngine().evaluate(project, run_build=True)
    issue = next(i for i in result.issues if i.id.startswith("dependency_cve:"))
    assert issue.severity == "WARNING"


def test_osv_live_flags_a_known_vulnerable_lodash_version():
    """Real network call to OSV.dev -- lodash 4.17.15 has long-published, stable
    GHSA advisories (ReDoS, prototype pollution). Confirms the wiring actually
    talks to the real API and parses a real response, not just mocked shapes."""
    service = DependencyResearchService()
    vulns = service.vulnerabilities_for("npm", "lodash", "4.17.15")
    assert len(vulns) > 0
    assert all(v.id for v in vulns)
    assert any(v.severity in {"LOW", "MODERATE", "HIGH", "CRITICAL"} for v in vulns)
