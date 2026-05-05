import asyncio
import hashlib
import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, API_KEY_SALT

_log = logging.getLogger("garrison.auth")

# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------
_SB_HEADERS = {
    "apikey":        SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
}


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(f"{API_KEY_SALT}{raw_key}".encode()).hexdigest()


async def _lookup_key(key_hash: str) -> dict | None:
    """Query api_keys table by hash. Returns the row or None."""
    async with httpx.AsyncClient(timeout=3.0) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/api_keys",
            headers=_SB_HEADERS,
            params={
                "key_hash": f"eq.{key_hash}",
                "select":   "id,site_id,agency_id",
                "limit":    "1",
            },
        )
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None


async def _touch_last_used(key_id: str) -> None:
    """Fire-and-forget: update last_used timestamp."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/api_keys",
                headers={
                    **_SB_HEADERS,
                    "Content-Type": "application/json",
                    "Prefer":       "return=minimal",
                },
                params={"id": f"eq.{key_id}"},
                json={"last_used": datetime.now(timezone.utc).isoformat()},
            )
    except Exception as exc:
        _log.debug("last_used update failed: %s", exc)


# ---------------------------------------------------------------------------
# Sliding-window rate limiter (in-memory, per site_id)
# ---------------------------------------------------------------------------
_WINDOW_SECS  = 60
_MAX_REQUESTS = 60
_windows: dict[str, deque] = defaultdict(deque)


def check_rate_limit(site_id: str) -> bool:
    """
    Returns True (allowed) or False (limit exceeded).
    Never raises — errors are fail-open.
    """
    try:
        now    = time.monotonic()
        window = _windows[site_id]
        cutoff = now - _WINDOW_SECS

        while window and window[0] < cutoff:
            window.popleft()

        if len(window) >= _MAX_REQUESTS:
            return False

        window.append(now)
        return True

    except Exception as exc:
        _log.warning("rate limiter error (fail-open): %s", exc)
        return True


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------
_api_key_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(
    raw_key: str | None = Security(_api_key_scheme),
) -> dict | None:
    """
    Validates the X-API-Key header against the Supabase api_keys table.

    Returns the key record (dict with site_id, agency_id) on success.
    Raises HTTP 401 on a missing or invalid key.
    Returns None (fail-open) if Supabase is unreachable — the request
    is allowed through so a DB outage never breaks a client's chat widget.
    """
    if not raw_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        # Not configured (local dev without .env) — fail-open
        _log.warning("Supabase not configured — skipping API key check")
        return None

    key_hash = _hash_key(raw_key)

    try:
        record = await _lookup_key(key_hash)
    except Exception as exc:
        _log.warning("API key lookup failed (fail-open): %s", exc)
        return None

    if record is None:
        raise HTTPException(status_code=401, detail="Invalid API key")

    asyncio.create_task(_touch_last_used(record["id"]))
    return record


async def verify_supabase_jwt(token: str) -> dict | None:
    """
    Verify a user's Supabase session token by calling the Supabase auth API.
    Returns the user object {id, email, ...} on success, None on failure.
    Used to authenticate dashboard → API calls (POST /admin/create-site).
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "apikey":        SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {token}",
                },
            )
            return r.json() if r.status_code == 200 else None
    except Exception as exc:
        _log.warning("JWT verification failed: %s", exc)
        return None
