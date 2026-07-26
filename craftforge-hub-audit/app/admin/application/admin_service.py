from datetime import datetime, timezone
from typing import List
from app.admin.application.port import AdminPort
from app.admin.schemas import UserAdminResponse


class StubAdminService(AdminPort):
    async def list_users(self) -> List[UserAdminResponse]:
        return [
            UserAdminResponse(
                id="stub-user-1",
                username="admin",
                email="admin@example.com",
                role="admin",
                plan="enterprise",
                is_active=True,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
        ]

    async def get_user(self, user_id: str) -> UserAdminResponse:
        return UserAdminResponse(
            id=user_id,
            username="admin",
            email="admin@example.com",
            role="admin",
            plan="enterprise",
            is_active=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )