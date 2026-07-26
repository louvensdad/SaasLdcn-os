from pydantic import BaseModel
from typing import List
from datetime import datetime


class UserAdminResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    plan: str
    is_active: bool
    created_at: datetime
    updated_at: datetime