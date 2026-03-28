from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from ...core.auth import require_user, CurrentUser
from ...core.redis_client import get_redis
import json

router = APIRouter()


@router.get('')
async def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: Optional[str] = None,
    user: CurrentUser = Depends(require_user),
):
    """Return paginated scan history for authenticated user."""
    redis = await get_redis()
    key = f'history:{user.user_id}'

    all_scans_raw = await redis.lrange(key, 0, 499)
    all_scans = [json.loads(s) for s in all_scans_raw]

    if q:
        q_lower = q.lower()
        all_scans = [
            s for s in all_scans
            if q_lower in s.get('explanation', '').lower()
            or q_lower in s.get('domain', '').lower()
            or any(q_lower in kp.lower() for kp in s.get('key_points', []))
        ]

    total = len(all_scans)
    start = (page - 1) * page_size
    end = start + page_size
    page_scans = all_scans[start:end]

    return {'scans': page_scans, 'total': total, 'page': page, 'page_size': page_size}


@router.delete('/{scan_id}')
async def delete_scan(scan_id: str, user: CurrentUser = Depends(require_user)):
    redis = await get_redis()
    key = f'history:{user.user_id}'
    all_scans_raw = await redis.lrange(key, 0, 499)
    all_scans = [json.loads(s) for s in all_scans_raw]
    updated = [s for s in all_scans if s.get('id') != scan_id]

    await redis.delete(key)
    if updated:
        await redis.rpush(key, *[json.dumps(s) for s in updated])
    return {'ok': True}


@router.patch('/{scan_id}/star')
async def star_scan(
    scan_id: str,
    body: dict,
    user: CurrentUser = Depends(require_user),
):
    redis = await get_redis()
    key = f'history:{user.user_id}'
    all_scans_raw = await redis.lrange(key, 0, 499)
    all_scans = [json.loads(s) for s in all_scans_raw]

    updated = []
    for s in all_scans:
        if s.get('id') == scan_id:
            s['starred'] = body.get('starred', False)
        updated.append(s)

    await redis.delete(key)
    if updated:
        await redis.rpush(key, *[json.dumps(s) for s in updated])
    return {'ok': True}
