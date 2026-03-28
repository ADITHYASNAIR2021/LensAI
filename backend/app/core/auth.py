import httpx
from datetime import datetime, timedelta, UTC
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .config import get_settings

settings = get_settings()
security = HTTPBearer(auto_error=False)

GOOGLE_TOKEN_INFO_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo'
GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload.update({'exp': expire, 'type': 'access'})
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(data: dict) -> str:
    payload = data.copy()
    expire = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    payload.update({'exp': expire, 'type': 'refresh'})
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid or expired token',
        ) from exc


async def verify_google_token(google_token: str) -> dict:
    """Exchange Google OAuth token for user info."""
    async with httpx.AsyncClient() as client:
        r = await client.get(GOOGLE_USERINFO_URL, headers={'Authorization': f'Bearer {google_token}'})
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail='Invalid Google token')
        return r.json()


class CurrentUser:
    def __init__(self, user_id: str, email: str, tier: str):
        self.user_id = user_id
        self.email = email
        self.tier = tier  # 'free' | 'pro' | 'team'

    @property
    def is_pro(self) -> bool:
        return self.tier in ('pro', 'team')


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[CurrentUser]:
    """Soft auth — anonymous users can use free tier."""
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    return CurrentUser(
        user_id=payload.get('sub', ''),
        email=payload.get('email', ''),
        tier=payload.get('tier', 'free'),
    )


async def require_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> CurrentUser:
    """Hard auth — endpoint requires a logged-in user."""
    user = await get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail='Authentication required')
    return user


# Alias: get_optional_user behaves identically to get_current_user —
# returns None for anonymous requests instead of raising 401.
get_optional_user = get_current_user
