"""
Session dependency for user isolation.

Each browser generates a UUID v4 stored in localStorage and sends it as the
X-Session-ID request header. The backend reads this header and uses it to
scope all DB queries so users only see their own data.

If the header is missing or blank a 400 error is raised — the frontend must
always send it.
"""
import re
from fastapi import Header, HTTPException

# Simple UUID v4 pattern (8-4-4-4-12 hex groups)
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def get_session_id(x_session_id: str = Header(..., alias="X-Session-ID")) -> str:
    """
    FastAPI dependency — extracts and validates the X-Session-ID header.

    Usage in a router:
        session_id: str = Depends(get_session_id)
    """
    sid = (x_session_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="Header X-Session-ID wajib disertakan.")
    if not _UUID_RE.match(sid):
        raise HTTPException(status_code=400, detail="X-Session-ID harus berformat UUID v4.")
    return sid
