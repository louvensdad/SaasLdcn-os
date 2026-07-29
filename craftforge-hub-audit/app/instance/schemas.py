from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class InstanceResponse(BaseModel):
    id: str
    account_id: str
    user_id: str
    status: str  # 'offline', 'online', 'starting', 'stopping', 'error'
    fps: Optional[float] = None
    ram_mb: Optional[float] = None
    started_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime