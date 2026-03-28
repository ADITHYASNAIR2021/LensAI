"""
LensAI Backend — FastAPI Application
"""

import time
import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import get_settings
from .core.redis_client import get_redis, close_redis
from .core.database import init_db, close_db
from .services.ai_providers import close_nvidia_client
from .api.v1 import analyze, auth, history, knowledge, share, export, learning
from .api.v1 import billing, users, teams, tts
from .api.v1 import sessions, classify, meeting

settings = get_settings()
logger = structlog.get_logger()

try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            integrations=[FastApiIntegration(), StarletteIntegration()],
            traces_sample_rate=0.1,
        )
except ImportError:
    pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info('LensAI starting up', version=settings.app_version, env=settings.environment)
    try:
        redis = await get_redis()
        await redis.ping()
        logger.info('Redis connected')
    except Exception as e:
        logger.warning('Redis not available — caching and rate limiting disabled', error=str(e))
    if settings.environment in ('development', 'testing'):
        try:
            await init_db()
            logger.info('Database tables ensured')
        except Exception as e:
            logger.warning('Database not available — user persistence disabled', error=str(e))
    yield
    await close_nvidia_client()
    await close_redis()
    await close_db()
    logger.info('LensAI shut down')


_is_prod = settings.environment == 'production'

app = FastAPI(
    title='LensAI API',
    version=settings.app_version,
    description='See More. Understand Everything.',
    # Disable interactive docs in production — exposed via nginx only on staging
    docs_url=None if _is_prod else '/docs',
    redoc_url=None if _is_prod else '/redoc',
    openapi_url=None if _is_prod else '/openapi.json',
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=r'chrome-extension://.*',
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.middleware('http')
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration = round((time.monotonic() - start) * 1000)
    logger.info('request', method=request.method, path=request.url.path,
                status=response.status_code, duration_ms=duration)
    return response


@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    logger.error('unhandled_error', path=request.url.path, error=str(exc))
    return JSONResponse(status_code=500, content={'detail': 'Internal server error. Please try again.'})


app.include_router(auth.router,     prefix='/api/v1/auth',     tags=['Auth'])
app.include_router(users.router,    prefix='/api/v1/users',    tags=['Users'])
app.include_router(billing.router,  prefix='/api/v1/billing',  tags=['Billing'])
app.include_router(teams.router,    prefix='/api/v1/teams',    tags=['Teams'])
app.include_router(analyze.router,  prefix='/api/v1/analyze',  tags=['Analysis'])
app.include_router(history.router,  prefix='/api/v1/history',  tags=['History'])
app.include_router(knowledge.router,prefix='/api/v1/knowledge',tags=['Knowledge Graph'])
app.include_router(share.router,    prefix='/api/v1/share',    tags=['Sharing'])
app.include_router(export.router,   prefix='/api/v1/export',   tags=['Export'])
app.include_router(learning.router, prefix='/api/v1/learning', tags=['Learning Paths'])
app.include_router(tts.router,      prefix='/api/v1/tts',      tags=['Text-to-Speech'])
app.include_router(sessions.router, prefix='/api/v1/sessions', tags=['Sessions'])
app.include_router(classify.router, prefix='/api/v1/classify', tags=['Classify'])
app.include_router(meeting.router,  prefix='/api/v1',          tags=['Smart Features'])


@app.get('/health', tags=['System'])
async def health():
    redis = await get_redis()
    redis_ok = False
    try:
        await redis.ping()
        redis_ok = True
    except Exception:
        pass
    return {
        'status': 'healthy' if redis_ok else 'degraded',
        'version': settings.app_version,
        'environment': settings.environment,
        'redis': redis_ok,
        'providers': {
            'nvidia': bool(settings.nvidia_api_key),
        },
        'services': {
            'tts': bool(settings.elevenlabs_api_key),
        },
        'active_providers': settings.available_providers(),
    }


@app.get('/', tags=['System'])
async def root():
    return {'name': 'LensAI API', 'version': settings.app_version, 'status': 'ok'}


@app.get('/debug', tags=['System'])
async def debug(request: Request):
    """
    Quick diagnostic endpoint — shows CORS headers, config, and connectivity.
    Only available in development and staging. Blocked in production.
    """
    if settings.environment == 'production':
        return JSONResponse(status_code=404, content={'detail': 'Not found'})

    redis_ok = False
    redis_error = None
    try:
        redis = await get_redis()
        await redis.ping()
        redis_ok = True
    except Exception as e:
        redis_error = str(e)

    return {
        'status': 'ok',
        'request_origin': request.headers.get('origin', 'none'),
        'cors': {
            'allowed_origins': settings.allowed_origins,
            'extension_regex': 'chrome-extension://.*',
        },
        'providers': {
            'nvidia': {'configured': bool(settings.nvidia_api_key)},
        },
        'active_providers': settings.available_providers(),
        'redis': {'ok': redis_ok, 'error': redis_error},
        'environment': settings.environment,
    }
