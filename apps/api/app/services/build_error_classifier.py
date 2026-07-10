from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from typing import Any
from urllib.parse import unquote

# BuildErrorClassifier: turns a raw install/build log into a typed error with a
# root cause and a suggested (possibly automatic) fix. This is what lets the
# Build Auto-Repair loop decide WHICH deterministic patch to apply instead of
# blindly re-running a command that will fail the same way.

# npm E404 shapes for a nonexistent package (LLM agents occasionally invent names,
# e.g. "@radix-ui/react-badge"). Both the human line and the GET URL are matched so
# the classification works across npm versions.
NPM_MISSING_SPEC_RE = re.compile(r"The requested resource '([^']+)' could not be found")
NPM_MISSING_URL_RE = re.compile(r"404\s+Not Found\s+-\s+GET\s+https://registry\.npmjs\.org/(\S+)")
_NPM_ETARGET_RE = re.compile(r"No matching version found for (\S+?)@?([^\s.]*)\.?(?:\s|$)")
_NPM_ETARGET_SPEC_RE = re.compile(r"notarget No matching version found for (\S+)")
_TS_ERROR_RE = re.compile(r"error TS\d+:")
_MODULE_NOT_FOUND_RE = re.compile(
    r"Cannot find module '([^']+)'"
    # Webpack/Next's own message is "Module not found: Can't resolve '<name>'" -
    # anchoring on "resolve" (not just any quote) matters because a lazy
    # quote-to-quote match would stop at the apostrophe in "Can't" itself and
    # capture the wrong substring (e.g. "t resolve " instead of the real
    # package name), silently feeding a garbage name into the auto-repair loop.
    r"|Module not found:.*?resolve\s+['\"]([^'\"]+)['\"]"
)
_MISSING_SCRIPT_RE = re.compile(r"[Mm]issing script:?\s*\"?([A-Za-z0-9:_-]+)\"?")
_ENOENT_FILE_RE = re.compile(r"ENOENT[:,].*?open\s+'([^']+)'|ENOENT[:,].*?no such file or directory,?\s*(?:open\s+)?'?([^'\n]+)'?")
_INVALID_NAME_RE = re.compile(r"Invalid (?:package )?name\s*:?\s*\"?([^\"\n]+)\"?", re.IGNORECASE)

# javac's "package X does not exist" names the exact import path a Maven module
# failed to resolve - the Java-side equivalent of npm's "Module not found".
_JAVA_PACKAGE_NOT_EXIST_RE = re.compile(r"package ([\w.]+) does not exist")

# Curated import-prefix -> Maven coordinate map (longest-prefix match; see
# resolve_java_import). Spring Boot starters need no <version>: they're pinned by
# spring-boot-starter-parent's dependencyManagement BOM, same as every service
# pom.xml in a generated project already declares them. Third-party libraries
# (JWT, OpenAPI, rate limiting) aren't in that BOM, so the repair step resolves
# their latest version from Maven Central before adding them.
JAVA_PACKAGE_TO_ARTIFACT: dict[str, tuple[str, str, bool]] = {
    # import prefix: (groupId, artifactId, needs_explicit_version)
    "jakarta.persistence": ("org.springframework.boot", "spring-boot-starter-data-jpa", False),
    "org.springframework.data.jpa": ("org.springframework.boot", "spring-boot-starter-data-jpa", False),
    "org.springframework.data.annotation": ("org.springframework.boot", "spring-boot-starter-data-jpa", False),
    "org.springframework.data.redis": ("org.springframework.boot", "spring-boot-starter-data-redis", False),
    "org.springframework.data.mongodb": ("org.springframework.boot", "spring-boot-starter-data-mongodb", False),
    "org.springframework.amqp": ("org.springframework.boot", "spring-boot-starter-amqp", False),
    "org.springframework.kafka": ("org.springframework.kafka", "spring-kafka", False),
    "org.springframework.security": ("org.springframework.boot", "spring-boot-starter-security", False),
    "org.springframework.validation": ("org.springframework.boot", "spring-boot-starter-validation", False),
    "jakarta.validation": ("org.springframework.boot", "spring-boot-starter-validation", False),
    "org.springframework.web": ("org.springframework.boot", "spring-boot-starter-web", False),
    "org.springframework.mail": ("org.springframework.boot", "spring-boot-starter-mail", False),
    "io.jsonwebtoken": ("io.jsonwebtoken", "jjwt-api", True),
    "io.swagger.v3": ("org.springdoc", "springdoc-openapi-starter-webmvc-ui", True),
    "io.github.bucket4j": ("com.bucket4j", "bucket4j-core", True),
    "org.mapstruct": ("org.mapstruct", "mapstruct", True),
}


def resolve_java_import(java_package: str) -> tuple[str, str, bool] | None:
    """Longest-prefix match of a Java import path against JAVA_PACKAGE_TO_ARTIFACT."""
    parts = java_package.split(".")
    for i in range(len(parts), 0, -1):
        coord = JAVA_PACKAGE_TO_ARTIFACT.get(".".join(parts[:i]))
        if coord is not None:
            return coord
    return None


@dataclass(frozen=True)
class ClassifiedBuildError:
    code: str
    message: str  # one-line human summary (pt-BR, shown in the UI)
    root_cause: str
    suggested_fix: str
    package: str | None = None  # the offending npm package/module, when identified
    auto_fixable: bool = False
    # Peer-conflict diagnosis (Stack Compatibility Engine): conflicting package,
    # current version, required version, suggested compatible version, impact.
    conflict: dict[str, Any] | None = field(default=None)

    def with_conflict(self, conflict: dict[str, Any], *, message: str | None = None,
                      root_cause: str | None = None, suggested_fix: str | None = None,
                      auto_fixable: bool | None = None) -> "ClassifiedBuildError":
        return replace(
            self,
            conflict=conflict,
            message=message if message is not None else self.message,
            root_cause=root_cause if root_cause is not None else self.root_cause,
            suggested_fix=suggested_fix if suggested_fix is not None else self.suggested_fix,
            auto_fixable=auto_fixable if auto_fixable is not None else self.auto_fixable,
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "root_cause": self.root_cause,
            "suggested_fix": self.suggested_fix,
            "package": self.package,
            "auto_fixable": self.auto_fixable,
            "conflict": self.conflict,
        }


def _first_package_from_e404(logs: str) -> str | None:
    for spec in NPM_MISSING_SPEC_RE.findall(logs):
        # '@scope/name@^1.0.0' -> '@scope/name'; a leading '@' is never a separator.
        return spec.rsplit("@", 1)[0] if spec.rfind("@") > 0 else spec
    for encoded in NPM_MISSING_URL_RE.findall(logs):
        return unquote(encoded).strip("'\"")
    return None


class BuildErrorClassifier:
    """Deterministic log -> typed error classification (no LLM)."""

    def classify(self, logs: str) -> ClassifiedBuildError | None:
        if not logs:
            return None

        if "E404" in logs or NPM_MISSING_SPEC_RE.search(logs) or NPM_MISSING_URL_RE.search(logs):
            package = _first_package_from_e404(logs)
            return ClassifiedBuildError(
                code="npm_package_not_found",
                message=f"Pacote npm inexistente{f': {package}' if package else ''} (E404).",
                root_cause=(
                    f"A dependencia '{package}' foi declarada no package.json mas nao existe no registro npm."
                    if package else "Uma dependencia declarada no package.json nao existe no registro npm."
                ),
                suggested_fix="Remover a dependencia inexistente e substitui-la por um componente local ou por um pacote real.",
                package=package,
                auto_fixable=True,
            )

        if "ETARGET" in logs or "notarget" in logs:
            match = _NPM_ETARGET_SPEC_RE.search(logs) or _NPM_ETARGET_RE.search(logs)
            spec = match.group(1) if match else None
            package = (spec.rsplit("@", 1)[0] if spec and spec.rfind("@") > 0 else spec) if spec else None
            return ClassifiedBuildError(
                code="npm_version_not_found",
                message=f"Versao inexistente de pacote npm{f': {spec}' if spec else ''} (ETARGET).",
                root_cause="A versao pedida no package.json nunca foi publicada no registro npm.",
                suggested_fix="Ajustar a versao para a mais recente publicada no registro.",
                package=package,
                auto_fixable=True,
            )

        if "ERESOLVE" in logs:
            return ClassifiedBuildError(
                code="npm_peer_dependency_conflict",
                message="Conflito de peer dependencies (ERESOLVE).",
                root_cause="Duas dependencias declaradas exigem versoes incompativeis de um mesmo peer.",
                suggested_fix="Ajustar o pacote conflitante para uma versao compativel com a stack travada (Compatibility Matrix).",
                auto_fixable=True,
            )

        if "EBADENGINE" in logs or "Unsupported engine" in logs:
            return ClassifiedBuildError(
                code="unsupported_node_version",
                message="Versao do Node incompativel com uma dependencia (EBADENGINE).",
                root_cause="O campo engines de uma dependencia exige outra versao de Node/npm.",
                suggested_fix="Fixar versoes de dependencias compativeis com o Node do servidor ou atualizar o Node.",
                auto_fixable=False,
            )

        invalid = _INVALID_NAME_RE.search(logs)
        if invalid or "EINVALIDPACKAGENAME" in logs:
            name = invalid.group(1).strip() if invalid else None
            return ClassifiedBuildError(
                code="invalid_package_name",
                message=f"Nome de pacote invalido{f': {name}' if name else ''}.",
                root_cause="O package.json declara um nome que viola as regras de nomes do npm.",
                suggested_fix="Remover ou corrigir o nome invalido no package.json.",
                package=name,
                auto_fixable=True,
            )

        script = _MISSING_SCRIPT_RE.search(logs)
        if script:
            return ClassifiedBuildError(
                code="missing_script",
                message=f"Script npm ausente: {script.group(1)}.",
                root_cause=f"O comando pediu 'npm run {script.group(1)}' mas o package.json nao declara esse script.",
                suggested_fix="Adicionar o script ao package.json ou usar o comando de build correto.",
                auto_fixable=False,
            )

        module = _MODULE_NOT_FOUND_RE.search(logs)
        if module:
            name = module.group(1) or module.group(2)
            local = bool(name) and (name.startswith(".") or name.startswith("/") or name.startswith("@/"))
            return ClassifiedBuildError(
                code="missing_import" if local else "module_not_found",
                message=f"Import nao resolvido: {name}.",
                root_cause=(
                    f"O codigo importa '{name}' mas o arquivo nao foi gerado."
                    if local else
                    f"O codigo importa '{name}' mas o pacote nao esta declarado/instalado."
                ),
                suggested_fix=(
                    "Gerar o arquivo local ausente ou corrigir o import."
                    if local else
                    "Declarar o pacote no package.json (se real) ou trocar por um modulo local."
                ),
                package=None if local else name,
                auto_fixable=not local,
            )

        java_missing = sorted(set(_JAVA_PACKAGE_NOT_EXIST_RE.findall(logs)))
        if java_missing:
            shown = ", ".join(java_missing[:5]) + ("..." if len(java_missing) > 5 else "")
            return ClassifiedBuildError(
                code="maven_dependency_not_found",
                message=f"Dependencia(s) Maven ausente(s): {shown}.",
                root_cause="O modulo Java importa pacote(s) que nao estao declarados como dependencia no pom.xml.",
                suggested_fix="Adicionar a dependencia Maven correspondente ao pom.xml do modulo afetado.",
                package=", ".join(java_missing),
                auto_fixable=True,
            )

        if "[ERROR]" in logs and "cannot find symbol" in logs:
            return ClassifiedBuildError(
                code="java_compile_error",
                message="Erro de compilacao Java (simbolo nao encontrado).",
                root_cause="O codigo Java gerado referencia um simbolo que nao existe ou nao foi importado corretamente.",
                suggested_fix="Revisar os erros do compilador Java e corrigir o codigo ou o import.",
                auto_fixable=False,
            )

        if _TS_ERROR_RE.search(logs):
            return ClassifiedBuildError(
                code="typescript_compile_error",
                message="Erro de compilacao TypeScript.",
                root_cause="O codigo gerado nao compila (ver logs para o primeiro error TS).",
                suggested_fix="Corrigir os erros de tipo apontados; reexecutar a etapa com o agente de reparo.",
                auto_fixable=False,
            )

        enoent = _ENOENT_FILE_RE.search(logs)
        if enoent:
            path = (enoent.group(1) or enoent.group(2) or "").strip()
            return ClassifiedBuildError(
                code="missing_file",
                message=f"Arquivo ausente: {path}." if path else "Arquivo referenciado ausente (ENOENT).",
                root_cause="Um comando de build referencia um arquivo que nao foi gerado.",
                suggested_fix="Gerar o arquivo ausente ou corrigir a referencia.",
                auto_fixable=False,
            )

        if "command not found" in logs or "not recognized as an internal or external command" in logs:
            return ClassifiedBuildError(
                code="build_command_missing",
                message="Comando de build inexistente no servidor.",
                root_cause="A ferramenta exigida pelo build nao esta instalada no PATH.",
                suggested_fix="Instalar a ferramenta no servidor ou trocar o script de build.",
                auto_fixable=False,
            )

        return None


build_error_classifier = BuildErrorClassifier()
