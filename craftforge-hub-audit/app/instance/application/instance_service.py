from datetime import datetime, timezone
from typing import List
from app.instance.application.port import InstancePort
from app.instance.schemas import InstanceResponse


class StubInstanceService(InstancePort):
    async def list_instances(self, user_id: str) -> List[InstanceResponse]:
        return [
            InstanceResponse(
                id="stub-instance-1",
                account_id="stub-account-1",
                user_id=user_id,
                status="offline",
                started_at=None,
                stopped_at=None,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
        ]

    async def get_instance(self, instance_id: str, user_id: str) -> InstanceResponse:
        return InstanceResponse(
            id=instance_id,
            account_id="stub-account-1",
            user_id=user_id,
            status="offline",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

    async def start_instance(self, instance_id: str, user_id: str) -> InstanceResponse:
        return InstanceResponse(
            id=instance_id,
            account_id="stub-account-1",
            user_id=user_id,
            status="online",
            fps=30.0,
            ram_mb=512.0,
            started_at=datetime.now(timezone.utc),
            stopped_at=None,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

    async def stop_instance(self, instance_id: str, user_id: str) -> InstanceResponse:
        return InstanceResponse(
            id=instance_id,
            account_id="stub-account-1",
            user_id=user_id,
            status="offline",
            fps=None,
            ram_mb=None,
            started_at=None,
            stopped_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

    async def start_all_instances(self, user_id: str) -> List[InstanceResponse]:
        return await self.list_instances(user_id)