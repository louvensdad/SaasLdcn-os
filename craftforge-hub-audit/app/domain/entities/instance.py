from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4
from typing import Optional


@dataclass
class Instance:
    id: UUID = field(default_factory=uuid4)
    account_id: UUID = None  # type: ignore
    status: str = "offline"  # online, offline
    fps: Optional[float] = None
    ram: Optional[float] = None
    last_seen: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)