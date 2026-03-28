"""
Tests for rate limiting on POST /api/v1/analyze.

Free-tier users (and anonymous) are capped at free_scans_per_day (default 20).
Pro users are exempt.
"""

import base64
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.models.user import TierEnum, User
from tests.conftest import make_access_token

# ─── Minimal valid analyze payload ───────────────────────────────────────────

# 1x1 white JPEG in base64 (small, passes image validation)
_TINY_JPEG_B64 = base64.b64encode(
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c"
    b"\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c"
    b"\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\x1eL\xc9\x00\x00\x00"
    b"\x11\x08\x00\x01\x00\x01\x03\x01\"\x00\x02\x11\x01\x03\x11\x01\xff\xc4"
    b"\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00"
    b"\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xc4\x00\xb5"
    b"\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00\x01}\x01"
    b"\x02\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa\x07\"q\x142\x81\x91\xa1\x08"
    b"#B\xb1\xc1\x15R\xd1\xf0$3br\x82\t\n\x16\x17\x18\x19\x1a%&'()*456789"
    b":CDEFGHIJSTUVWXYZcdefghijstuvwxyz\x83\x84\x85\x86\x87\x88\x89\x8a\x92"
    b"\x93\x94\x95\x96\x97\x98\x99\x9a\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa"
    b"\xb2\xb3\xb4\xb5\xb6\xb7\xb8\xb9\xba\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9"
    b"\xca\xd2\xd3\xd4\xd5\xd6\xd7\xd8\xd9\xda\xe1\xe2\xe3\xe4\xe5\xe6\xe7"
    b"\xe8\xe9\xea\xf1\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xff\xda\x00\x0c"
    b"\x03\x01\x00\x02\x11\x03\x11\x00?\x00\xfb\xd4P\x00\x00\x00\x1f\xff\xd9"
).decode()


def _analyze_payload(image_b64: str = _TINY_JPEG_B64) -> dict:
    return {
        "image_data": image_b64,
        "selection": {"x": 0, "y": 0, "width": 100, "height": 100, "device_pixel_ratio": 1.0},
        "page_context": {"url": "https://example.com", "title": "Test", "domain": "example.com"},
        "mode": "technical",
        "session_id": "test-session-001",
    }


# ─── Shared fake pipeline ─────────────────────────────────────────────────────

def _make_fake_pipeline():
    async def _fake_stream(**kwargs):
        yield f'data: {json.dumps({"type": "chunk", "text": "ok"})}\n\n'
        yield "data: [DONE]\n\n"

    pipeline = MagicMock()
    pipeline.analyze_stream = _fake_stream
    return pipeline


# ─── test_free_tier_rate_limit ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_free_tier_rate_limit(test_client: AsyncClient, mock_redis):
    """
    Anonymous users are limited to 20 scans per day.
    The 21st request must return HTTP 429.
    Redis incr is mocked to simulate a sliding counter.
    """
    limit = 20
    call_count = 0

    async def _incr_mock(key):
        nonlocal call_count
        call_count += 1
        return call_count

    mock_redis.incr = _incr_mock

    fake_pipeline = _make_fake_pipeline()

    with patch("app.api.v1.analyze.get_pipeline", return_value=fake_pipeline), \
         patch("app.api.v1.analyze.get_redis", return_value=mock_redis):

        last_status = None
        for i in range(limit + 1):  # 0..20 inclusive = 21 requests
            resp = await test_client.post(
                "/api/v1/analyze",
                json=_analyze_payload(),
            )
            last_status = resp.status_code

        # The 21st call (i=20, counter=21) should be rate-limited
        assert last_status == 429, (
            f"Expected 429 on request {limit + 1}, got {last_status}"
        )


@pytest.mark.asyncio
async def test_free_tier_exactly_at_limit_still_allowed(test_client: AsyncClient, mock_redis):
    """The 20th request (equal to limit) should still succeed (200 or streaming 200)."""
    limit = 20
    call_count = 0

    async def _incr_mock(key):
        nonlocal call_count
        call_count += 1
        return call_count

    mock_redis.incr = _incr_mock

    fake_pipeline = _make_fake_pipeline()

    with patch("app.api.v1.analyze.get_pipeline", return_value=fake_pipeline), \
         patch("app.api.v1.analyze.get_redis", return_value=mock_redis):

        for i in range(limit):
            resp = await test_client.post(
                "/api/v1/analyze",
                json=_analyze_payload(),
            )
            # All requests up to and including the limit must NOT be 429
            assert resp.status_code != 429, (
                f"Request {i + 1} should be allowed but got 429"
            )


# ─── test_pro_tier_no_rate_limit ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_pro_tier_no_rate_limit(
    test_client: AsyncClient,
    sample_pro_user: User,
    mock_redis,
):
    """
    Pro users bypass the rate limiter entirely.
    Even if Redis reports a high counter, a pro user should never see 429.
    """
    # Redis would return a huge number if it were consulted
    mock_redis.incr = AsyncMock(return_value=9999)

    token = make_access_token(sample_pro_user)
    fake_pipeline = _make_fake_pipeline()

    with patch("app.api.v1.analyze.get_pipeline", return_value=fake_pipeline), \
         patch("app.api.v1.analyze.get_redis", return_value=mock_redis):

        for _ in range(5):
            resp = await test_client.post(
                "/api/v1/analyze",
                json=_analyze_payload(),
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code != 429, "Pro users must never be rate-limited"


@pytest.mark.asyncio
async def test_pro_tier_does_not_call_redis_incr(
    test_client: AsyncClient,
    sample_pro_user: User,
    mock_redis,
):
    """
    Because pro users are exempted before the Redis incr call,
    mock_redis.incr should never be invoked for a pro request.
    """
    mock_redis.incr = AsyncMock(return_value=1)

    token = make_access_token(sample_pro_user)
    fake_pipeline = _make_fake_pipeline()

    with patch("app.api.v1.analyze.get_pipeline", return_value=fake_pipeline), \
         patch("app.api.v1.analyze.get_redis", return_value=mock_redis):

        await test_client.post(
            "/api/v1/analyze",
            json=_analyze_payload(),
            headers={"Authorization": f"Bearer {token}"},
        )

    mock_redis.incr.assert_not_called()
