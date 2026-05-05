from pydantic import BaseModel, Field
from typing import Literal


class AnalyzeRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    context: str | None = Field(
        default=None,
        description="Optional: preceding conversation turns for context",
        max_length=8000,
    )
    site_id: str | None = Field(
        default=None,
        description="Client site identifier for threat logging",
    )


class AnalyzeResponse(BaseModel):
    status: Literal["allowed", "blocked"]
    reason: str
    threat_level: int = Field(..., ge=0, le=10)
    detection_layer: Literal["regex", "semantic", "none"]


class CreateSiteRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    url: str = Field(..., min_length=1, max_length=500)


class CreateSiteResponse(BaseModel):
    site_id: str
    raw_key: str
    name: str
