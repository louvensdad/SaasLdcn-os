from __future__ import annotations

from app.services.dependency_research_service import DependencyResearchService, VersionLookup


def test_audit_requirements_reports_outdated_without_network(monkeypatch):
    service = DependencyResearchService()

    monkeypatch.setattr(
        service,
        "latest_pypi",
        lambda name: VersionLookup("pypi", name, "0.116.0"),
    )

    report = service.audit_manifest([
        {"relative_path": "requirements.txt", "content": b"fastapi==0.115.0\n"},
    ])

    assert report.status == "failed"
    assert report.findings[0].name == "fastapi"
    assert report.findings[0].status == "outdated"
    assert report.findings[0].latest_version == "0.116.0"


def test_core_versions_degrades_when_registry_lookup_skips(monkeypatch):
    service = DependencyResearchService()
    monkeypatch.setattr(
        service,
        "latest_pypi",
        lambda name: VersionLookup("pypi", name, None, "offline"),
    )

    stack = type("Stack", (), {"framework": "fastapi", "language": "python", "runtime": "python"})()
    block = service.core_versions(stack)

    assert "Verified current dependency versions" in block
    assert "skipped (offline)" in block
