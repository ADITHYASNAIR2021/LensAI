"""
ElevenLabs Text-to-Speech service.
Converts AI analysis text to natural-sounding audio.
API key: validated and working.
"""

from __future__ import annotations

import httpx

from ..core.config import get_settings

settings = get_settings()

ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'


async def text_to_speech(
    text: str,
    voice_id: str | None = None,
    model_id: str | None = None,
    stability: float = 0.5,
    similarity_boost: float = 0.75,
    style: float = 0.0,
    use_speaker_boost: bool = True,
) -> bytes:
    """
    Convert text to speech using ElevenLabs API.
    Returns raw audio bytes (mp3).
    """
    vid = voice_id or settings.elevenlabs_voice_id
    mid = model_id or settings.elevenlabs_model_id

    # Truncate to ElevenLabs limit (5000 chars for turbo)
    text = text[:4500]

    payload = {
        'text': text,
        'model_id': mid,
        'voice_settings': {
            'stability': stability,
            'similarity_boost': similarity_boost,
            'style': style,
            'use_speaker_boost': use_speaker_boost,
        },
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f'{ELEVENLABS_BASE_URL}/text-to-speech/{vid}',
            json=payload,
            headers={
                'xi-api-key': settings.elevenlabs_api_key,
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
            },
        )
        resp.raise_for_status()
        return resp.content


async def stream_text_to_speech(
    text: str,
    voice_id: str | None = None,
    model_id: str | None = None,
) -> bytes:
    """Stream TTS and return full audio bytes."""
    vid = voice_id or settings.elevenlabs_voice_id
    mid = model_id or settings.elevenlabs_model_id
    text = text[:4500]

    payload = {
        'text': text,
        'model_id': mid,
        'voice_settings': {
            'stability': 0.5,
            'similarity_boost': 0.75,
            'style': 0.0,
            'use_speaker_boost': True,
        },
        'optimize_streaming_latency': 3,
    }

    audio_chunks = []
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            'POST',
            f'{ELEVENLABS_BASE_URL}/text-to-speech/{vid}/stream',
            json=payload,
            headers={
                'xi-api-key': settings.elevenlabs_api_key,
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
            },
        ) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes(chunk_size=4096):
                audio_chunks.append(chunk)

    return b''.join(audio_chunks)


async def get_voices() -> list[dict]:
    """Fetch available ElevenLabs voices."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f'{ELEVENLABS_BASE_URL}/voices',
            headers={'xi-api-key': settings.elevenlabs_api_key},
        )
        resp.raise_for_status()
        data = resp.json()
        return [
            {
                'voice_id': v['voice_id'],
                'name': v['name'],
                'category': v.get('category', 'general'),
                'description': v.get('description', ''),
            }
            for v in data.get('voices', [])
        ]


def is_configured() -> bool:
    return bool(settings.elevenlabs_api_key)
