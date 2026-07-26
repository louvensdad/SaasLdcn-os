from uuid import UUID
from typing import Optional, List
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.entities.macro import Macro
from app.domain.repositories.macro_repository import MacroRepository
from app.infrastructure.database.models.macro import MacroModel, macro_instance_association
from app.infrastructure.database.models.instance import InstanceModel


class MacroRepositoryImpl(MacroRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, macro: Macro) -> Macro:
        model = MacroModel(
            id=macro.id,
            user_id=macro.user_id,
            name=macro.name,
            script_content=macro.script_content,
        )
        self.session.add(model)
        await self.session.commit()
        await self.session.refresh(model)
        return self._to_entity(model)

    async def find_by_id(self, macro_id: UUID) -> Optional[Macro]:
        stmt = select(MacroModel).where(MacroModel.id == macro_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is None:
            return None
        return self._to_entity(model)

    async def find_by_user_id(self, user_id: UUID, skip: int = 0, limit: int = 100) -> List[Macro]:
        stmt = select(MacroModel).where(MacroModel.user_id == user_id).offset(skip).limit(limit)
        result = await self.session.execute(stmt)
        models = result.scalars().all()
        return [self._to_entity(m) for m in models]

    async def update(self, macro: Macro) -> Macro:
        model = await self.session.get(MacroModel, macro.id)
        if model is None:
            raise ValueError("Macro not found")
        model.name = macro.name
        model.script_content = macro.script_content
        await self.session.commit()
        await self.session.refresh(model)
        return self._to_entity(model)

    async def delete(self, macro_id: UUID) -> None:
        stmt = delete(MacroModel).where(MacroModel.id == macro_id)
        await self.session.execute(stmt)
        await self.session.commit()

    async def associate_instance(self, macro_id: UUID, instance_id: UUID) -> None:
        macro = await self.session.get(MacroModel, macro_id)
        if macro is None:
            raise ValueError("Macro not found")
        instance = await self.session.get(InstanceModel, instance_id)
        if instance is None:
            raise ValueError("Instance not found")
        macro.instances.append(instance)
        await self.session.commit()

    async def find_associated_instances(self, macro_id: UUID) -> List[InstanceModel]:
        stmt = select(InstanceModel).join(
            macro_instance_association,
            InstanceModel.id == macro_instance_association.c.instance_id,
        ).where(macro_instance_association.c.macro_id == macro_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    def _to_entity(model: MacroModel) -> Macro:
        return Macro(
            id=model.id,
            user_id=model.user_id,
            name=model.name,
            script_content=model.script_content,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )