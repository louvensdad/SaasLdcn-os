from abc import ABC, abstractmethod
from typing import List
from app.macro.schemas import CreateMacroRequest, UpdateMacroRequest, MacroResponse


class MacroPort(ABC):
    @abstractmethod
    async def list_macros(self, user_id: str) -> List[MacroResponse]: ...

    @abstractmethod
    async def get_macro(self, macro_id: str, user_id: str) -> MacroResponse: ...

    @abstractmethod
    async def create_macro(self, request: CreateMacroRequest, user_id: str) -> MacroResponse: ...

    @abstractmethod
    async def update_macro(self, macro_id: str, request: UpdateMacroRequest, user_id: str) -> MacroResponse: ...

    @abstractmethod
    async def delete_macro(self, macro_id: str, user_id: str) -> None: ...

    @abstractmethod
    async def associate_macro(self, macro_id: str, instance_ids: List[str], user_id: str) -> None: ...

    @abstractmethod
    async def execute_macro(self, macro_id: str, instance_ids: List[str], user_id: str) -> str: ...  # retorna execution_log_id