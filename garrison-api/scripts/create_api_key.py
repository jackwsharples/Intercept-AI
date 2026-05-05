"""
Generate and register a Garrison API key for a client site.

Usage:
    python scripts/create_api_key.py --site-id leasing-co.com --name "Leasing Co"

The raw key is printed once and never stored — copy it immediately.
The hashed key is written to Supabase.
"""
import argparse
import hashlib
import os
import secrets
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
API_KEY_SALT         = os.getenv("API_KEY_SALT", "")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a Garrison API key")
    parser.add_argument("--site-id", required=True, help="e.g. leasing-co.com")
    parser.add_argument("--name",    default="",   help="Human-readable label")
    args = parser.parse_args()

    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY, API_KEY_SALT]):
        print("Error: SUPABASE_URL, SUPABASE_SERVICE_KEY, and API_KEY_SALT must be set in .env",
              file=sys.stderr)
        sys.exit(1)

    raw_key  = f"gsk_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(f"{API_KEY_SALT}{raw_key}".encode()).hexdigest()

    resp = httpx.post(
        f"{SUPABASE_URL}/rest/v1/api_keys",
        headers={
            "apikey":        SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "return=representation",
        },
        json={
            "site_id":  args.site_id,
            "key_hash": key_hash,
            "name":     args.name or args.site_id,
        },
    )

    if resp.status_code not in (200, 201):
        print(f"Supabase error {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)

    row = resp.json()[0]
    print(f"""
  ✓ API key created
  ─────────────────────────────────────────
  Site ID  : {args.site_id}
  Name     : {args.name or args.site_id}
  Key ID   : {row['id']}
  API Key  : {raw_key}
  ─────────────────────────────────────────
  Save the API Key above — it will NOT be shown again.

  Add to garrison.js config:
    window.GARRISON_CONFIG = {{
      apiUrl:  'https://your-garrison-api.vercel.app/analyze',
      siteId:  '{args.site_id}',
      apiKey:  '{raw_key}',
    }};
""")


if __name__ == "__main__":
    main()
