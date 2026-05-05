import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL    = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
API_KEY_SALT         = os.getenv("API_KEY_SALT", "")

# Threat level at or above this triggers a block on the regex fast-pass
REGEX_THREAT_LEVEL = 8

# Threat level at or above this triggers a block on semantic analysis
SEMANTIC_BLOCK_THRESHOLD = 6
