"""
Auth endpoints — Google OAuth exchange, JWT refresh, logout.
Users are upserted into the database on every login.
"""

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.auth import (
    verify_google_token, create_access_token, create_refresh_token,
    decode_token, require_user, CurrentUser,
)
from ...core.config import get_settings
from ...core.database import get_db
from ...models.user import User
from ...services.user_service import upsert_user, resolve_tier, get_user_by_id

router = APIRouter()
settings = get_settings()


class GoogleAuthRequest(BaseModel):
    google_token: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = 'bearer'
    user: dict


@router.post('/google', response_model=AuthResponse)
async def google_auth(body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Exchange Google OAuth token for LensAI JWT. Creates user on first login."""
    try:
        user_info = await verify_google_token(body.google_token)
    except Exception:
        raise HTTPException(status_code=401, detail='Invalid Google token')

    google_id = user_info.get('sub', '')
    email = user_info.get('email', '')
    name = user_info.get('name', '')
    avatar_url = user_info.get('picture')

    if not google_id or not email:
        raise HTTPException(status_code=400, detail='Google token missing required fields')

    # Upsert user in database
    user = await upsert_user(db, google_id=google_id, email=email, name=name, avatar_url=avatar_url)

    # Resolve tier from DB (subscription table is source of truth)
    tier = await resolve_tier(db, user.id)

    token_data = {
        'sub': user.id,
        'email': email,
        'name': name,
        'tier': tier.value,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            'id': user.id,
            'email': email,
            'name': name,
            'avatar_url': avatar_url,
            'tier': tier.value,
        },
    )


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post('/refresh')
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if payload.get('type') != 'refresh':
        raise HTTPException(status_code=401, detail='Invalid refresh token')

    user_id = payload['sub']
    # Always re-read tier from DB to pick up subscription changes
    tier = await resolve_tier(db, user_id)

    new_token = create_access_token({
        'sub': user_id,
        'email': payload.get('email', ''),
        'name': payload.get('name', ''),
        'tier': tier.value,
    })
    return {'access_token': new_token, 'token_type': 'bearer', 'tier': tier.value}


@router.get('/me')
async def get_me(user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    """Return current user profile with live tier from DB."""
    db_user = await get_user_by_id(db, user.user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail='User not found')

    tier = await resolve_tier(db, user.user_id)
    return {
        'id': db_user.id,
        'email': db_user.email,
        'name': db_user.name,
        'avatar_url': db_user.avatar_url,
        'tier': tier.value,
        'is_pro': tier.value in ('pro', 'team'),
        'created_at': db_user.created_at.isoformat(),
    }


class ExtensionCallbackRequest(BaseModel):
    code: str
    redirect_uri: str


@router.post('/extension-callback')
async def extension_callback(
    body: ExtensionCallbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Exchange a Google authorization code (from launchWebAuthFlow) for a LensAI JWT.
    The extension calls this after the OAuth redirect instead of using getAuthToken.
    """
    settings = get_settings()

    # Exchange code for Google tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': body.code,
                'client_id': settings.google_client_id,
                'client_secret': settings.google_client_secret,
                'redirect_uri': body.redirect_uri,
                'grant_type': 'authorization_code',
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=401, detail='Failed to exchange Google code')
        token_data = token_resp.json()
        google_access_token = token_data['access_token']

        # Get Google user info
        userinfo_resp = await client.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers={'Authorization': f'Bearer {google_access_token}'},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(status_code=401, detail='Failed to fetch Google user info')
        userinfo = userinfo_resp.json()

    google_id = userinfo['id']
    email = userinfo['email']
    name = userinfo.get('name', email.split('@')[0])
    avatar_url = userinfo.get('picture')

    # Upsert user in DB
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            google_id=google_id,
            email=email,
            name=name,
            avatar_url=avatar_url,
        )
        db.add(user)
        await db.flush()
    else:
        user.name = name
        user.avatar_url = avatar_url

    await db.commit()

    # Resolve tier from subscription table
    tier = await resolve_tier(db, user.id)

    # Issue LensAI JWT
    access_token = create_access_token({
        'sub': user.id,
        'email': user.email,
        'name': user.name,
        'tier': tier.value,
    })
    refresh_token = create_refresh_token({
        'sub': user.id,
        'email': user.email,
        'name': user.name,
        'tier': tier.value,
    })

    return {
        'access_token': access_token,
        'refresh_token': refresh_token,
        'token_type': 'bearer',
        'user': {
            'id': user.id,
            'email': user.email,
            'name': user.name,
            'avatar_url': user.avatar_url,
            'tier': tier.value,
        },
    }
