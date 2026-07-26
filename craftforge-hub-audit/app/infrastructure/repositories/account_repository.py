from uuid import UUID
from typing import Optional, List
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.entities.account import Account
from app.domain.repositories.account_repository import AccountRepository
from app.infrastructure.database.models.account import AccountModel


class AccountRepositoryImpl(AccountRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, account: Account) -> Account:
        model = AccountModel(
            id=account.id,
            user_id=account.user_id,
            name=account.name,
            credentials=account.credentials,
        )
        self.session.add(model)
        await self.session.commit()
        await self.session.refresh(model)
        return self._to_entity(model)

    async def find_by_id(self, account_id: UUID) -> Optional[Account]:
        stmt = select(AccountModel).where(AccountModel.id == account_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is None:
            return None
        return self._to_entity(model)

    async def find_by_user_id(self, user_id: UUID, skip: int = 0, limit: int = 100) -> List[Account]:
        stmt = select(AccountModel).where(AccountModel.user_id == user_id).offset(skip).limit(limit)
        result = await self.session.execute(stmt)
        models = result.scalars().all()
        return [self._to_entity(m) for m in models]

    async def update(self, account: Account) -> Account:
        model = await self.session.get(AccountModel, account.id)
        if model is None:
            raise ValueError("Account not found")
        model.name = account.name
        model.credentials = account.credentials
        await self.session.commit()
        await self.session.refresh(model)
        return self._to_entity(model)

    async def delete(self, account_id: UUID) -> None:
        stmt = delete(AccountModel).where(AccountModel.id == account_id)
        await self.session.execute(stmt)
        await self.session.commit()

    @staticmethod
    def _to_entity(model: AccountModel) -> Account:
        return Account(
            id=model.id,
            user_id=model.user_id,
            name=model.name,
            credentials=model.credentials,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )