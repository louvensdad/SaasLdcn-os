import pytest
from unittest.mock import AsyncMock
from app.instance.application.instance_service import InstanceService
from app.instance.models import Instance
from datetime import datetime

@pytest.mark.asyncio
class TestInstanceService:
    async def test_start_instance_success(self):
        repo = AsyncMock()
        instance = Instance(id=1, account_id=1, status="offline", started_at=None)
        repo.get = AsyncMock(return_value=instance)
        repo.update = AsyncMock(return_value=Instance(id=1, account_id=1, status="online", started_at=datetime.utcnow()))
        service = InstanceService(repo)
        result = await service.start_instance(instance_id=1)
        assert result.status == "online"

    async def test_start_instance_already_online_raises(self):
        repo = AsyncMock()
        instance = Instance(id=1, account_id=1, status="online", started_at=datetime.utcnow())
        repo.get = AsyncMock(return_value=instance)
        service = InstanceService(repo)
        with pytest.raises(ValueError, match="Instance is already online"):
            await service.start_instance(instance_id=1)

    async def test_stop_instance(self):
        repo = AsyncMock()
        instance = Instance(id=1, account_id=1, status="online", started_at=datetime.utcnow())
        repo.get = AsyncMock(return_value=instance)
        repo.update = AsyncMock(return_value=Instance(id=1, account_id=1, status="offline", started_at=None))
        service = InstanceService(repo)
        result = await service.stop_instance(instance_id=1)
        assert result.status == "offline"

    async def test_batch_start_all(self):
        repo = AsyncMock()
        repo.find_by_account_ids = AsyncMock(return_value=[
            Instance(id=1, account_id=1, status="offline"),
            Instance(id=2, account_id=1, status="offline")
        ])
        repo.update = AsyncMock(side_effect=lambda id, **kw: Instance(id=id, account_id=1, status="online"))
        service = InstanceService(repo)
        results = await service.start_all_instances(account_ids=[1])
        assert len(results) == 2
        assert all(r.status == "online" for r in results)