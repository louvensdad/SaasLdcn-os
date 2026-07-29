from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class CreateMacroRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    script: str = Field(..., min_length=1)  # Conteúdo do script (executável)

class UpdateMacroRequest(BaseModel):
    name: Optional[str] = None
    script: Optional[str] = None

class MacroResponse(BaseModel):
    id: str
    user_id: str
    name: str
    script: str
    created_at: datetime
    updated_at: datetime