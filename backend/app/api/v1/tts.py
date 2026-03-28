"""
ElevenLabs Text-to-Speech API endpoint.
POST /api/v1/tts          — convert text to mp3 audio
GET  /api/v1/tts/voices   — list available voices
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from ...services import elevenlabs_service

router = APIRouter(prefix='/tts', tags=['tts'])


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4500, description='Text to convert to speech')
    voice_id: str | None = Field(None, description='ElevenLabs voice ID (uses default if omitted)')
    model_id: str | None = Field(None, description='ElevenLabs model ID (uses turbo v2.5 if omitted)')
    stability: float = Field(0.5, ge=0.0, le=1.0)
    similarity_boost: float = Field(0.75, ge=0.0, le=1.0)
    style: float = Field(0.0, ge=0.0, le=1.0)
    use_speaker_boost: bool = True
    stream: bool = Field(False, description='Use streaming endpoint for lower latency')


@router.post('', summary='Convert text to speech (mp3)')
async def text_to_speech(req: TTSRequest) -> Response:
    if not elevenlabs_service.is_configured():
        raise HTTPException(status_code=503, detail='ElevenLabs API key not configured')

    try:
        if req.stream:
            audio = await elevenlabs_service.stream_text_to_speech(
                req.text,
                voice_id=req.voice_id,
                model_id=req.model_id,
            )
        else:
            audio = await elevenlabs_service.text_to_speech(
                req.text,
                voice_id=req.voice_id,
                model_id=req.model_id,
                stability=req.stability,
                similarity_boost=req.similarity_boost,
                style=req.style,
                use_speaker_boost=req.use_speaker_boost,
            )
        return Response(
            content=audio,
            media_type='audio/mpeg',
            headers={'Content-Disposition': 'inline; filename="speech.mp3"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'TTS generation failed: {exc}') from exc


@router.get('/voices', summary='List available ElevenLabs voices')
async def list_voices() -> list[dict]:
    if not elevenlabs_service.is_configured():
        raise HTTPException(status_code=503, detail='ElevenLabs API key not configured')
    try:
        return await elevenlabs_service.get_voices()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Failed to fetch voices: {exc}') from exc
