"""Shared HTTP session retry behavior + SSRF pin preservation.

Phase: 2026-04-07-audit-savorswipe/Phase-4
"""

from __future__ import annotations

import http_client
from image_uploader import _IMAGE_FETCH_RETRY, _PinnedHostnameAdapter


def test_session_has_retry_adapter_for_https():
    """SESSION must mount an adapter on https:// with our backoff retry policy."""
    adapter = http_client.SESSION.get_adapter("https://api.openai.com/")
    assert adapter is http_client._ADAPTER
    retry = adapter.max_retries
    assert retry.total == 3
    assert retry.backoff_factor == 0.3
    for code in (500, 502, 503, 504):
        assert code in retry.status_forcelist


def test_session_has_retry_adapter_for_http():
    """SESSION also covers http:// origins (non-prod search/test endpoints)."""
    adapter = http_client.SESSION.get_adapter("http://example.com/")
    assert adapter is http_client._ADAPTER


def test_image_fetch_retry_covers_5xx():
    """image_uploader retry policy mirrors the shared session policy."""
    assert _IMAGE_FETCH_RETRY.total == 3
    assert _IMAGE_FETCH_RETRY.backoff_factor == 0.3
    for code in (500, 502, 503, 504):
        assert code in _IMAGE_FETCH_RETRY.status_forcelist


def test_image_uploader_pinned_adapter_carries_retry_policy():
    """Image fetch path must keep its DNS-rebinding pin AND retry on 5xx."""
    adapter = _PinnedHostnameAdapter(
        server_hostname="example.com",
        max_retries=http_client._RETRY,
    )

    # Pin survives.
    assert adapter._server_hostname == "example.com"
    # Retry config is wired through HTTPAdapter.max_retries.
    assert adapter.max_retries.total == 3
    assert 503 in adapter.max_retries.status_forcelist
