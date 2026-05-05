import asyncio
import hashlib
import logging

import httpx

from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

_log = logging.getLogger("garrison.logger")

_ENDPOINT = f"{SUPABASE_URL}/rest/v1/threat_logs" if SUPABASE_URL else ""
_HEADERS = {
    "apikey":        SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
}


async def _insert(payload: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(_ENDPOINT, headers=_HEADERS, json=payload)
            r.raise_for_status()
    except Exception as exc:
        # Never let a logging failure surface to the caller
        _log.warning("threat_log insert failed: %s", exc)


def log_threat(
    *,
    site_id: str | None,
    prompt: str,
    status: str,
    threat_level: int,
    detection_layer: str,
    reason: str,
) -> None:
    """
    Fire-and-forget: schedule a Supabase insert without blocking the response.
    Silently skips if Supabase is not configured (e.g. local dev without .env).
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return

    payload = {
        "site_id":         site_id or "unknown",
        "prompt_hash":     hashlib.sha256(prompt.encode()).hexdigest(),
        "status":          status,
        "threat_level":    threat_level,
        "detection_layer": detection_layer,
        "reason":          reason,
        # agency_id is intentionally omitted (NULL) until the sites table is added.
        # The dashboard RLS policy is set to show NULL-agency rows to all authenticated users.
    }

    asyncio.create_task(_insert(payload))
