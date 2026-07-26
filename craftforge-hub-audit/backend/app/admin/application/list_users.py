from dataclasses import dataclass, field
from app.user.domain.interfaces.user_repository import UserRepository


@dataclass
class UserAdminListItem:
    user_id: str
    email: str
    name: str
    role: str
    plan: str
    created_at: str


@dataclass
class ListUsersAdminOutput:
    users: list[UserAdminListItem] = field(default_factory=list)


class ListUsersAdminUseCase:
    def __init__(self, user_repository: UserRepository):
        self._user_repository = user_repository

    async def execute(self) -> ListUsersAdminOutput:
        users = await self._user_repository.find_all()
        items = [
            UserAdminListItem(
                user_id=str(u.id),
                email=u.email,
                name=u.name,
                role=u.role,
                plan=u.plan,
                created_at=u.created_at.isoformat() if u.created_at else "",
            )
            for u in users
        ]
        return ListUsersAdminOutput(users=items)