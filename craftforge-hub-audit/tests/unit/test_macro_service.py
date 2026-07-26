import pytest
from unittest.mock import AsyncMock
from app.macro.application.macro_service import MacroService
from app.macro.models import Macro

@pytest.mark.asyncio
class TestMacroService:
    async def test_create_macro(self):
        repo = AsyncMock()
        macro = Macro(id=1, name="AutoFarm", script="print('macro')", user_id=1)
        repo.create = AsyncMock(return_value=macro)
        service = MacroService(repo)
        result = await service.create_macro(user_id=1, name="AutoFarm", script="print('macro')")
        assert result.name == "AutoFarm"

    async def test_associate_macro_with_accounts(self):
        repo = AsyncMock()
        macro = Macro(id=1, name="Test", script="", user_id=1)
        repo.get = AsyncMock(return_value=macro)
        repo.link_accounts = AsyncMock(return_value=None)
        service = MacroService(repo)
        await service.associate_macro(macro_id=1, account_ids=[1,2])
        repo.link_accounts.assert_called_with(macro_id=1, account_ids=[1,2])

    async def test_execute_macro_creates_log(self):
        repo = AsyncMock()
        log_repo = AsyncMock()
        macro = Macro(id=1, name="Test", script="print('exec')", user_id=1)
        repo.get = AsyncMock(return_value=macro)
        log_repo.create = AsyncMock()
        service = MacroService(repo, log_repo=log_repo)
        # Assume execution returns a result
        result = await service.execute_macro(macro_id=1, account_id=1)
        assert result.status == "success"  # example
        log_repo.create.assert_called_once()