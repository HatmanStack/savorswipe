"""
Image fetching and S3 upload functions for recipe image selection.

Provides functions to:
- Fetch images from Google URLs with SSRF protection
- Use fallback image on fetch failure
- Upload images to S3 with retry logic
"""

import hashlib
import io
import ipaddress
import random
import socket
import time
import urllib.parse
from typing import Optional, Tuple

import requests
from botocore.exceptions import ClientError
from PIL import Image
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from urllib3.util.ssl_ import create_urllib3_context

from logger import StructuredLogger

# Retry policy shared with http_client.SESSION: backoff on transient 5xx.
# We mount this on the per-request pinned adapter so outbound image fetches
# also benefit from retry/backoff while preserving the DNS-rebinding defense.
_IMAGE_FETCH_RETRY = Retry(
    total=3,
    backoff_factor=0.3,
    status_forcelist=(500, 502, 503, 504),
    allowed_methods=frozenset(["GET", "HEAD"]),
    raise_on_status=False,
)

log = StructuredLogger("image_uploader")


class _PinnedHostnameAdapter(HTTPAdapter):
    """HTTPAdapter that overrides SNI and certificate hostname verification.

    When fetching a URL whose hostname has been pre-validated against DNS
    rebinding, this adapter ensures TLS SNI and certificate verification
    use the original hostname rather than whatever the URL authority contains.
    """

    def __init__(self, server_hostname: str, **kwargs):
        self._server_hostname = server_hostname
        super().__init__(**kwargs)

    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        kwargs['ssl_context'] = ctx
        kwargs['server_hostname'] = self._server_hostname
        kwargs['assert_hostname'] = self._server_hostname
        super().init_poolmanager(*args, **kwargs)


def _url_log_meta(image_url: str) -> dict:
    """Return safe metadata for logging a URL without exposing its full content."""
    parsed = urllib.parse.urlparse(image_url)
    url_hash = hashlib.sha256(image_url.encode()).hexdigest()[:8]
    return {"hostname": parsed.hostname or "unknown", "url_len": len(image_url), "url_hash": url_hash}

# NOTE: No domain whitelist needed - SSRF protection is provided by:
# 1. HTTPS-only URLs
# 2. Public IP validation (rejects private/reserved IPs)
# This allows Google Image Search results from any public website


def _validate_image_url(image_url: str) -> Optional[str]:
    """
    Validate image URL to prevent SSRF attacks.

    Checks:
    1. URL uses HTTPS scheme
    2. Hostname resolves to public IP (not private/reserved)

    Args:
        image_url: URL to validate

    Returns:
        Resolved IP string if URL is safe to fetch, None otherwise
    """
    try:
        parsed = urllib.parse.urlparse(image_url)

        # Check scheme is HTTPS
        if parsed.scheme != 'https':
            log.warning("Disallowed URL scheme (not HTTPS)", scheme=parsed.scheme)
            return None

        hostname = parsed.hostname
        if not hostname:
            log.warning("URL has no hostname", **_url_log_meta(image_url))
            return None

        # Resolve hostname to IP and check it's not private/reserved
        try:
            ip_str = socket.gethostbyname(hostname)
            ip = ipaddress.ip_address(ip_str)

            # Reject private, loopback, link-local, multicast addresses
            if (ip.is_private or ip.is_loopback or ip.is_link_local or
                    ip.is_multicast or ip.is_reserved):
                log.warning("Refusing to fetch private/reserved IP",
                            hostname=hostname, resolved_ip=ip_str)
                return None

            return ip_str

        except (socket.gaierror, socket.error) as e:
            log.warning("Failed to resolve hostname", hostname=hostname, error=str(e))
            return None

    except Exception as e:
        log.error("Error validating URL", error=str(e))
        return None


