"""
Stripe billing — checkout, portal, webhook, plans.
"""

import json
from datetime import datetime, UTC
from typing import Optional

import stripe
import structlog
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.auth import require_user, CurrentUser
from ...core.config import get_settings
from ...core.database import get_db
from ...models.user import TierEnum
from ...services.user_service import (
    get_user_by_id, set_stripe_customer_id,
    upsert_subscription, cancel_subscription,
    get_user_by_stripe_customer, update_user_tier,
)

router = APIRouter()
settings = get_settings()
logger = structlog.get_logger()


def _stripe_client():
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail='Stripe not configured.')
    stripe.api_key = settings.stripe_secret_key
    return stripe


# ─── Plans ───────────────────────────────────────────────────────────────────

@router.get('/plans')
async def get_plans():
    """Return available plans — no auth required (used on landing page)."""
    return {
        'plans': [
            {
                'id': 'free',
                'name': 'Free',
                'price': 0,
                'currency': 'usd',
                'interval': None,
                'features': [
                    '5 scans per day',
                    'Claude Haiku AI model',
                    '7-day scan history',
                    '2 follow-up questions per scan',
                    'Markdown export',
                ],
                'limits': {'scans_per_day': 5, 'followups': 2, 'history_days': 7},
            },
            {
                'id': 'pro',
                'name': 'Pro',
                'price': 1200,
                'yearly_price': 9900,
                'currency': 'usd',
                'interval': 'month',
                'stripe_price_id': settings.stripe_pro_price_id,
                'stripe_yearly_price_id': settings.stripe_pro_yearly_price_id,
                'features': [
                    'Unlimited scans',
                    'Claude Opus 4.6 (best AI)',
                    'Unlimited history',
                    '10 follow-up questions per scan',
                    'All export formats (Notion, Obsidian, JSON)',
                    'Personal knowledge graph',
                    'AI learning paths',
                    'Priority support',
                ],
                'limits': {'scans_per_day': -1, 'followups': 10, 'history_days': -1},
                'popular': True,
            },
            {
                'id': 'team',
                'name': 'Team',
                'price': 800,
                'currency': 'usd',
                'interval': 'month',
                'per': 'seat',
                'stripe_price_id': settings.stripe_team_price_id,
                'features': [
                    'Everything in Pro',
                    'Shared team knowledge library',
                    'Team scan dashboard',
                    'REST API access',
                    'SSO (coming soon)',
                    'Dedicated support',
                ],
                'limits': {'scans_per_day': -1, 'followups': 10, 'history_days': -1},
            },
        ]
    }


# ─── Checkout ────────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    price_id: str
    success_url: str = 'https://lensai.app/success?session_id={CHECKOUT_SESSION_ID}'
    cancel_url: str = 'https://lensai.app/pricing'


