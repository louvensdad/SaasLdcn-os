from __future__ import annotations

from app.engines.engineering_kernel_engine import compute_kernel_status
from app.schemas.delivery import DeliveryDecision, DeliveryModeOption, DeliveryProfile
from app.services.git_provider_service import git_provider_service
from app.services.project_writer import ProjectWriter

# Delivery Decision Center: all 4 options are always genuinely available (ZIP
# export and Git export both already work end-to-end; "ldcn_only" is just not
# choosing to export yet). Nothing here is a permission gate -- the real ZIP
# prep / git push actions keep their own existing _require_verified() checks in
# routes/meta_factory.py; recording a preference is non-destructive.
_OPTIONS: tuple[tuple[str, str], ...] = (
    ("zip_only", "Baixar projeto ZIP"),
    ("git_export", "Criar/enviar para um repositorio Git"),
    ("zip_and_git", "ZIP e repositorio Git"),
    ("ldcn_only", "Continuar apenas no ambiente LDCN"),
)


def _recommended_mode(owner_user_id: str) -> tuple[str, str]:
    """Grounded in one real signal (an existing Git connection), never a
    fabricated persona/skill-level system: a user who already connected
    GitHub/GitLab has shown they want Git; otherwise ZIP is the simplest
    default with nothing to configure first."""
    for provider in ("github", "gitlab"):
        if git_provider_service.status(owner_user_id, provider).get("status") == "connected":
            return "git_export", f"Voce ja tem uma conexao {provider} ativa."
    return "zip_only", "Caminho mais simples, sem nenhuma conexao a configurar."


def compute_delivery_decision(project_id: str, owner_user_id: str) -> DeliveryDecision:
    kernel = compute_kernel_status(project_id, owner_user_id=owner_user_id)
    blocked = kernel.state == "BLOCKED" and not kernel.override_active
    block_reason = kernel.reason if blocked else ""

    recommended_mode, recommended_reason = _recommended_mode(owner_user_id)
    options = [
        DeliveryModeOption(
            mode=mode, label=label,
            recommended=(mode == recommended_mode),
            reason=recommended_reason if mode == recommended_mode else "",
        )
        for mode, label in _OPTIONS
    ]

    profile_data = ProjectWriter().read_delivery_profile(project_id)
    current_profile = DeliveryProfile(project_id=project_id, **profile_data) if profile_data else None

    return DeliveryDecision(
        project_id=project_id,
        kernel_phase=kernel.kernel_phase,
        blocked=blocked,
        block_reason=block_reason,
        options=options,
        current_profile=current_profile,
    )
