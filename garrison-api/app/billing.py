import os

import httpx
import stripe
from fastapi import APIRouter, Header, HTTPException, Request

from app.auth import verify_supabase_jwt
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

router = APIRouter(prefix="/billing")

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PRICE_ID      = os.getenv("STRIPE_PRICE_ID", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
WEB_URL              = os.getenv("WEB_URL", "http://localhost:5173")

_SB_HEADERS = {
    "apikey":        SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}


def _auth_error():
    raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")


async def _get_user(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        _auth_error()
    token = authorization.removeprefix("Bearer ")
    user = await verify_supabase_jwt(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    return user


@router.post("/create-checkout")
async def create_checkout(authorization: str | None = Header(default=None)):
    user    = await _get_user(authorization)
    user_id = user["id"]
    email   = user.get("email", "")

    stripe_customer_id = await _get_customer_id(user_id)

    if not stripe_customer_id:
        customer = stripe.Customer.create(
            email=email,
            metadata={"user_id": user_id},
        )
        stripe_customer_id = customer.id

    session = stripe.checkout.Session.create(
        customer=stripe_customer_id,
        client_reference_id=user_id,
        payment_method_types=["card"],
        line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
        mode="subscription",
        success_url=f"{WEB_URL}/dashboard?upgraded=1",
        cancel_url=f"{WEB_URL}/dashboard",
    )

    return {"url": session.url}


@router.post("/create-portal")
async def create_portal(authorization: str | None = Header(default=None)):
    user    = await _get_user(authorization)
    user_id = user["id"]

    stripe_customer_id = await _get_customer_id(user_id)
    if not stripe_customer_id:
        raise HTTPException(status_code=404, detail="No billing account found")

    portal = stripe.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=f"{WEB_URL}/settings",
    )

    return {"url": portal.url}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    payload    = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    etype = event["type"]
    obj   = event["data"]["object"]

    if etype == "checkout.session.completed":
        user_id         = obj.get("client_reference_id")
        customer_id     = obj.get("customer")
        subscription_id = obj.get("subscription")
        if user_id and subscription_id:
            await _upsert_subscription(user_id, customer_id, subscription_id, "active")

    elif etype in ("customer.subscription.updated", "customer.subscription.deleted"):
        customer_id     = obj.get("customer")
        subscription_id = obj.get("id")
        status          = obj.get("status", "canceled")
        await _update_subscription(customer_id, subscription_id, status)

    return {"ok": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_customer_id(user_id: str) -> str | None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/subscriptions",
            headers=_SB_HEADERS,
            params={"user_id": f"eq.{user_id}", "select": "stripe_customer_id"},
        )
    if r.status_code == 200 and r.json():
        return r.json()[0].get("stripe_customer_id")
    return None


async def _upsert_subscription(
    user_id: str,
    customer_id: str,
    subscription_id: str,
    status: str,
) -> None:
    headers = {**_SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"}
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            f"{SUPABASE_URL}/rest/v1/subscriptions",
            headers=headers,
            json={
                "user_id":                user_id,
                "stripe_customer_id":     customer_id,
                "stripe_subscription_id": subscription_id,
                "status":                 status,
            },
        )


async def _update_subscription(
    customer_id: str,
    subscription_id: str,
    status: str,
) -> None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/subscriptions",
            headers=_SB_HEADERS,
            params={"stripe_customer_id": f"eq.{customer_id}"},
            json={"stripe_subscription_id": subscription_id, "status": status},
        )
