from __future__ import annotations

from pydantic import Field
from app.schemas.common import ApiModel


class GlossaryTerm(ApiModel):
    id: str
    term: str
    definition: str
    aliases: list[str] = Field(default_factory=list)


class ResolvedGlossaryTerm(GlossaryTerm):
    input: str
    is_alias: bool


class ResolveTermRequest(ApiModel):
    term: str = Field(min_length=1, max_length=120)


class ValidateTermsRequest(ApiModel):
    terms: list[str] = Field(min_length=1, max_length=200)


class LegacyAlias(ApiModel):
    alias: str
    canonical_term: str


class TerminologyValidation(ApiModel):
    valid: bool
    unknown_terms: list[str] = Field(default_factory=list)
    legacy_aliases: list[LegacyAlias] = Field(default_factory=list)
