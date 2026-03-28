"""
Knowledge Graph Service — powered by NVIDIA NIM real embeddings.

Replaces bag-of-words TF-IDF with proper 1024-dim semantic vectors
from nvidia/nv-embedqa-e5-v5. Connections are now semantically precise.
"""

from __future__ import annotations

import json
from typing import Optional

from ..core.redis_client import get_redis
from ..services.nvidia_service import get_embedding, cosine_similarity


class KnowledgeGraphService:
    """
    Personal knowledge graph backed by Redis.
    Uses NVIDIA NIM semantic embeddings for similarity — far more accurate
    than the previous bag-of-words approach.

    Node TTL: 90 days. Max 1000 nodes per user.
    Connection threshold: cosine similarity > 0.72 (tighter than before).
    """

    async def add_node(
        self,
        user_id: str,
        scan_id: str,
        content_type: str,
        title: str,
        explanation: str,
        domain: str,
        tags: list[str],
    ) -> None:
        """Add a new scan as a knowledge graph node with a real semantic embedding."""
        redis = await get_redis()

        # Get real semantic embedding from NVIDIA NIM
        embed_text = f"{title}. {explanation[:1500]}"
        try:
            embedding = await get_embedding(embed_text, input_type='passage')
        except Exception:
            embedding = []  # Degrade gracefully — node still stored, just won't connect

        node = {
            'id': scan_id,
            'scan_id': scan_id,
            'title': title[:100],
            'content_type': content_type,
            'tags': tags,
            'domain': domain,
            'embedding': embedding,
            'connections': [],
        }

        key = f'kg:{user_id}:node:{scan_id}'
        await redis.setex(key, 3600 * 24 * 90, json.dumps(node))

        index_key = f'kg:{user_id}:nodes'
        await redis.lpush(index_key, scan_id)
        await redis.ltrim(index_key, 0, 999)

        if embedding:
            await self._create_connections(user_id, scan_id, embedding, content_type, redis)

    async def find_related(
        self,
        user_id: str,
        content_type: str,
        text_snippet: str,
        limit: int = 5,
    ) -> list[str]:
        """
        Find the most semantically related scan IDs using NVIDIA embeddings.
        Uses 'query' input_type for the search vector.
        """
        try:
            redis = await get_redis()
            index_key = f'kg:{user_id}:nodes'
            node_ids = await redis.lrange(index_key, 0, 49)
            if not node_ids:
                return []

            query_vec = await get_embedding(text_snippet[:1000], input_type='query')
            if not query_vec:
                return []

            scored: list[tuple[float, str]] = []
            for node_id in node_ids:
                key = f'kg:{user_id}:node:{node_id}'
                data = await redis.get(key)
                if not data:
                    continue
                node = json.loads(data)

                node_vec = node.get('embedding', [])
                if not node_vec:
                    continue

                sim = cosine_similarity(query_vec, node_vec)
                # Small boost for same content type
                if node.get('content_type') == content_type:
                    sim = min(1.0, sim + 0.05)

                if sim > 0.60:
                    scored.append((sim, node_id))

            scored.sort(reverse=True)
            return [nid for _, nid in scored[:limit]]
        except Exception:
            return []

    async def get_graph(self, user_id: str) -> list[dict]:
        """Return all nodes for visualization (embeddings stripped — client doesn't need them)."""
        try:
            redis = await get_redis()
            index_key = f'kg:{user_id}:nodes'
            node_ids = await redis.lrange(index_key, 0, 199)

            nodes = []
            for node_id in node_ids:
                key = f'kg:{user_id}:node:{node_id}'
                data = await redis.get(key)
                if data:
                    node = json.loads(data)
                    node.pop('embedding', None)  # Don't send 1024-float vector to browser
                    nodes.append(node)

            return nodes
        except Exception:
            return []

    async def _create_connections(
        self,
        user_id: str,
        new_node_id: str,
        embedding: list[float],
        content_type: str,
        redis,
    ) -> None:
        """Create bidirectional connections between semantically similar nodes."""
        index_key = f'kg:{user_id}:nodes'
        existing_ids = await redis.lrange(index_key, 1, 30)

        for existing_id in existing_ids:
            key = f'kg:{user_id}:node:{existing_id}'
            data = await redis.get(key)
            if not data:
                continue
            node = json.loads(data)

            node_vec = node.get('embedding', [])
            if not node_vec:
                continue

            similarity = cosine_similarity(embedding, node_vec)
            if similarity < 0.72:
                continue

            label = 'similar to' if node.get('content_type') == content_type else 'relates to'
            edge = {'targetId': new_node_id, 'strength': round(similarity, 3), 'label': label}
            reverse_edge = {'targetId': existing_id, 'strength': round(similarity, 3), 'label': label}

            node.setdefault('connections', []).append(edge)
            await redis.setex(key, 3600 * 24 * 90, json.dumps(node))

            new_key = f'kg:{user_id}:node:{new_node_id}'
            new_data = await redis.get(new_key)
            if new_data:
                new_node = json.loads(new_data)
                new_node.setdefault('connections', []).append(reverse_edge)
                await redis.setex(new_key, 3600 * 24 * 90, json.dumps(new_node))
