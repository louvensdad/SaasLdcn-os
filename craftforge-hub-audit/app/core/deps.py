"""
Dependências injetáveis (banco de dados, autenticação, etc.).
"""
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Prover sessão assíncrona do banco de dados."""
    async with async_session_factory() as session:
        yield session