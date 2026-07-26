from dataclasses import dataclass, field
from app.macro.domain.interfaces.macro_repository import MacroRepository


@dataclass
class MacroListItem:
    macro_id: str
    name: str
    description: str | None
    created_at: str


@dataclass
class ListMacrosOutput:
    macros: list[MacroListItem] = field(default_factory=list)


class ListMacrosUseCase:
    def __init__(self, macro_repository: MacroRepository):
        self._macro_repository = macro_repository

    async def execute(self, user_id: str) -> ListMacrosOutput:
        macros = await self._macro_repository.find_by_user_id(user_id)
        items = [
            MacroListItem(
                macro_id=str(m.id),
                name=m.name,
                description=m.description,
                created_at=m.created_at.isoformat() if m.created_at else "",
            )
            for m in macros
        ]
        return ListMacrosOutput(macros=items)