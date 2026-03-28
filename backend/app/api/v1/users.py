"""
User profile, settings, API key management.
"""

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.auth import require_user, CurrentUser
from ...core.database import get_db
from ...services.user_service import (
    get_user_by_id, resolve_tier, check_scan_limit,
    create_api_key, list_api_keys, revoke_api_key,
)

router = APIRouter()


# ─── Profile ──────────────────────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None


@router.get('/profile')
async def get_profile(user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    db_user = await get_user_by_id(db, user.user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail='User not found')

    tier = await resolve_tier(db, user.user_id)
    used, limit = await check_scan_limit(db, user.user_id, tier)

    return {
        'id': db_user.id,
        'email': db_user.email,
        'name': db_user.name,
        'avatar_url': db_user.avatar_url,
        'tier': tier.value,
        'is_pro': tier.value in ('pro', 'team'),
        'usage': {'used_today': used, 'limit': limit},
        'created_at': db_user.created_at.isoformat(),
    }


@router.patch('/profile')
async def update_profile(
    body: UpdateProfileRequest,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, UTC
    from sqlalchemy import update as sa_update
    from ...models.user import User

    if body.name:
        await db.execute(
            sa_update(User)
            .where(User.id == user.user_id)
            .values(name=body.name, updated_at=datetime.now(UTC))
        )
    return {'ok': True}


# ─── Usage ────────────────────────────────────────────────────────────────────

@router.get('/usage')
async def get_usage(user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    tier = await resolve_tier(db, user.user_id)
    used, limit = await check_scan_limit(db, user.user_id, tier)
    return {
        'tier': tier.value,
        'today': {'used': used, 'limit': limit, 'remaining': max(0, limit - used)},
    }


# ─── API Keys ─────────────────────────────────────────────────────────────────

class CreateKeyRequest(BaseModel):
    name: str = 'My API Key'


@router.get('/api-keys')
async def list_keys(user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    if not user.is_pro:
        raise HTTPException(status_code=403, detail='API keys require a Pro or Team subscription.')
    keys = await list_api_keys(db, user.user_id)
    return {
        'keys': [
            {
                'id': k.id,
                'name': k.name,
                'prefix': k.key_prefix,
                'is_active': k.is_active,
                'scans_used': k.scans_used,
                'last_used_at': k.last_used_at.isoformat() if k.last_used_at else None,
                'created_at': k.created_at.isoformat(),
            }
            for k in keys
        ]
    }


@router.post('/api-keys')
async def create_key(
    body: CreateKeyRequest,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_pro:
        raise HTTPException(status_code=403, detail='API keys require a Pro or Team subscription.')
    raw, key = await create_api_key(db, user.user_id, body.name)
    return {
        'key': raw,  # Shown ONCE — user must copy it now
        'id': key.id,
        'prefix': key.key_prefix,
        'name': key.name,
        'warning': 'Store this key securely. It will not be shown again.',
    }


@router.delete('/api-keys/{key_id}')
async def delete_key(
    key_id: str,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    revoked = await revoke_api_key(db, key_id, user.user_id)
    if not revoked:
        raise HTTPException(status_code=404, detail='API key not found')
    return {'ok': True}
