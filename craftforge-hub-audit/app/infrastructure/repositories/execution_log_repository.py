from uuid import UUID
from typing import Optional, List
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.entities.execution_log import ExecutionLog
from app.domain.repositories.execution_log_repository import ExecutionLogRepository
from app.infrastructure.database.models.execution_log import ExecutionLogModel


class ExecutionLogRepositoryImpl(ExecutionLogRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, log: ExecutionLog) -> ExecutionLog:
        model = ExecutionLogModel(
            id=log.id,
            macro_id=log.macro_id,
            instance_id=log.instance_id,
            user_id=log.user_id,
            started_at=log.started_at,
            finished_at=log.finished_at,
            result=log.result,
            status=log.status,
        )
        self.session.add(model)
        await self.session.commit()
        await self.session.refresh(model)
        return self._to_entity(model)

    async def find_by_id(self, log_id: UUID) -> Optional[ExecutionLog]:
        stmt = select(ExecutionLogModel).where(ExecutionLogModel.id == log_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is None:
            return None
        return self._to_entity(model)

    async def find_by_user_id(self, user_id: UUID, skip: int = 0, limit: int = 100) -> List[ExecutionLog]:
        stmt = select(ExecutionLogModel).where(ExecutionLogModel.user_id == user_id).offset(skip).limit(limit)
        result = await self.session.execute(stmt)
        models = result.scalars().all()
        return [self._to_entity(m) for m in models]

    async def find_by_macro_id(self, macro_id: UUID, skip: int = 0, limit: int = 100) -> List[ExecutionLog]:
        stmt = select(ExecutionLogModel).where(ExecutionLogModel.macro_id == macro_id).offset(skip).limit(limit)
        result = await self.session.execute(stmt)
        models = result.scalars().all()
        return [self._to_entity(m) for m in models]

    async def update(self, log: ExecutionLog) -> ExecutionLog:
        model = await self.session.get(ExecutionLogModel, log.id)
        if model is None:
            raise ValueError("ExecutionLog not found")
        model.started_at = log.started_at
        model.finished_at = log.finished_at
        model.result = log.result
        model.status = log.status
        await self.session.commit()
        await self.session.refresh(model)
        return self._to_entity(model)

    async def delete(self, log_id: UUID) -> None:
        stmt = delete(ExecutionLogModel).where(ExecutionLogModel.id == log_id)
        await self.session.execute(stmt)
        await self.session.commit()

    @staticmethod
    def _to_entity(model: ExecutionLogModel) -> ExecutionLog:
        return ExecutionLog(
            id=model.id,
            macro_id=model.macro_id,
            instance_id=model.instance_id,
            user_id=model.user_id,
            started_at=model.started_at,
            finished_at=model.finished_at,
            result=model.result,
            status=model.status,
            created_at=model.created_at,
        )