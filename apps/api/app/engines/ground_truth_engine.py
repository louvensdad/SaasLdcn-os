from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# Ground Truth State Engine: the REAL, persisted state of the generation
# pipeline, derived exclusively from the durable job record — never from what
# any model said. This state is injected into EVERY LLM agent context (the
# model must never guess whether the build passed) and is the reference the
# Execution Reality Guard validates responses against.
#
# The incident this closes: after a failed build, an agent answered with
# "git clone https://github.com/medcore-ai/enterprise.git" + "docker-compose
# up -d" — a repository that was never created and a build that never passed.

FAILURE_STATUSES = frozenset({"FAILED", "NEEDS_USER_ACTION", "STALLED"})


@dataclass(frozen=True)
class GroundTruthState:
    build_status: str  # "SUCCESS" | "FAILED" | "NOT_RUN"
    pipeline_status: str  # job status (QUEUED..READY/FAILED/...)
    pipeline_stage: str
    artifacts_status: str  # "GENERATED" | "PARTIAL" | "NOT_GENERATED"
    artifacts_valid_count: int
    repo_status: str  # "CREATED" | "NOT_CREATED"
    docker_status: str  # "READY" | "NOT_READY"
    last_failed_step: str | None
    error_trace: str | None

    @property
    def ready(self) -> bool:
        return self.pipeline_status == "READY" and self.build_status == "SUCCESS"

    @property
    def failure(self) -> bool:
        return self.pipeline_status in FAILURE_STATUSES or self.build_status == "FAILED" or bool(self.error_trace)

    def as_dict(self) -> dict[str, Any]:
        return {
            "build_status": self.build_status,
            "pipeline_status": self.pipeline_status,
            "pipeline_stage": self.pipeline_stage,
            "artifacts_status": self.artifacts_status,
            "artifacts_valid_count": self.artifacts_valid_count,
            "repo_status": self.repo_status,
            "docker_status": self.docker_status,
            "last_failed_step": self.last_failed_step,
            "error_trace": self.error_trace,
            "ready": self.ready,
            "failure": self.failure,
        }


class GroundTruthEngine:
    def from_job(self, job: dict[str, Any]) -> GroundTruthState:
        """Derive the ground truth from the persisted GenerationJob record."""
        stage_statuses = job.get("stageStatuses") or {}
        build_stage = stage_statuses.get("build")
        if build_stage == "success" and job.get("valid"):
            build_status = "SUCCESS"
        elif build_stage == "failed":
            build_status = "FAILED"
        else:
            build_status = "NOT_RUN"

        artifacts = job.get("artifacts") or []
        valid_count = sum(1 for item in artifacts if item.get("kind") == "generated" and item.get("valid"))
        if job.get("status") == "READY" and not job.get("partial"):
            artifacts_status = "GENERATED"
        elif valid_count:
            artifacts_status = "PARTIAL"
        else:
            artifacts_status = "NOT_GENERATED"

        # The pipeline itself NEVER creates a remote repository — git export is a
        # separate, explicit user action after READY. Inside generation this is
        # always NOT_CREATED, which is exactly why a 'git clone <url>' in any
        # agent output here is a fabrication by definition.
        repo_status = "NOT_CREATED"

        has_compose = any(
            str(item.get("name", "")).lower().endswith(("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"))
            for item in artifacts
        )
        docker_status = "READY" if build_status == "SUCCESS" and has_compose else "NOT_READY"

        error = job.get("error") or {}
        error_trace = None
        if isinstance(error, dict) and error:
            error_trace = str(error.get("message") or error.get("reason") or "")[:500] or None
        last_failed_step = None
        if isinstance(error, dict) and error.get("stage"):
            last_failed_step = str(error["stage"])
        else:
            last_failed_step = next(
                (str(item.get("stage")) for item in reversed(job.get("checkpoints") or [])
                 if item.get("status") in {"failed", "stalled"}),
                None,
            )

        return GroundTruthState(
            build_status=build_status,
            pipeline_status=str(job.get("status") or "UNKNOWN"),
            pipeline_stage=str(job.get("currentStage") or ""),
            artifacts_status=artifacts_status,
            artifacts_valid_count=valid_count,
            repo_status=repo_status,
            docker_status=docker_status,
            last_failed_step=last_failed_step,
            error_trace=error_trace,
        )

    def default_state(self) -> GroundTruthState:
        """Pre-pipeline state (stage streams / ad-hoc generation): nothing has
        been built, no repo exists, docker is not up."""
        return GroundTruthState(
            build_status="NOT_RUN", pipeline_status="NOT_STARTED", pipeline_stage="",
            artifacts_status="NOT_GENERATED", artifacts_valid_count=0,
            repo_status="NOT_CREATED", docker_status="NOT_READY",
            last_failed_step=None, error_trace=None,
        )

    def prompt_block(self, state: GroundTruthState) -> str:
        """The mandatory STATUS REAL block injected into every LLM context.
        In failure state it also activates DIAGNOSTIC ONLY mode."""
        lines = [
            "<ground_truth_state>",
            "STATUS REAL DO SISTEMA (fonte unica da verdade — NUNCA contradiga nem assuma alem disto):",
            f"- BUILD: {state.build_status}",
            f"- PIPELINE: {state.pipeline_status}" + (f" (etapa atual: {state.pipeline_stage})" if state.pipeline_stage else ""),
            f"- ARTIFACTS: {state.artifacts_status} ({state.artifacts_valid_count} arquivo(s) valido(s))",
            f"- REPOSITORIO GIT REMOTO: {state.repo_status}",
            f"- DOCKER: {state.docker_status}",
        ]
        if state.last_failed_step:
            lines.append(f"- ULTIMO PASSO FALHO: {state.last_failed_step}")
        if state.error_trace:
            lines.append(f"- ERRO: {state.error_trace}")
        lines += [
            "REGRAS OBRIGATORIAS:",
            "- NUNCA afirme que o projeto foi gerado, buildado, publicado ou esta pronto se o status acima nao confirmar.",
            "- NUNCA invente URL de repositorio: nenhum repositorio remoto existe ate o usuario exportar (REPO: "
            + state.repo_status + "). Proibido 'git clone <url>' com URL inventada.",
        ]
        if not state.ready:
            lines.append(
                "- PIPELINE != READY: proibido instruir deploy, producao, CI/CD, 'docker compose up' como proximo passo do usuario."
            )
        lines.append("</ground_truth_state>")
        if state.failure:
            lines += [
                "",
                "<diagnostic_only_mode>",
                "O pipeline esta em ESTADO DE FALHA. Voce esta em modo DIAGNOSTIC ONLY:",
                "- PERMITIDO: explicar o erro, identificar a causa raiz, sugerir a correcao (inclusive corrigindo arquivos).",
                "- PROIBIDO: assumir que o projeto existe/foi gerado, sugerir execucao (git clone, docker, deploy, CI/CD),",
                "  ou qualquer instrucao de 'proximos passos de producao'.",
                "</diagnostic_only_mode>",
            ]
        return "\n".join(lines)


ground_truth_engine = GroundTruthEngine()
