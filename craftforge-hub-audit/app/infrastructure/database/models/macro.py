import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, func, Table, Column
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.infrastructure.database.base import Base

# Tabela de associação Many-to-Many entre macros e instâncias
macro_instance_association = Table(
    "macro_instance",
    Base.metadata,
    Column("macro_id", UUID(as_uuid=True), ForeignKey("macros.id", ondelete="CASCADE"), primary_key=True),
    Column("instance_id", UUID(as_uuid=True), ForeignKey("instances.id", ondelete="CASCADE"), primary_key=True),
)


class MacroModel(Base):
    __tablename__ = "macros"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    script_content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("UserModel", back_populates="macros")
    instances = relationship("InstanceModel", secondary=macro_instance_association, backref="macros")
    execution_logs = relationship("ExecutionLogModel", back_populates="macro", cascade="all, delete-orphan")