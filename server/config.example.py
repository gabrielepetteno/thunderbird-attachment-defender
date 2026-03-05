# ============================================================
#  Thunderbird Attachment Defender — Server Configuration
#
#  1. Copy this file to config.py
#  2. Set your values below
#  3. Never commit config.py to git (it's in .gitignore)
# ============================================================

# ---- REQUIRED -----------------------------------------------

# A strong random secret shared between the extension and server.
# Generate one with: python -c "import secrets; print(secrets.token_hex(32))"
API_SECRET_KEY = "CHANGE_THIS_TO_A_STRONG_RANDOM_KEY"

# ---- OPTIONAL -----------------------------------------------

# VirusTotal free API key for cloud cross-check (leave empty to disable).
# Get yours at: https://www.virustotal.com/gui/my-apikey
VIRUSTOTAL_API_KEY = ""

# Port the server listens on (default: 9097)
SERVER_PORT = 9097

# DPI used when converting PDF pages to images.
# Higher = better quality but larger output file and slower processing.
# Recommended: 150 (good quality) or 120 (faster, lighter)
SANITIZE_DPI = 150

# Maximum accepted PDF file size in bytes (default: 50 MB)
MAX_FILE_SIZE = 50 * 1024 * 1024
