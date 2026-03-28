import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from ...core.auth import require_user, CurrentUser
from ...core.redis_client import get_redis
from ...services.export_service import ExportService

router = APIRouter()
export_service = ExportService()

# MIME types per format
_MIME: dict[str, str] = {
    'markdown': 'text/markdown',
    'notion':   'text/markdown',
    'obsidian': 'text/markdown',
    'json':     'application/json',
    'pdf':      'application/pdf',
}


class ExportOptions(BaseModel):
    format: str = 'markdown'
    include_image: bool = True
    include_metadata: bool = True
    include_learning_paths: bool = True
    include_knowledge_connections: bool = True


@router.post('/{scan_id}')
async def export_scan(
    scan_id: str,
    options: ExportOptions,
    user: CurrentUser = Depends(require_user),
):
    """Export a scan in the requested format. PDF returns binary; others return JSON."""
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

    content, filename = await export_service.export(
        scan, options.format, options.model_dump()
    )
    mime = _MIME.get(options.format, 'text/plain')

    # PDF → binary Response; others → JSON envelope
    if options.format == 'pdf':
        return Response(
            content=content,
            media_type=mime,
            headers={'Content-Disposition': f'attachment; filename="{filename}"'},
        )

    return {'content': content, 'filename': filename, 'format': options.format}
