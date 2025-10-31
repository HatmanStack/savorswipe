"""
Image fetching and S3 upload functions for recipe image selection.

Provides functions to:
- Fetch images from Google URLs
- Use fallback image on fetch failure
- Upload images to S3 with retry logic
"""

import logging
import os
import random
import time
from typing import Optional, Tuple
from botocore.exceptions import ClientError
import requests

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def fetch_image_from_url(image_url: str, timeout: int = 10) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Fetch image from Google URL with validation.

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

        response = requests.get(image_url, headers=headers, timeout=timeout)

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


def get_fallback_image() -> Optional[bytes]:
    """
    Read fallback image from assets/images/skillet.png.

    Returns:
        Image bytes on success, None on failure
    """
    fallback_path = "assets/images/skillet.png"
    logger.info(f"[IMAGE] Reading fallback image from {fallback_path}")

    try:
        if not os.path.exists(fallback_path):
            logger.error(f"[IMAGE] Fallback image not found at {fallback_path}")
            return None

        with open(fallback_path, 'rb') as f:
            image_bytes = f.read()

        logger.info(f"[IMAGE] Fallback image loaded: {len(image_bytes)} bytes")
        return image_bytes

    except Exception as e:
        logger.error(f"[IMAGE] Error reading fallback image: {str(e)}")
        return None


def upload_image_to_s3(
    recipe_key: str,
    image_bytes: bytes,
    s3_client,
    bucket: str,
    max_retries: int = 3
) -> Tuple[Optional[str], Optional[str]]:
    """
    Upload image bytes to S3 with retry logic for race conditions.

    Args:
        recipe_key: Recipe key for S3 path (images/{recipe_key}.jpg)
        image_bytes: Image bytes to upload
        s3_client: Boto3 S3 client
        bucket: S3 bucket name
        max_retries: Maximum retry attempts (default: 3)

    Returns:
        Tuple of (s3_path, error_message)
        - On success: (s3_path, None) where s3_path = "images/{recipe_key}.jpg"
        - On failure: (None, error_message)
    """
    s3_key = f"images/{recipe_key}.jpg"

    if not image_bytes:
        logger.error(f"[IMAGE] No image bytes provided for {s3_key}")
        return None, "No image bytes provided"

    logger.info(f"[IMAGE] Uploading image to S3: {bucket}/{s3_key} ({len(image_bytes)} bytes)")

    for attempt in range(max_retries):
        try:
            logger.info(f"[IMAGE] Upload attempt {attempt + 1}/{max_retries}")

            s3_client.put_object(
                Bucket=bucket,
                Key=s3_key,
                Body=image_bytes,
                ContentType='image/jpeg'
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


def fetch_and_upload_image(
    google_image_url: str,
    recipe_key: str,
    s3_client,
    bucket: str
) -> Tuple[Optional[str], Optional[str], bool]:
    """
    Fetch image from Google URL and upload to S3 with fallback handling.

    This is a convenience function that combines fetching and uploading,
    with automatic fallback to skillet.png on fetch failure.

    Args:
        google_image_url: Google image URL to fetch
        recipe_key: Recipe key for S3 path
        s3_client: Boto3 S3 client
        bucket: S3 bucket name

    Returns:
        Tuple of (s3_path, error_message, used_fallback)
        - s3_path: S3 path of uploaded image (images/{recipe_key}.jpg)
        - error_message: None on success, error string on failure
        - used_fallback: True if fallback image was used, False for original
    """
    logger.info(f"[IMAGE] Fetching and uploading image for recipe '{recipe_key}'")

    # Try to fetch the original image
    image_bytes, content_type = fetch_image_from_url(google_image_url)

    # If fetch fails, use fallback
    if image_bytes is None:
        logger.warning(f"[IMAGE] Failed to fetch from Google, using fallback image")
        image_bytes = get_fallback_image()
        used_fallback = True

        if image_bytes is None:
            return None, "Failed to fetch image and fallback not available", True
    else:
        used_fallback = False

    # Upload to S3
    s3_path, error_msg = upload_image_to_s3(recipe_key, image_bytes, s3_client, bucket)

    return s3_path, error_msg, used_fallback
