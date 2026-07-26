from dataclasses import dataclass
from app.macro.domain.interfaces.macro_repository import MacroRepository
from app.macro.domain.models.macro import Macro


@dataclass
class CreateMacroInput:
    user_id: str
    name: str
    script_content: str
    description: str | None = None


@dataclass
class CreateMacroOutput:
    macro_id: str


class CreateMacroUseCase:
    def __init__(self, macro_repository: MacroRepository):
        self._macro_repository = macro_repository

    async def execute(self, input_dto: CreateMacroInput) -> CreateMacroOutput:
        macro = Macro.create(
            user_id=input_dto.user_id,
            name=input_dto.name,
            script_content=input_dto.script_content,
            description=input_dto.description,
        )
        await self._macro_repository.save(macro)
        return CreateMacroOutput(macro_id=str(macro.id))