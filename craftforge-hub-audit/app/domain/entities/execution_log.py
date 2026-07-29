from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4
from typing import Optional


@dataclass
class ExecutionLog:
    id: UUID = field(default_factory=uuid4)
    macro_id: UUID = None  # type: ignore
    instance_id: UUID = None  # type: ignore
    user_id: UUID = None  # type: ignore
    started_at: datetime = field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None
    result: Optional[dict] = None
    status: str = "running"  # running, success, failure, error
    created_at: datetime = field(default_factory=datetime.utcnow)