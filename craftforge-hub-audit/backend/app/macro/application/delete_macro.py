from dataclasses import dataclass
from app.macro.domain.interfaces.macro_repository import MacroRepository


@dataclass
class DeleteMacroOutput:
    success: bool


class DeleteMacroUseCase:
    def __init__(self, macro_repository: MacroRepository):
        self._macro_repository = macro_repository

    async def execute(self, macro_id: str, user_id: str) -> DeleteMacroOutput:
        macro = await self._macro_repository.find_by_id(macro_id, user_id)
        if not macro:
            raise ValueError("Macro não encontrada")
        await self._macro_repository.delete(macro.id)
        return DeleteMacroOutput(success=True)