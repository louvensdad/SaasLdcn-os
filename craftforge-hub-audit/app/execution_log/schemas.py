from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class ExecutionLogResponse(BaseModel):
    id: str
    macro_id: str
    instance_id: str
    status: str  # 'running', 'completed', 'failed'
    started_at: datetime
    finished_at: Optional[datetime] = None
    result: Optional[Any] = None  # JSONB
    error: Optional[str] = None