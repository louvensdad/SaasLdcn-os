from dataclasses import dataclass
from app.macro.domain.interfaces.macro_repository import MacroRepository
from app.instance.domain.interfaces.instance_repository import InstanceRepository


@dataclass
class AssociateMacroInput:
    macro_id: str
    instance_ids: list[str]
    user_id: str


@dataclass
class AssociateMacroOutput:
    success: bool


class AssociateMacroUseCase:
    def __init__(
        self,
        macro_repository: MacroRepository,
        instance_repository: InstanceRepository,
    ):
        self._macro_repository = macro_repository
        self._instance_repository = instance_repository

    async def execute(self, input_dto: AssociateMacroInput) -> AssociateMacroOutput:
        macro = await self._macro_repository.find_by_id(input_dto.macro_id, input_dto.user_id)
        if not macro:
            raise ValueError("Macro não encontrada")

        # Validar que todas as instâncias pertencem ao usuário
        for inst_id in input_dto.instance_ids:
            instance = await self._instance_repository.find_by_id(inst_id, input_dto.user_id)
            if not instance:
                raise ValueError(f"Instância {inst_id} não encontrada ou não pertence ao usuário")

        # Associar (implementação pode ser via tabela intermediária no repositório)
        await self._macro_repository.associate_instances(macro.id, input_dto.instance_ids)
        return AssociateMacroOutput(success=True)