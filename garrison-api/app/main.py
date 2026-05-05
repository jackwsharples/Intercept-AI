import hashlib
import re
import secrets
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import AnalyzeRequest, AnalyzeResponse, CreateSiteRequest, CreateSiteResponse
from app.layers import regex_layer, semantic_layer
from app.config import REGEX_THREAT_LEVEL, SUPABASE_URL, SUPABASE_SERVICE_KEY, API_KEY_SALT
from app.auth import verify_api_key, check_rate_limit, verify_supabase_jwt
from app import logger

app = FastAPI(
    title="Garrison API",
    description="AI Security Posture Management — prompt injection defense for SMB chatbots",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*", "X-API-Key", "Authorization"],
)


def _slugify_url(url: str) -> str:
    parsed = urlparse(url if "://" in url else f"https://{url}")
    host = parsed.netloc or parsed.path
    host = re.sub(r"^www\.", "", host)
    host = re.sub(r":\d+$", "", host)
    path = parsed.path.rstrip("/")
    slug = re.sub(r"[^a-z0-9.\-]", "-", (host + path).lower())
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug[:100]


_SB_HEADERS = {
    "apikey":        SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: AnalyzeRequest,
    key_record: dict | None = Depends(verify_api_key),
):
    site_id = (key_record or {}).get("site_id") or request.site_id or "unknown"

    if not check_rate_limit(site_id):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: {60} requests per minute for site '{site_id}'",
        )

    regex_result = regex_layer.check(request.prompt)
    if regex_result.triggered and regex_result.threat_level >= REGEX_THREAT_LEVEL:
        logger.log_threat(
            site_id=site_id,
            prompt=request.prompt,
            status="blocked",
            threat_level=regex_result.threat_level,
            detection_layer="regex",
            reason=regex_result.reason,
        )
        return AnalyzeResponse(
            status="blocked",
            reason=regex_result.reason,
            threat_level=regex_result.threat_level,
            detection_layer="regex",
        )

    try:
        sem_result = await semantic_layer.check(request.prompt, request.context)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Semantic layer unavailable: {exc}")

    if sem_result.status == "blocked":
        logger.log_threat(
            site_id=site_id,
            prompt=request.prompt,
            status="blocked",
            threat_level=sem_result.threat_level,
            detection_layer="semantic",
            reason=sem_result.reason,
        )

    return AnalyzeResponse(
        status=sem_result.status,
        reason=sem_result.reason,
        threat_level=sem_result.threat_level,
        detection_layer="semantic" if sem_result.status == "blocked" else "none",
    )


@app.post("/admin/create-site", response_model=CreateSiteResponse)
async def create_site(
    request: CreateSiteRequest,
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ")
    user = await verify_supabase_jwt(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")

    agency_id = user.get("id")
    if not agency_id:
        raise HTTPException(status_code=401, detail="Could not determine agency identity")

    site_id = _slugify_url(request.url)
    if not site_id:
        raise HTTPException(status_code=400, detail="Could not derive a valid site_id from that URL")

    raw_key  = f"gsk_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(f"{API_KEY_SALT}{raw_key}".encode()).hexdigest()

    async with httpx.AsyncClient(timeout=5.0) as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/api_keys",
            headers=_SB_HEADERS,
            json={
                "agency_id": agency_id,
                "site_id":   site_id,
                "key_hash":  key_hash,
                "name":      request.name,
            },
        )
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Failed to create API key: {r.text}")

        r2 = await client.post(
            f"{SUPABASE_URL}/rest/v1/sites",
            headers=_SB_HEADERS,
            json={
                "agency_id": agency_id,
                "site_id":   site_id,
                "name":      request.name,
                "url":       request.url,
            },
        )
        if r2.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Failed to create site record: {r2.text}")

    return CreateSiteResponse(site_id=site_id, raw_key=raw_key, name=request.name)
