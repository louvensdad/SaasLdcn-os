from __future__ import annotations

import json

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


# Regression: audit_manifest() dispatched to _audit_csproj/_audit_go_mod/_audit_cargo/
# _audit_gemfile/_audit_composer, but none of those five methods were ever defined --
# any non-Python/Node/Java backend crashed the build stage with an AttributeError
# (caught live: 'DependencyResearchService' object has no attribute '_audit_csproj'
# on a real .NET generation job's BUILD_RUNNING stage).

def test_audit_csproj_reports_outdated_without_network(monkeypatch):
    service = DependencyResearchService()
    monkeypatch.setattr(service, "latest_nuget", lambda name: VersionLookup("nuget", name, "9.0.0"))

    report = service.audit_manifest([
        {
            "relative_path": "src/Api/Api.csproj",
            "content": (
                '<Project Sdk="Microsoft.NET.Sdk.Web">'
                '<ItemGroup>'
                '<PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.0" />'
                '</ItemGroup></Project>'
            ),
        },
    ])

    assert report.status == "failed"
    assert report.findings[0].ecosystem == "nuget"
    assert report.findings[0].name == "Microsoft.EntityFrameworkCore"
    assert report.findings[0].status == "outdated"


def test_audit_csproj_invalid_xml_is_reported_not_raised():
    service = DependencyResearchService()
    report = service.audit_manifest([
        {"relative_path": "src/Api/Api.csproj", "content": "<Project><Unclosed"},
    ])
    assert report.status == "failed"
    assert report.findings[0].status == "missing"


def test_audit_go_mod_reports_outdated_without_network(monkeypatch):
    service = DependencyResearchService()
    monkeypatch.setattr(service, "latest_go", lambda module: VersionLookup("go", module, "v1.10.0"))

    go_mod = (
        "module example.com/api\n\n"
        "go 1.21\n\n"
        "require (\n"
        "\tgithub.com/gin-gonic/gin v1.9.1\n"
        "\tgolang.org/x/text v0.14.0 // indirect\n"
        ")\n"
    )
    report = service.audit_manifest([{"relative_path": "go.mod", "content": go_mod}])

    assert report.status == "failed"
    names = {f.name for f in report.findings}
    assert names == {"github.com/gin-gonic/gin", "golang.org/x/text"}


def test_audit_cargo_reports_outdated_without_network(monkeypatch):
    service = DependencyResearchService()
    monkeypatch.setattr(service, "latest_crates", lambda name: VersionLookup("crates", name, "2.0.0"))

    cargo_toml = (
        "[package]\nname = \"api\"\nversion = \"0.1.0\"\n\n"
        "[dependencies]\naxum = \"1.0.0\"\nserde = { version = \"1.0.0\", features = [\"derive\"] }\n"
    )
    report = service.audit_manifest([{"relative_path": "Cargo.toml", "content": cargo_toml}])

    assert report.status == "failed"
    names = {f.name for f in report.findings}
    assert names == {"axum", "serde"}


def test_audit_gemfile_reports_outdated_without_network(monkeypatch):
    service = DependencyResearchService()
    monkeypatch.setattr(service, "latest_rubygems", lambda name: VersionLookup("rubygems", name, "8.0.0"))

    gemfile = "source 'https://rubygems.org'\n\ngem 'rails', '~> 7.0'\ngem \"puma\"\n"
    report = service.audit_manifest([{"relative_path": "Gemfile", "content": gemfile}])

    assert report.status == "failed"
    names = {f.name for f in report.findings}
    assert names == {"rails", "puma"}


def test_audit_composer_reports_outdated_without_network(monkeypatch):
    service = DependencyResearchService()
    monkeypatch.setattr(service, "latest_packagist", lambda name: VersionLookup("packagist", name, "12.0.0"))

    composer_json = json.dumps({
        "require": {"php": "^8.2", "laravel/framework": "^11.0"},
        "require-dev": {"phpunit/phpunit": "^10.0"},
    })
    report = service.audit_manifest([{"relative_path": "composer.json", "content": composer_json}])

    assert report.status == "failed"
    names = {f.name for f in report.findings}
    # "php" is a runtime constraint, not a packagist package -- must be skipped.
    assert names == {"laravel/framework", "phpunit/phpunit"}


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