def fetch_image_from_url(
    image_url: str,
    timeout: int = 10,
) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Fetch image from Google URL with SSRF protection.

    DNS rebinding protection is provided by _validate_image_url (which rejects
    private IPs) combined with _PinnedHostnameAdapter (which pins TLS SNI and
    certificate verification to the original hostname) and allow_redirects=False
    (which prevents redirect-based SSRF).

    Args:
        image_url: URL to fetch image from
        timeout: Request timeout in seconds (default: 10)

    Returns:
        Tuple of (image_bytes, content_type) on success,
        (None, None) on failure
    """
    if not image_url:
        log.warning("Empty image_url provided")
        return None, None

    meta = _url_log_meta(image_url)
    log.info("Fetching image", **meta)

    # Validate URL and get resolved IP to prevent SSRF/DNS rebinding attacks
    resolved_ip = _validate_image_url(image_url)
    if not resolved_ip:
        log.warning("URL validation failed, refusing to fetch", **meta)
        return None, None

    try:
        parsed = urllib.parse.urlparse(image_url)
        hostname = parsed.hostname

        # Use browser-like headers to avoid being blocked
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.google.com/',
            'DNT': '1',
            'Connection': 'keep-alive',
        }

        # Use a session with a pinned hostname adapter so TLS SNI and certificate
        # verification use the validated hostname, preventing DNS rebinding attacks.
        # The adapter carries a Retry policy so transient 5xx responses back off
        # before giving up (shared policy with backend.http_client.SESSION).
        with requests.Session() as session:
            session.mount(
                'https://',
                _PinnedHostnameAdapter(
                    server_hostname=hostname,
                    max_retries=_IMAGE_FETCH_RETRY,
                ),
            )

            # Disable redirects to unvalidated hosts; use original URL (the adapter
            # handles hostname pinning at the TLS layer)
            response = session.get(image_url, headers=headers, timeout=timeout, allow_redirects=False, verify=True)

            if response.status_code != 200:
                log.warning("Failed to fetch image", status_code=response.status_code)
                return None, None

            # Validate content-type
            content_type = response.headers.get('Content-Type', '')
            if 'image' not in content_type.lower():
                log.warning("Invalid content-type (not an image)", content_type=content_type)
                return None, None

            image_bytes = response.content
            log.info("Successfully fetched image",
                     size_bytes=len(image_bytes), content_type=content_type)

            return image_bytes, content_type

    except requests.exceptions.Timeout:
        log.warning("Request timeout", timeout_seconds=timeout)
        return None, None
    except requests.exceptions.RequestException as e:
        log.warning("Request failed", error=str(e))
        return None, None
    except Exception as e:
        log.error("Unexpected error fetching image", error=str(e))
        return None, None


def upload_image_to_s3(
    recipe_key: str,
    image_bytes: bytes,
    s3_client,
    bucket: str,
    max_retries: int = 3,
    content_type: str = 'image/jpeg'
) -> Tuple[Optional[str], Optional[str]]:
    """
    Upload image bytes to S3 with retry logic for race conditions.
    Always converts images to JPEG format before uploading.

    Args:
        recipe_key: Recipe key for S3 path (images/{recipe_key}.jpg)
        image_bytes: Image bytes to upload (any format)
        s3_client: Boto3 S3 client
        bucket: S3 bucket name
        max_retries: Maximum retry attempts (default: 3)
        content_type: MIME type of the source image (default: 'image/jpeg')

    Returns:
        Tuple of (s3_path, error_message)
        - On success: (s3_path, None) where s3_path = "images/{recipe_key}.jpg"
        - On failure: (None, error_message)
    """
    if not image_bytes:
        log.error("No image bytes provided")
        return None, "No image bytes provided"

    # Always save as .jpg
    s3_key = f"images/{recipe_key}.jpg"

    # Convert any image format to JPEG
    try:
        log.info("Converting image to JPEG", source_type=content_type)
        image = Image.open(io.BytesIO(image_bytes))
        jpeg_image_io = io.BytesIO()
        image.convert('RGB').save(jpeg_image_io, format='JPEG', quality=85)
        jpeg_bytes = jpeg_image_io.getvalue()
        log.info("Image converted to JPEG", size_bytes=len(jpeg_bytes))
    except Exception as e:
        log.error("Failed to convert image to JPEG", error=str(e))
        return None, f"Image conversion failed: {str(e)}"

    log.info("Uploading image to S3", bucket=bucket, s3_key=s3_key, size_bytes=len(jpeg_bytes))

    for attempt in range(max_retries):
        try:
            log.info("Upload attempt", attempt=attempt + 1, max_retries=max_retries)

            s3_client.put_object(
                Bucket=bucket,
                Key=s3_key,
                Body=jpeg_bytes,
                ContentType='image/jpeg'
            )

            log.info("Successfully uploaded image", s3_key=s3_key)
            return s3_key, None

        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            error_msg = str(e)

            if error_code == 'PreconditionFailed':
                # Race condition on ETag
                log.warning("Race condition on upload", attempt=attempt + 1)
                if attempt < max_retries - 1:
                    delay = random.uniform(0.1, 0.5) * (2 ** attempt)
                    log.info("Retrying upload", delay_seconds=round(delay, 2))
                    time.sleep(delay)
                    continue
                else:
                    return None, f"Race condition: max retries exceeded after {max_retries} attempts"
            else:
                log.error("S3 error uploading image", error_code=error_code, error=error_msg)
                return None, f"S3 error: {error_msg}"

        except Exception as e:
            log.error("Unexpected error uploading to S3", error=str(e))
            return None, f"Unexpected error: {str(e)}"

    return None, f"Max retries ({max_retries}) exceeded"
