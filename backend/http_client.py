"""Shared retrying HTTP session for outbound backend calls.

Phase: 2026-04-07-audit-savorswipe/Phase-4

Exports a module-scope ``SESSION`` configured with backoff retries on
transient 5xx responses. All backend modules that talk to third-party
HTTP endpoints (OpenAI, Google Custom Search, image origins) should
use this session instead of bare ``requests.get`` / ``requests.post``
so retries, connection pooling, and adapter chains stay consistent.

Note: ``image_uploader`` still constructs its own ``requests.Session``
per-fetch because it must mount a request-scoped ``_PinnedHostnameAdapter``
that pins TLS SNI / certificate verification to a DNS-validated hostname
to defeat DNS rebinding. The shared SESSION is used for everything else.
"""

from __future__ import annotations

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

_RETRY = Retry(
    total=3,
    backoff_factor=0.3,
    status_forcelist=(500, 502, 503, 504),
    allowed_methods=frozenset(["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"]),
    raise_on_status=False,
)

_ADAPTER = HTTPAdapter(max_retries=_RETRY, pool_connections=10, pool_maxsize=10)

SESSION: requests.Session = requests.Session()
SESSION.mount("https://", _ADAPTER)
SESSION.mount("http://", _ADAPTER)
