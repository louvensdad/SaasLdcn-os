from dataclasses import dataclass
from app.macro.domain.interfaces.macro_repository import MacroRepository


@dataclass
class GetMacroOutput:
    macro_id: str
    name: str
    description: str | None
    script_content: str
    created_at: str


class GetMacroUseCase:
    def __init__(self, macro_repository: MacroRepository):
        self._macro_repository = macro_repository

    async def execute(self, macro_id: str, user_id: str) -> GetMacroOutput:
        macro = await self._macro_repository.find_by_id(macro_id, user_id)
        if not macro:
            raise ValueError("Macro não encontrada")
        return GetMacroOutput(
            macro_id=str(macro.id),
            name=macro.name,
            description=macro.description,
            script_content=macro.script_content,
            created_at=macro.created_at.isoformat() if macro.created_at else "",
        )