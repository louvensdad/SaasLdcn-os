from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4
from typing import Optional


@dataclass
class Macro:
    id: UUID = field(default_factory=uuid4)
    user_id: UUID = None  # type: ignore
    name: str = ""
    script_content: str = ""
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)