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


async def log_threat(
    *,
    site_id: str | None,
    prompt: str,
    status: str,
    threat_level: int,
    detection_layer: str,
    reason: str,
) -> None:
    """
    Awaitable Supabase insert. Silently skips if Supabase is not configured.
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
    }

    await _insert(payload)
