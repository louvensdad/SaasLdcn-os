from datetime import datetime, timezone
from typing import List
from app.macro.application.port import MacroPort
from app.macro.schemas import CreateMacroRequest, UpdateMacroRequest, MacroResponse


class StubMacroService(MacroPort):
    async def list_macros(self, user_id: str) -> List[MacroResponse]:
        return [
            MacroResponse(
                id="stub-macro-1",
                user_id=user_id,
                name="Macro XP",
                script="-- stub script",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
        ]

    async def get_macro(self, macro_id: str, user_id: str) -> MacroResponse:
        return MacroResponse(
            id=macro_id,
            user_id=user_id,
            name="Stub Macro",
            script="-- stub",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

    async def create_macro(self, request: CreateMacroRequest, user_id: str) -> MacroResponse:
        return MacroResponse(
            id="new-stub-macro",
            user_id=user_id,
            name=request.name,
            script=request.script,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

    async def update_macro(self, macro_id: str, request: UpdateMacroRequest, user_id: str) -> MacroResponse:
        return await self.get_macro(macro_id, user_id)

    async def delete_macro(self, macro_id: str, user_id: str) -> None:
        return None

    async def associate_macro(self, macro_id: str, instance_ids: List[str], user_id: str) -> None:
        return None

    async def execute_macro(self, macro_id: str, instance_ids: List[str], user_id: str) -> str:
        return "stub-execution-log-id"