"""
Image fetching and S3 upload functions for recipe image selection.

Provides functions to:
- Fetch images from Google URLs with SSRF protection
- Use fallback image on fetch failure
- Upload images to S3 with retry logic
"""

import ipaddress
import logging
import os
import random
import socket
import time
import urllib.parse
from typing import Optional, Tuple
from botocore.exceptions import ClientError
import requests

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Allowed domains for image fetching (whitelist to prevent SSRF)
# Restricted to Google image CDN subdomains from Google Search results
# CloudFront or other CDN domains should be added explicitly when configured
ALLOWED_DOMAINS = {
    'lh3.googleusercontent.com',  # Google image results
    'lh4.googleusercontent.com',
    'lh5.googleusercontent.com',
    'lh6.googleusercontent.com',
    'lh7.googleusercontent.com',
    'images.google.com',
}


def _validate_image_url(image_url: str) -> bool:
    """
    Validate image URL to prevent SSRF attacks.

    Checks:
    1. URL uses HTTPS scheme
    2. Hostname is in the whitelist
    3. Hostname resolves to public IP (not private/reserved)

    Args:
        image_url: URL to validate

    Returns:
        True if URL is safe to fetch, False otherwise
    """
    try:
        parsed = urllib.parse.urlparse(image_url)

        # Check scheme is HTTPS
        if parsed.scheme != 'https':
            logger.warning(f"[IMAGE] Disallowed URL scheme (not HTTPS): {parsed.scheme}")
            return False

        hostname = parsed.hostname
        if not hostname:
            logger.warning(f"[IMAGE] URL has no hostname: {image_url}")
            return False

        # Check hostname is in whitelist
        if hostname not in ALLOWED_DOMAINS:
            logger.warning(f"[IMAGE] Disallowed hostname (not whitelisted): {hostname}")
            return False

        # Resolve hostname to IP and check it's not private/reserved
        try:
            ip_str = socket.gethostbyname(hostname)
            ip = ipaddress.ip_address(ip_str)

            # Reject private, loopback, link-local, multicast addresses
            if (ip.is_private or ip.is_loopback or ip.is_link_local or
                ip.is_multicast or ip.is_reserved):
                logger.warning(
                    f"[IMAGE] Refusing to fetch private/reserved IP: {hostname} -> {ip_str}"
                )
                return False

            logger.info(f"[IMAGE] URL validation passed: {hostname} -> {ip_str}")
            return True

        except (socket.gaierror, socket.error) as e:
            logger.warning(f"[IMAGE] Failed to resolve hostname {hostname}: {str(e)}")
            return False

    except Exception as e:
        logger.error(f"[IMAGE] Error validating URL: {str(e)}")
        return False


def fetch_image_from_url(image_url: str, timeout: int = 10) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Fetch image from Google URL with SSRF protection.

    Args:
        image_url: URL to fetch image from
        timeout: Request timeout in seconds (default: 10)

    Returns:
        Tuple of (image_bytes, content_type) on success,
        (None, None) on failure
    """
    if not image_url:
        logger.warning("[IMAGE] Empty image_url provided")
        return None, None

    logger.info(f"[IMAGE] Fetching image from URL: {image_url[:100]}...")

    # Validate URL to prevent SSRF attacks
    if not _validate_image_url(image_url):
        logger.warning(f"[IMAGE] URL validation failed, refusing to fetch: {image_url[:100]}...")
        return None, None

    try:
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

        # Disable redirects to unvalidated hosts
        response = requests.get(image_url, headers=headers, timeout=timeout, allow_redirects=False)

        if response.status_code != 200:
            logger.warning(f"[IMAGE] Failed to fetch: HTTP {response.status_code}")
            return None, None

        # Validate content-type
        content_type = response.headers.get('Content-Type', '')
        if 'image' not in content_type.lower():
            logger.warning(f"[IMAGE] Invalid content-type (not an image): {content_type}")
            return None, None

        image_bytes = response.content
        logger.info(f"[IMAGE] Successfully fetched {len(image_bytes)} bytes, content-type: {content_type}")

        return image_bytes, content_type

    except requests.exceptions.Timeout:
        logger.warning(f"[IMAGE] Request timeout after {timeout}s")
        return None, None
    except requests.exceptions.RequestException as e:
        logger.warning(f"[IMAGE] Request failed: {str(e)}")
        return None, None
    except Exception as e:
        logger.error(f"[IMAGE] Unexpected error fetching image: {str(e)}")
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

    Args:
        recipe_key: Recipe key for S3 path (images/{recipe_key}.ext)
        image_bytes: Image bytes to upload
        s3_client: Boto3 S3 client
        bucket: S3 bucket name
        max_retries: Maximum retry attempts (default: 3)
        content_type: MIME type of the image (default: 'image/jpeg')

    Returns:
        Tuple of (s3_path, error_message)
        - On success: (s3_path, None) where s3_path = "images/{recipe_key}.ext"
        - On failure: (None, error_message)
    """
    # Determine file extension based on content-type
    extension_map = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
    }

    # Extract extension from content-type or default to jpg
    extension = extension_map.get(content_type.lower(), 'jpg')
    s3_key = f"images/{recipe_key}.{extension}"

    if not image_bytes:
        logger.error(f"[IMAGE] No image bytes provided for {s3_key}")
        return None, "No image bytes provided"

    logger.info(f"[IMAGE] Uploading image to S3: {bucket}/{s3_key} ({len(image_bytes)} bytes, content-type: {content_type})")

    for attempt in range(max_retries):
        try:
            logger.info(f"[IMAGE] Upload attempt {attempt + 1}/{max_retries}")

            s3_client.put_object(
                Bucket=bucket,
                Key=s3_key,
                Body=image_bytes,
                ContentType=content_type
            )

            logger.info(f"[IMAGE] Successfully uploaded {s3_key}")
            return s3_key, None

        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            error_msg = str(e)

            if error_code == 'PreconditionFailed':
                # Race condition on ETag
                logger.warning(f"[IMAGE] Race condition on attempt {attempt + 1}, retrying...")
                if attempt < max_retries - 1:
                    delay = random.uniform(0.1, 0.5) * (2 ** attempt)
                    logger.info(f"[IMAGE] Retrying after {delay:.2f}s...")
                    time.sleep(delay)
                    continue
                else:
                    return None, f"Race condition: max retries exceeded after {max_retries} attempts"
            else:
                logger.error(f"[IMAGE] S3 error: {error_code} - {error_msg}")
                return None, f"S3 error: {error_msg}"

        except Exception as e:
            logger.error(f"[IMAGE] Unexpected error uploading to S3: {str(e)}")
            return None, f"Unexpected error: {str(e)}"

    return None, f"Max retries ({max_retries}) exceeded"


