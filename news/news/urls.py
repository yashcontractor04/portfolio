"""URL clean-up, so the same article reached through two links is one article."""

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Query parameters that only track where a click came from. Removing them does not
# change which page is served.
TRACKING_PREFIXES = ("utm_", "at_", "pk_", "mc_")
TRACKING_PARAMS = {"fbclid", "gclid", "igshid", "ocid", "cmpid", "ref", "ref_src", "smid", "xtor", "wt_mc"}


def canonical_url(url: str) -> str | None:
    """Normalised form of an article link, or None if it is not a plain web link.

    Lower-cases scheme and host, drops the #fragment, default ports and tracking
    parameters, and sorts what is left of the query string.
    """
    try:
        parts = urlsplit(url.strip())
        port = parts.port
    except ValueError:
        return None
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        return None
    host = parts.hostname.lower()
    if port and port not in (80, 443):
        host = f"{host}:{port}"
    query = sorted(
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key.lower() not in TRACKING_PARAMS and not key.lower().startswith(TRACKING_PREFIXES)
    )
    canonical = urlunsplit((parts.scheme.lower(), host, parts.path or "/", urlencode(query), ""))
    return canonical if len(canonical) <= 2000 else None


def https_or_none(url: str | None) -> str | None:
    """Image links are only kept when they are https (the page itself is https)."""
    if not url:
        return None
    cleaned = url.strip()
    return cleaned if cleaned.startswith("https://") and len(cleaned) <= 2000 else None
