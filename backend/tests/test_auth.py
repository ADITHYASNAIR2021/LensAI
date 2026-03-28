"""
Tests for auth endpoints:
  POST /api/v1/auth/google
  POST /api/v1/auth/refresh
  GET  /api/v1/auth/me
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from tests.conftest import make_access_token, make_refresh_token_for

# ─── Fake Google user info returned by verify_google_token ───────────────────

FAKE_GOOGLE_INFO = {
    "sub": "google_test_sub_001",
    "email": "newuser@example.com",
    "name": "New User",
    "picture": "https://example.com/pic.jpg",
}


# ─── test_google_auth_creates_user ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_google_auth_creates_user(
    test_client: AsyncClient,
    async_session: AsyncSession,
):
    """POST /google should create a user in DB and return JWT tokens."""
    with patch(
        "app.api.v1.auth.verify_google_token",
        new=AsyncMock(return_value=FAKE_GOOGLE_INFO),
    ):
        resp = await test_client.post(
            "/api/v1/auth/google",
            json={"google_token": "fake-google-token"},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == FAKE_GOOGLE_INFO["email"]
    assert body["user"]["tier"] == "free"

    # Verify the user was actually written to the DB (independent session)
    result = await async_session.execute(
        select(User).where(User.email == FAKE_GOOGLE_INFO["email"])
    )
    db_user = result.scalar_one_or_none()
    assert db_user is not None, "User should have been created in the database"
    assert db_user.google_id == FAKE_GOOGLE_INFO["sub"]


# ─── test_google_auth_upserts_existing_user ───────────────────────────────────

@pytest.mark.asyncio
async def test_google_auth_upserts_existing_user(test_client: AsyncClient, async_session: AsyncSession):
    """Calling /google twice with the same Google ID should NOT create duplicate users."""
    with patch(
        "app.api.v1.auth.verify_google_token",
        new=AsyncMock(return_value=FAKE_GOOGLE_INFO),
    ):
        resp1 = await test_client.post(
            "/api/v1/auth/google",
            json={"google_token": "fake-google-token"},
        )
        resp2 = await test_client.post(
            "/api/v1/auth/google",
            json={"google_token": "fake-google-token"},
        )

    assert resp1.status_code == 200
    assert resp2.status_code == 200

    # Exactly one row in the users table for this google_id
    result = await async_session.execute(
        select(func.count()).select_from(User).where(User.google_id == FAKE_GOOGLE_INFO["sub"])
    )
    count = result.scalar_one()
    assert count == 1, f"Expected 1 user, found {count}"


# ─── test_refresh_token ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_token(test_client: AsyncClient, sample_user: User):
    """POST /refresh should return a new access token given a valid refresh token."""
    refresh_tok = make_refresh_token_for(sample_user)

    resp = await test_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_tok},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert "tier" in body


# ─── test_refresh_token_rejects_access_token ──────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_token_rejects_access_token(test_client: AsyncClient, sample_user: User):
    """Passing an access token to /refresh should return 401."""
    access_tok = make_access_token(sample_user)

    resp = await test_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": access_tok},
    )

    assert resp.status_code == 401


# ─── test_get_me_requires_auth ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_me_requires_auth(test_client: AsyncClient):
    """GET /me without a token should return 401."""
    resp = await test_client.get("/api/v1/auth/me")
    assert resp.status_code == 401


# ─── test_get_me_returns_profile ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_me_returns_profile(test_client: AsyncClient, sample_user: User):
    """GET /me with a valid token should return the user's profile."""
    token = make_access_token(sample_user)

    resp = await test_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["email"] == sample_user.email
    assert body["id"] == sample_user.id
    assert "tier" in body
    assert "is_pro" in body


# ─── test_invalid_google_token_returns_401 ────────────────────────────────────

@pytest.mark.asyncio
async def test_invalid_google_token_returns_401(test_client: AsyncClient):
    """If verify_google_token raises, the endpoint should return 401."""
    with patch(
        "app.api.v1.auth.verify_google_token",
        new=AsyncMock(side_effect=Exception("bad token")),
    ):
        resp = await test_client.post(
            "/api/v1/auth/google",
            json={"google_token": "garbage"},
        )

    assert resp.status_code == 401
