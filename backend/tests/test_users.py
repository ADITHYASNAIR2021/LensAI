"""
Tests for user endpoints:
  GET    /api/v1/users/profile
  GET    /api/v1/users/usage
  POST   /api/v1/users/api-keys
  GET    /api/v1/users/api-keys
  DELETE /api/v1/users/api-keys/{key_id}
"""

import pytest
from httpx import AsyncClient

from app.models.user import TierEnum, User
from tests.conftest import make_access_token


# ─── test_get_profile ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_profile(test_client: AsyncClient, sample_user: User):
    """GET /profile should return the user's profile including tier and usage."""
    token = make_access_token(sample_user)

    resp = await test_client.get(
        "/api/v1/users/profile",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == sample_user.id
    assert body["email"] == sample_user.email
    assert body["tier"] == TierEnum.free.value
    assert body["is_pro"] is False
    assert "usage" in body
    assert "used_today" in body["usage"]
    assert "limit" in body["usage"]


@pytest.mark.asyncio
async def test_get_profile_requires_auth(test_client: AsyncClient):
    """GET /profile without token should return 401."""
    resp = await test_client.get("/api/v1/users/profile")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_pro_profile(test_client: AsyncClient, sample_pro_user: User):
    """Pro user should have is_pro=True in their profile."""
    token = make_access_token(sample_pro_user)

    resp = await test_client.get(
        "/api/v1/users/profile",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_pro"] is True
    assert body["tier"] == TierEnum.pro.value


# ─── test_api_keys_require_pro ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_api_keys_require_pro(test_client: AsyncClient, sample_user: User):
    """A free-tier user trying to POST /api-keys should get 403."""
    token = make_access_token(sample_user)

    resp = await test_client.post(
        "/api/v1/users/api-keys",
        json={"name": "My Key"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403, resp.text
    assert "Pro" in resp.json()["detail"] or "pro" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_list_api_keys_requires_pro(test_client: AsyncClient, sample_user: User):
    """A free-tier user trying to GET /api-keys should get 403."""
    token = make_access_token(sample_user)

    resp = await test_client.get(
        "/api/v1/users/api-keys",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403


# ─── test_pro_user_can_create_api_key ────────────────────────────────────────

@pytest.mark.asyncio
async def test_pro_user_can_create_api_key(test_client: AsyncClient, sample_pro_user: User):
    """A pro user should be able to create an API key and receive the raw key."""
    token = make_access_token(sample_pro_user)

    resp = await test_client.post(
        "/api/v1/users/api-keys",
        json={"name": "Test Key"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "key" in body
    assert body["key"].startswith("lak_"), "Raw API key should have 'lak_' prefix"
    assert "id" in body
    assert "prefix" in body
    assert "warning" in body
    assert body["name"] == "Test Key"


@pytest.mark.asyncio
async def test_pro_user_can_list_api_keys(test_client: AsyncClient, sample_pro_user: User):
    """After creating a key, GET /api-keys should include it (without the raw secret)."""
    token = make_access_token(sample_pro_user)

    # Create a key first
    create_resp = await test_client.post(
        "/api/v1/users/api-keys",
        json={"name": "Listed Key"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 200
    created_id = create_resp.json()["id"]

    # List keys
    list_resp = await test_client.get(
        "/api/v1/users/api-keys",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert list_resp.status_code == 200
    keys = list_resp.json()["keys"]
    ids = [k["id"] for k in keys]
    assert created_id in ids

    # Raw key must NOT appear in the list response
    for k in keys:
        assert "key" not in k, "Raw key must not be returned in list endpoint"


@pytest.mark.asyncio
async def test_pro_user_can_delete_api_key(test_client: AsyncClient, sample_pro_user: User):
    """A pro user should be able to revoke one of their API keys."""
    token = make_access_token(sample_pro_user)

    create_resp = await test_client.post(
        "/api/v1/users/api-keys",
        json={"name": "Key to delete"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 200
    key_id = create_resp.json()["id"]

    delete_resp = await test_client.delete(
        f"/api/v1/users/api-keys/{key_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert delete_resp.status_code == 200
    assert delete_resp.json() == {"ok": True}


@pytest.mark.asyncio
async def test_delete_nonexistent_api_key_returns_404(test_client: AsyncClient, sample_pro_user: User):
    """Deleting a key that doesn't exist should return 404."""
    import uuid
    token = make_access_token(sample_pro_user)

    resp = await test_client.delete(
        f"/api/v1/users/api-keys/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 404


# ─── test_get_usage ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_usage_free_user(test_client: AsyncClient, sample_user: User):
    """GET /usage for a free user should return today's usage and the free daily limit."""
    token = make_access_token(sample_user)

    resp = await test_client.get(
        "/api/v1/users/usage",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tier"] == TierEnum.free.value
    assert "today" in body
    assert "used" in body["today"]
    assert "limit" in body["today"]
    assert "remaining" in body["today"]
    assert body["today"]["limit"] == 20  # free_scans_per_day from settings default