@router.post('/checkout')
async def create_checkout(
    body: CheckoutRequest,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe Checkout session and return the URL."""
    s = _stripe_client()

    db_user = await get_user_by_id(db, user.user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail='User not found')

    # Get or create Stripe customer
    customer_id = db_user.stripe_customer_id
    if not customer_id:
        customer = s.Customer.create(email=db_user.email, name=db_user.name, metadata={'user_id': user.user_id})
        customer_id = customer['id']
        await set_stripe_customer_id(db, user.user_id, customer_id)

    session = s.checkout.Session.create(
        customer=customer_id,
        mode='subscription',
        line_items=[{'price': body.price_id, 'quantity': 1}],
        success_url=body.success_url,
        cancel_url=body.cancel_url,
        allow_promotion_codes=True,
        subscription_data={'metadata': {'user_id': user.user_id}},
        metadata={'user_id': user.user_id},
    )

    return {'checkout_url': session['url'], 'session_id': session['id']}


# ─── Customer Portal ──────────────────────────────────────────────────────────

@router.post('/portal')
async def create_portal(
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Redirect user to Stripe Customer Portal to manage billing."""
    s = _stripe_client()

    db_user = await get_user_by_id(db, user.user_id)
    if not db_user or not db_user.stripe_customer_id:
        raise HTTPException(status_code=404, detail='No billing account found. Please subscribe first.')

    session = s.billing_portal.Session.create(
        customer=db_user.stripe_customer_id,
        return_url=f'{settings.frontend_url}/settings',
    )
    return {'portal_url': session['url']}


# ─── Current Subscription ─────────────────────────────────────────────────────

@router.get('/subscription')
async def get_subscription(
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    db_user = await get_user_by_id(db, user.user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail='User not found')

    sub = db_user.subscription
    return {
        'tier': db_user.tier.value,
        'subscription': {
            'status': sub.status.value if sub else None,
            'current_period_end': sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
            'cancel_at_period_end': sub.cancel_at_period_end if sub else False,
        } if sub else None,
    }


# ─── Webhook ─────────────────────────────────────────────────────────────────

@router.post('/webhook')
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias='stripe-signature'),
    db: AsyncSession = Depends(get_db),
):
    """Handle Stripe webhook events. Verify signature before processing."""
    if not settings.stripe_webhook_secret:
        logger.warning('Stripe webhook secret not configured — skipping signature check')
        payload = await request.body()
        event = json.loads(payload)
    else:
        s = _stripe_client()
        payload = await request.body()
        try:
            event = s.Webhook.construct_event(payload, stripe_signature, settings.stripe_webhook_secret)
        except stripe.SignatureVerificationError:
            raise HTTPException(status_code=400, detail='Invalid Stripe signature')

    event_type = event['type']
    data = event['data']['object']

    logger.info('stripe_webhook', event_type=event_type, event_id=event.get('id'))

    if event_type in ('customer.subscription.created', 'customer.subscription.updated'):
        await _handle_subscription_change(db, data)

    elif event_type == 'customer.subscription.deleted':
        await _handle_subscription_deleted(db, data)

    elif event_type == 'invoice.payment_failed':
        await _handle_payment_failed(db, data)

    elif event_type == 'checkout.session.completed':
        # subscription_id is on the session when mode='subscription'
        sub_id = data.get('subscription')
        if sub_id:
            s = _stripe_client()
            sub = s.Subscription.retrieve(sub_id)
            await _handle_subscription_change(db, sub)

    return {'received': True}


async def _handle_subscription_change(db: AsyncSession, sub_data: dict) -> None:
    customer_id = sub_data.get('customer')
    if not customer_id:
        return

    user = await get_user_by_stripe_customer(db, customer_id)
    if not user:
        # May have user_id in metadata
        user_id = sub_data.get('metadata', {}).get('user_id')
        if user_id:
            user = await get_user_by_id(db, user_id)
            if user and not user.stripe_customer_id:
                await set_stripe_customer_id(db, user_id, customer_id)
    if not user:
        logger.warning('stripe_webhook_no_user', customer_id=customer_id)
        return

    price_id = sub_data['items']['data'][0]['price']['id'] if sub_data.get('items') else ''
    status = sub_data.get('status', 'active')

    # Determine tier from price_id
    tier = TierEnum.pro
    if price_id == settings.stripe_team_price_id:
        tier = TierEnum.team

    period_start = datetime.fromtimestamp(sub_data['current_period_start'], UTC) if sub_data.get('current_period_start') else None
    period_end = datetime.fromtimestamp(sub_data['current_period_end'], UTC) if sub_data.get('current_period_end') else None
    canceled_at_ts = sub_data.get('canceled_at')
    canceled_at = datetime.fromtimestamp(canceled_at_ts, UTC) if canceled_at_ts else None

    await upsert_subscription(
        db,
        user_id=user.id,
        stripe_subscription_id=sub_data['id'],
        stripe_price_id=price_id,
        status=status,
        tier=tier,
        current_period_start=period_start,
        current_period_end=period_end,
        cancel_at_period_end=sub_data.get('cancel_at_period_end', False),
    )
    logger.info('subscription_updated', user_id=user.id, tier=tier, status=status)


async def _handle_subscription_deleted(db: AsyncSession, sub_data: dict) -> None:
    customer_id = sub_data.get('customer')
    if not customer_id:
        return
    user = await get_user_by_stripe_customer(db, customer_id)
    if user:
        await cancel_subscription(db, user.id)
        logger.info('subscription_canceled', user_id=user.id)


async def _handle_payment_failed(db: AsyncSession, invoice_data: dict) -> None:
    customer_id = invoice_data.get('customer')
    if not customer_id:
        return
    user = await get_user_by_stripe_customer(db, customer_id)
    if user:
        logger.warning('payment_failed', user_id=user.id, customer_id=customer_id)
        # Don't downgrade immediately — Stripe retries. Subscription status handles it.
