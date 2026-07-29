from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CreateAccountRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1)
    game_region: str = Field(default="US")

class UpdateAccountRequest(BaseModel):
    password: Optional[str] = None
    game_region: Optional[str] = None

class AccountResponse(BaseModel):
    id: str
    user_id: str
    username: str
    game_region: str
    status: str  # 'active', 'inactive', 'banned'
    created_at: datetime
    updated_at: datetime