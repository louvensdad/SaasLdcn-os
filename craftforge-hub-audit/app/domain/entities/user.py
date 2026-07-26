from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4


@dataclass
class User:
    id: UUID = field(default_factory=uuid4)
    username: str = ""
    email: str = ""
    hashed_password: str = ""
    role: str = "user"  # user, admin
    plan: str = "free"  # free, premium, enterprise
    is_active: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)