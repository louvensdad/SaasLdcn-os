from uuid import UUID
from typing import Optional, List
from sqlalchemy import select, delete, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.entities.instance import Instance
from app.domain.repositories.instance_repository import InstanceRepository
from app.infrastructure.database.models.instance import InstanceModel
from app.infrastructure.database.models.account import AccountModel


class InstanceRepositoryImpl(InstanceRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, instance: Instance) -> Instance:
        model = InstanceModel(
            id=instance.id,
            account_id=instance.account_id,
            status=instance.status,
            fps=instance.fps,
            ram=instance.ram,
            last_seen=instance.last_seen,
        )
        self.session.add(model)
        await self.session.commit()
        await self.session.refresh(model)
        return self._to_entity(model)

    async def find_by_id(self, instance_id: UUID) -> Optional[Instance]:
        stmt = select(InstanceModel).where(InstanceModel.id == instance_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is None:
            return None
        return self._to_entity(model)

    async def find_by_account_id(self, account_id: UUID) -> Optional[Instance]:
        stmt = select(InstanceModel).where(InstanceModel.account_id == account_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is None:
            return None
        return self._to_entity(model)

    async def find_active_by_user_id(self, user_id: UUID, skip: int = 0, limit: int = 100) -> List[Instance]:
        stmt = (
            select(InstanceModel)
            .join(AccountModel, InstanceModel.account_id == AccountModel.id)
            .where(and_(AccountModel.user_id == user_id, InstanceModel.status == "online"))
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        models = result.scalars().all()
        return [self._to_entity(m) for m in models]

    async def update(self, instance: Instance) -> Instance:
        model = await self.session.get(InstanceModel, instance.id)
        if model is None:
            raise ValueError("Instance not found")
        model.status = instance.status
        model.fps = instance.fps
        model.ram = instance.ram
        model.last_seen = instance.last_seen
        await self.session.commit()
        await self.session.refresh(model)
        return self._to_entity(model)

    async def delete(self, instance_id: UUID) -> None:
        stmt = delete(InstanceModel).where(InstanceModel.id == instance_id)
        await self.session.execute(stmt)
        await self.session.commit()

    async def count_active_by_user_id(self, user_id: UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(InstanceModel)
            .join(AccountModel, InstanceModel.account_id == AccountModel.id)
            .where(and_(AccountModel.user_id == user_id, InstanceModel.status == "online"))
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    def _to_entity(model: InstanceModel) -> Instance:
        return Instance(
            id=model.id,
            account_id=model.account_id,
            status=model.status,
            fps=model.fps,
            ram=model.ram,
            last_seen=model.last_seen,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )