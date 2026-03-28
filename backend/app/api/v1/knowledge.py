from fastapi import APIRouter, Depends
from ...core.auth import require_user, CurrentUser
from ...services.knowledge_graph import KnowledgeGraphService

router = APIRouter()
kg = KnowledgeGraphService()


@router.get('')
async def get_graph(user: CurrentUser = Depends(require_user)):
    """Return the user's full knowledge graph."""
    nodes = await kg.get_graph(user.user_id)
    return nodes


@router.get('/{node_id}/related')
async def get_related(node_id: str, user: CurrentUser = Depends(require_user)):
    """Return related nodes for a given knowledge node."""
    related_ids = await kg.find_related(user.user_id, 'unknown', node_id)
    return related_ids
