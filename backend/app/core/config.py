import secrets as _secrets
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Literal

# Resolve .env relative to this file's location (backend/app/core/config.py → backend/.env)
_ENV_FILE = Path(__file__).parent.parent.parent / '.env'


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding='utf-8',
        extra='ignore',
    )

    # ── App ───────────────────────────────────────────────────────────────────
    app_name: str = 'LensAI'
    app_version: str = '1.0.0'
    environment: Literal['development', 'staging', 'production', 'testing'] = 'development'
    debug: bool = True
    secret_key: str = _secrets.token_urlsafe(48)
    allowed_origins: list[str] = ['http://localhost:3000', 'http://localhost:5173']
    frontend_url: str = 'https://lensai.app'

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = 'postgresql+asyncpg://lensai:lensai@localhost:5432/lensai'

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = 'redis://localhost:6379/0'
    redis_ttl: int = 86400

    # ── AI Provider — NVIDIA NIM ──────────────────────────────────────────────
    nvidia_api_key: str = ''             # build.nvidia.com — vision, embed, code

    # ── NVIDIA NIM models (12 models, task-routed with fallback chains) ─────
    #
    # CODE (primary → fallback)
    nvidia_code_model: str = 'qwen/qwen3-coder-480b-a35b-instruct'
    nvidia_code_fallback: str = 'qwen/qwen3.5-397b-a17b'
    #
    # VISION — screenshot / image analysis
    nvidia_vision_model: str = 'meta/llama-3.2-90b-vision-instruct'
    nvidia_vision_fast_model: str = 'meta/llama-3.2-11b-vision-instruct'
    #
    # DEEP REASONING — technical, math, architecture (thinking-capable)
    nvidia_ultra_model: str = 'deepseek-ai/deepseek-v3.2'
    nvidia_ultra_fallback: str = 'qwen/qwen3.5-397b-a17b'
    #
    # GENERAL PURPOSE
    nvidia_primary_model: str = 'meta/llama-3.3-70b-instruct'
    nvidia_fast_model: str = 'mistralai/mistral-nemotron'
    #
    # LARGE / HEAVY — for when maximum quality matters
    nvidia_large_model: str = 'mistralai/mistral-large-3-675b-instruct-2512'
    #
    # REASONING — chain-of-thought capable models
    nvidia_reasoning_model: str = 'qwen/qwq-32b'
    nvidia_reasoning_large: str = 'openai/gpt-oss-120b'
    nvidia_reasoning_fallback: str = 'deepseek-ai/deepseek-v3.1-terminus'
    #
    # GENERAL QWEN — strong all-rounders
    nvidia_qwen_small: str = 'qwen/qwen3.5-122b-a10b'
    nvidia_qwen_large: str = 'qwen/qwen3.5-397b-a17b'
    #
    # Embeddings — knowledge graph semantic similarity (1024-dim)
    nvidia_embed_model: str = 'nvidia/nv-embedqa-e5-v5'
    #
    # Content classifier — fast vision model for content-type detection
    nvidia_classifier_model: str = 'meta/llama-3.2-11b-vision-instruct'

    # ── ElevenLabs TTS ────────────────────────────────────────────────────────
    elevenlabs_api_key: str = ''
    elevenlabs_voice_id: str = 'JBFqnCBsd6RMkjVDRZzb'   # George (default)
    elevenlabs_model_id: str = 'eleven_turbo_v2_5'

    # ── Auth ──────────────────────────────────────────────────────────────────
    google_client_id: str = ''
    google_client_secret: str = ''
    jwt_algorithm: str = 'HS256'
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # ── Stripe ────────────────────────────────────────────────────────────────
    stripe_secret_key: str = ''
    stripe_webhook_secret: str = ''
    stripe_pro_price_id: str = ''
    stripe_pro_yearly_price_id: str = ''
    stripe_team_price_id: str = ''

    # ── Limits ────────────────────────────────────────────────────────────────
    # Default is generous for development. Production .env should set this to 5.
    free_scans_per_day: int = 20
    max_image_size_bytes: int = 5242880   # 5 MB
    max_followups_free: int = 2
    max_followups_pro: int = 10

    # ── Monitoring ────────────────────────────────────────────────────────────
    sentry_dsn: str = ''

    # ── Email (optional) ──────────────────────────────────────────────────────
    sendgrid_api_key: str = ''
    from_email: str = 'hello@lensai.app'
    from_name: str = 'LensAI'

    def available_providers(self) -> list[str]:
        """Return configured providers (NVIDIA NIM only)."""
        return ['nvidia'] if self.nvidia_api_key else []


@lru_cache
def get_settings() -> Settings:
    return Settings()
