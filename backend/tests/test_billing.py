"""
Tests for billing endpoints:
  GET  /api/v1/billing/plans
  POST /api/v1/billing/checkout
  POST /api/v1/billing/webhook
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Subscription, SubscriptionStatusEnum, TierEnum, User
from tests.conftest import make_access_token

# ─── test_get_plans_no_auth ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_plans_no_auth(test_client: AsyncClient):
    """GET /plans is public and should return exactly 3 plans."""
    resp = await test_client.get("/api/v1/billing/plans")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "plans" in body
    plans = body["plans"]
    assert len(plans) == 3

    ids = {p["id"] for p in plans}
    assert ids == {"free", "pro", "team"}


@pytest.mark.asyncio
async def test_get_plans_contains_expected_fields(test_client: AsyncClient):
    """Each plan should have name, price, features, and limits fields."""
    resp = await test_client.get("/api/v1/billing/plans")
    body = resp.json()

    for plan in body["plans"]:
        assert "name" in plan
        assert "price" in plan
        assert "features" in plan
        assert "limits" in plan


# ─── test_checkout_requires_auth ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_checkout_requires_auth(test_client: AsyncClient):
    """POST /checkout without a token should return 401."""
    resp = await test_client.post(
        "/api/v1/billing/checkout",
        json={"price_id": "price_test_123"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_checkout_requires_stripe_configured(
    test_client: AsyncClient,
    sample_user: User,
):
    """POST /checkout with valid auth but no Stripe key should return 503."""
    token = make_access_token(sample_user)

    with patch("app.api.v1.billing.settings") as mock_settings:
        mock_settings.stripe_secret_key = ""  # not configured
        resp = await test_client.post(
            "/api/v1/billing/checkout",
            json={"price_id": "price_test_123"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 503


# ─── Webhook helpers ─────────────────────────────────────────────────────────

def _make_webhook_payload(event_type: str, sub_data: dict) -> bytes:
    """Build a raw Stripe webhook payload (no signature verification in tests)."""
    event = {
        "id": "evt_test_001",
        "type": event_type,
        "data": {"object": sub_data},
    }
    return json.dumps(event).encode()


def _subscription_created_data(user: User, status: str = "active") -> dict:
    return {
        "id": "sub_test_webhook_001",
        "customer": user.stripe_customer_id or "cus_test_webhook",
        "status": status,
        "items": {
            "data": [
                {
                    "price": {
                        "id": "price_pro_monthly_test",
                    }
                }
            ]
        },
        "current_period_start": 1700000000,
        "current_period_end": 1702678400,
        "cancel_at_period_end": False,
        "canceled_at": None,
        "metadata": {"user_id": user.id},
    }


# ─── test_stripe_webhook_subscription_created ────────────────────────────────

@pytest.mark.asyncio
async def test_stripe_webhook_subscription_created(
    test_client: AsyncClient,
    sample_user: User,
    async_session: AsyncSession,
):
    """
    Posting a customer.subscription.created webhook should upsert a Subscription
    row and promote the user's tier to 'pro'.
    The webhook secret is left empty in test settings so signature check is skipped.
    """
    # Give the test user a stripe_customer_id so the webhook can resolve them
    sample_user.stripe_customer_id = "cus_test_webhook_created"
    async_session.add(sample_user)
    await async_session.commit()

    sub_data = _subscription_created_data(sample_user)
    sub_data["customer"] = sample_user.stripe_customer_id

    payload = _make_webhook_payload("customer.subscription.created", sub_data)

    # Ensure webhook secret is blank so the endpoint skips Stripe sig verification
    with patch("app.api.v1.billing.settings") as mock_settings:
        mock_settings.stripe_webhook_secret = ""
        mock_settings.stripe_team_price_id = "price_team_test"
        resp = await test_client.post(
            "/api/v1/billing/webhook",
            content=payload,
            headers={"Content-Type": "application/json"},
        )

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"received": True}

    # The user's tier should have been updated to pro
    await async_session.refresh(sample_user)
    assert sample_user.tier == TierEnum.pro


# ─── test_stripe_webhook_subscription_canceled ───────────────────────────────

@pytest.mark.asyncio
async def test_stripe_webhook_subscription_canceled(
    test_client: AsyncClient,
    sample_pro_user: User,
    async_session: AsyncSession,
):
    """
    Posting a customer.subscription.deleted webhook should cancel the subscription
    and downgrade the user tier to 'free'.
    """
    sub_data = {
        "id": "sub_test_pro",
        "customer": sample_pro_user.stripe_customer_id,
        "status": "canceled",
    }
    payload = _make_webhook_payload("customer.subscription.deleted", sub_data)

    with patch("app.api.v1.billing.settings") as mock_settings:
        mock_settings.stripe_webhook_secret = ""
        mock_settings.stripe_team_price_id = "price_team_test"
        resp = await test_client.post(
            "/api/v1/billing/webhook",
            content=payload,
            headers={"Content-Type": "application/json"},
        )

    assert resp.status_code == 200, resp.text

    await async_session.refresh(sample_pro_user)
    assert sample_pro_user.tier == TierEnum.free

    # Subscription row status should be 'canceled'
    result = await async_session.execute(
        select(Subscription).where(Subscription.user_id == sample_pro_user.id)
    )
    sub = result.scalar_one_or_none()
    assert sub is not None
    assert sub.status == SubscriptionStatusEnum.canceled


# ─── test_webhook_ignores_unknown_event ──────────────────────────────────────

@pytest.mark.asyncio
async def test_webhook_ignores_unknown_event(test_client: AsyncClient):
    """Unknown event types should return 200 received without error."""
    payload = json.dumps({
        "id": "evt_unknown",
        "type": "some.unknown.event",
        "data": {"object": {}},
    }).encode()

    with patch("app.api.v1.billing.settings") as mock_settings:
        mock_settings.stripe_webhook_secret = ""
        resp = await test_client.post(
            "/api/v1/billing/webhook",
            content=payload,
            headers={"Content-Type": "application/json"},
        )

    assert resp.status_code == 200
    assert resp.json() == {"received": True}
