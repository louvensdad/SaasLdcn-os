from fastapi import Depends, HTTPException, status
from app.core.security import get_current_user
from typing import Annotated


async def require_admin(
    current_user: dict = Depends(get_current_user),
):
    """Dependency to require admin role."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user