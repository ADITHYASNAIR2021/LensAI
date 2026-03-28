import uuid
import json
import time
from fastapi import APIRouter, Depends, HTTPException
from ...core.auth import require_user, CurrentUser
from ...core.redis_client import get_redis

router = APIRouter()

SHARE_TTL = 3600 * 24 * 7  # 7 days


@router.post('/{scan_id}')
async def create_share(scan_id: str, user: CurrentUser = Depends(require_user)):
    """Create a shareable link for a scan."""
    redis = await get_redis()

    # Get the scan
    history_key = f'history:{user.user_id}'
    all_raw = await redis.lrange(history_key, 0, 499)
    scan = None
    for raw in all_raw:
        s = json.loads(raw)
        if s.get('id') == scan_id:
            scan = s
            break

    if not scan:
        raise HTTPException(status_code=404, detail='Scan not found')

    share_id = str(uuid.uuid4())[:12]
    share_key = f'share:{share_id}'

    share_data = {
        'scan': scan,
        'shared_by': user.email,
        'shared_at': int(time.time()),
        'expires_at': int(time.time()) + SHARE_TTL,
    }

    await redis.setex(share_key, SHARE_TTL, json.dumps(share_data))

    return {
        'url': f'https://lensai.app/shared/{share_id}',
        'expires': share_data['expires_at'],
        'share_id': share_id,
    }


@router.get('/view/{share_id}')
async def view_shared(share_id: str):
    """View a publicly shared scan (no auth required)."""
    redis = await get_redis()
    data = await redis.get(f'share:{share_id}')
    if not data:
        raise HTTPException(status_code=404, detail='Share link expired or not found')
    return json.loads(data)
