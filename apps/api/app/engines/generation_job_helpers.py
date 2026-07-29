from __future__ import annotations

import json
import re
from typing import Any

JAVA_RESERVED_PACKAGE_SEGMENTS = frozenset({
    "abstract", "assert", "boolean", "break", "byte", "case", "catch",
    "char", "class", "const", "continue", "default", "do", "double",
    "else", "enum", "extends", "final", "finally", "float", "for",
    "goto", "if", "implements", "import", "instanceof", "int", "interface",
    "long", "native", "new", "package", "private", "protected", "public",
    "return", "short", "static", "strictfp", "super", "switch",
    "synchronized", "this", "throw", "throws", "transient", "try", "void",
    "volatile", "while", "true", "false", "null", "record", "sealed",
    "permits", "non-sealed", "var", "yield",
})

def ensure_maven_dependencies_for_imports(path: str, content: str, latest: dict[str, str]) -> str:
    if not path.endswith("pom.xml") or "<dependencies>" not in content:
        return content
    module_prefix = "" if path == "pom.xml" else path.rsplit("/", 1)[0] + "/"
    sources = "\n".join(
        source for source_path, source in latest.items()
        if source_path.startswith(module_prefix) and source_path.endswith(".java")
    )
    snippets = [
        ("spring-boot-starter-data-jpa", ("jakarta.persistence", "org.springframework.data.jpa", "org.springframework.data.annotation"), """
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>"""),
        ("spring-boot-starter-amqp", ("org.springframework.amqp",), """
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-amqp</artifactId>
    </dependency>"""),
        ("springdoc-openapi-starter-webmvc-ui", ("io.swagger.v3.oas.models",), """
    <dependency>
        <groupId>org.springdoc</groupId>
        <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
        <version>2.3.0</version>
    </dependency>"""),
        ("jjwt-api", ("io.jsonwebtoken",), """
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-api</artifactId>
        <version>0.11.5</version>
    </dependency>
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-impl</artifactId>
        <version>0.11.5</version>
        <scope>runtime</scope>
    </dependency>
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-jackson</artifactId>
        <version>0.11.5</version>
        <scope>runtime</scope>
    </dependency>"""),
        ("bucket4j-core", ("io.github.bucket4j",), """
    <dependency>
        <groupId>com.bucket4j</groupId>
        <artifactId>bucket4j-core</artifactId>
        <version>8.7.0</version>
    </dependency>"""),
    ]
    additions: list[str] = []
    for marker, import_prefixes, snippet in snippets:
        if marker in content or marker in "\n".join(additions):
            continue
        if any(import_prefix in sources for import_prefix in import_prefixes):
            additions.append(snippet)
    if not additions:
        return content
    return content.replace("</dependencies>", "\n" + "\n".join(additions) + "\n    </dependencies>", 1)
def normalize_build_files(latest: dict[str, str]) -> dict[str, str]:
    """Repair cross-agent file inconsistencies before publishing/building."""
    normalized = dict(latest)
    root_pom = normalized.get("pom.xml")
    if root_pom and "<modules>" in root_pom:
        module_dirs = sorted({
            path.split("/", 1)[0]
            for path in normalized
            if "/" in path
            and path.endswith("/pom.xml")
            and path.count("/") == 1
            and not path.startswith(("node_modules/", ".next/"))
        })
        if module_dirs:
            modules_xml = "\n".join(f"        <module>{module}</module>" for module in module_dirs)
            root_pom = re.sub(
                r"(?s)\s*<modules>.*?</modules>",
                f"\n    <modules>\n{modules_xml}\n    </modules>",
                root_pom,
                count=1,
            )
            normalized["pom.xml"] = root_pom
    for path, content in list(normalized.items()):
        if path.endswith("pom.xml"):
            normalized[path] = ensure_maven_dependencies_for_imports(path, content, normalized)
    return normalized
def sanitize_java_reserved_package_segments(name: str, content: str) -> tuple[str, str, bool]:
    """Repair Java package path/declaration segments that are reserved words.

    Providers still occasionally emit Clean Architecture folders like
    ``.../interface/...`` and a matching ``package ...interface...``. That is
    invalid Java, so repair the artifact before it reaches build/publish.
    """
    if not name.lower().endswith(".java"):
        return name, content, False

    repaired = False

    def safe_segment(segment: str) -> str:
        nonlocal repaired
        if segment in JAVA_RESERVED_PACKAGE_SEGMENTS:
            repaired = True
            return f"{segment}_"
        return segment

    safe_name = "/".join(safe_segment(part) for part in name.split("/"))

    def repair_package(match: re.Match[str]) -> str:
        prefix, package_name, wildcard, suffix = match.groups()
        safe_package = ".".join(safe_segment(part) for part in package_name.split("."))
        return f"{prefix}{safe_package}{wildcard or ''}{suffix}"

    repaired_content = re.sub(
        r"(?m)^(\s*(?:package|import)\s+)([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)(\.\*)?(\s*;)",
        repair_package,
        content,
    )
    return safe_name, repaired_content, repaired
def merge_package_json(previous: str, current: str) -> str:
    """Union dependencies/scripts from an earlier stage's package.json into
    the later stage's, instead of the later one silently replacing it. Falls
    back to `current` unchanged if either side doesn't parse as a JSON
    object — publishing whatever the pipeline actually produced is safer
    than raising mid-build over a merge nicety."""
    try:
        before = json.loads(previous)
        after = json.loads(current)
    except json.JSONDecodeError:
        return current
    if not isinstance(before, dict) or not isinstance(after, dict):
        return current
    for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "scripts"):
        before_section = before.get(section)
        if not isinstance(before_section, dict):
            continue
        after_section = after.get(section)
        merged = dict(before_section)
        if isinstance(after_section, dict):
            merged.update(after_section)  # later stage wins on an exact key collision
        after[section] = merged
    return json.dumps(after, indent=2, ensure_ascii=False) + "\n"

def merge_tsconfig_json(previous: str, current: str) -> str:
    """Union compilerOptions from an earlier stage's tsconfig.json into the
    later stage's, instead of the later one silently replacing it — same
    collision and fix shape as _merge_package_json. Any key only the
    earlier stage set (e.g. a NestJS backend's "experimentalDecorators")
    survives untouched; the later stage's value wins on an exact key
    collision. Falls back to `current` unchanged if either side doesn't
    parse as a JSON object."""
    try:
        before = json.loads(previous)
        after = json.loads(current)
    except json.JSONDecodeError:
        return current
    if not isinstance(before, dict) or not isinstance(after, dict):
        return current
    before_options = before.get("compilerOptions")
    if isinstance(before_options, dict):
        after_options = after.get("compilerOptions")
        merged = dict(before_options)
        if isinstance(after_options, dict):
            merged.update(after_options)
        after["compilerOptions"] = merged
    return json.dumps(after, indent=2, ensure_ascii=False) + "\n"
