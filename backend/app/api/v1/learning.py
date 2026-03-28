import json
from fastapi import APIRouter, Depends, HTTPException
from ...core.auth import get_current_user, CurrentUser
from ...core.redis_client import get_redis
from ...services.learning_paths import LearningPathService
from typing import Optional

router = APIRouter()
lp_service = LearningPathService()


@router.get('/{scan_id}')
async def get_learning_paths(
    scan_id: str,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Return learning paths for a specific scan."""
    if not user:
        return []

    redis = await get_redis()
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

    paths = await lp_service.suggest(
        scan.get('content_type', 'unknown'),
        scan.get('mode', 'technical'),
        scan.get('explanation', '')[:1000],
    )
    return paths
