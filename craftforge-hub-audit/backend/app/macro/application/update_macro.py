from dataclasses import dataclass
from app.macro.domain.interfaces.macro_repository import MacroRepository


@dataclass
class UpdateMacroInput:
    macro_id: str
    user_id: str
    name: str | None = None
    script_content: str | None = None
    description: str | None = None


@dataclass
class UpdateMacroOutput:
    macro_id: str


class UpdateMacroUseCase:
    def __init__(self, macro_repository: MacroRepository):
        self._macro_repository = macro_repository

    async def execute(self, input_dto: UpdateMacroInput) -> UpdateMacroOutput:
        macro = await self._macro_repository.find_by_id(input_dto.macro_id, input_dto.user_id)
        if not macro:
            raise ValueError("Macro não encontrada")
        if input_dto.name is not None:
            macro.name = input_dto.name
        if input_dto.script_content is not None:
            macro.script_content = input_dto.script_content
        if input_dto.description is not None:
            macro.description = input_dto.description
        await self._macro_repository.update(macro)
        return UpdateMacroOutput(macro_id=str(macro.id))