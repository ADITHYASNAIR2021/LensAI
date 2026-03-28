"""Content classification endpoint — lightweight, no streaming."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...services.content_classifier import get_classifier

router = APIRouter()


class ClassifyRequest(BaseModel):
    image_data: str  # base64-encoded image
    url: str | None = None


class ClassifyResponse(BaseModel):
    content_type: str
    confidence: float
    detected_language: str | None
    signals: list[str]
    secondary_type: str | None


@router.post("", response_model=ClassifyResponse)
async def classify_content(body: ClassifyRequest):
    """
    Classify a screenshot without full analysis.
    Used by the extension to decide which analysis mode to suggest.
    """
    if not body.image_data:
        raise HTTPException(status_code=400, detail="image_data is required")

    classifier = get_classifier()
    try:
        result = await classifier.classify(body.image_data)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Classification failed: {e}")

    return ClassifyResponse(
        content_type=result.get("content_type", "unknown"),
        confidence=result.get("confidence", 0.0),
        detected_language=result.get("detected_language"),
        signals=result.get("signals", []),
        secondary_type=result.get("secondary_type"),
    )
