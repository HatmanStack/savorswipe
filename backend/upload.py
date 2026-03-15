import base64
import io
import json
import os
import random
import time
from datetime import datetime, timezone
from typing import Dict, List, Tuple
from urllib.parse import urlparse

import boto3
import requests
from botocore.exceptions import ClientError
from PIL import Image

from config import MAX_RETRIES, PROBLEMATIC_DOMAINS
from logger import StructuredLogger

log = StructuredLogger("upload")

bucket_name = os.getenv('S3_BUCKET')


def _get_s3_client():
    """
    Get fresh S3 client.

    Do not cache at module level to avoid stale credentials in Lambda.
    Lambda containers can live for hours, and IAM credentials rotate.
    """
    return boto3.client('s3')


def is_problematic_url(url: str) -> bool:
    """
    Check if URL is from a problematic domain that likely won't return an actual image.

    Args:
        url: Image URL to check

    Returns:
        True if URL should be skipped, False if OK to try
    """
    try:
        # Parse URL to extract hostname
        parsed = urlparse(url)
        hostname = parsed.hostname

        # Handle missing/invalid hostnames
        if not hostname:
            return False

        # Normalize: lowercase and strip "www." prefix
        hostname = hostname.lower()
        if hostname.startswith('www.'):
            hostname = hostname[4:]

        # Check if hostname matches or is subdomain of problematic domain
        for domain in PROBLEMATIC_DOMAINS:
            # Exact match or subdomain match (e.g., "m.instagram.com")
            if hostname == domain or hostname.endswith('.' + domain):
                return True

        return False
    except Exception:
        # If URL parsing fails, treat as non-problematic (don't skip)
        return False


def to_s3(recipe, search_results, jsonData=None):
    combined_data_key = 'jsondata/combined_data.json'
    s3_client = _get_s3_client()
    try:
        if not jsonData:
            existing_data = s3_client.get_object(Bucket=bucket_name, Key=combined_data_key)
            existing_data_body = existing_data['Body'].read()
        else:
            existing_data_body = jsonData
        existing_data_json = json.loads(existing_data_body)
        for existing_recipe in existing_data_json.values():
            if existing_recipe.get('Title') == recipe.get('Title'):
                return False, existing_data_json
        highest_key = len(existing_data_json) + 1
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            existing_data_json = {}
            highest_key = 1
        else:
            raise

    image_url = upload_image(search_results, bucket_name, highest_key)
    if image_url:
        recipe['key'] = highest_key
        recipe['image_url'] = image_url  # Save the source image URL
        # NEW_RECIPE_FEATURE: Add uploadedAt timestamp for frontend "new" indicator
        recipe['uploadedAt'] = datetime.now(timezone.utc).isoformat()
        existing_data_json[str(highest_key)] = recipe
        updated_data_json = json.dumps(existing_data_json)
        s3_client.put_object(Bucket=bucket_name, Key=combined_data_key,
                             Body=updated_data_json, ContentType='application/json')
        return True, existing_data_json
    else:
        return False, existing_data_json


def upload_image(search_results, bucket_name, highest_key):
    log.info("Starting image upload", recipe_key=highest_key, search_results_type=str(type(search_results)), preview=str(search_results)[:200])
    images_prefix = 'images/'

    # Handle both list format (new) and dict format (legacy)
    if isinstance(search_results, list):
        # New format: list of URLs
        log.info("Processing as list format", url_count=len(search_results))
        image_urls = search_results
    elif isinstance(search_results, dict) and 'items' in search_results:
        # Legacy format: {'items': [{'link': 'url'}]}
        log.info("Processing as dict format with 'items' key")
        image_urls = [item['link'] for item in search_results['items']]
    else:
        log.error("Invalid search_results format", format_type=str(type(search_results)))
        return None

    # Filter out problematic URLs before trying to fetch
    filtered_urls = []
    for url in image_urls:
        if is_problematic_url(url):
            log.info("Skipping problematic URL", url=url[:100])
        else:
            filtered_urls.append(url)

    item_count = len(filtered_urls)
    log.info("Valid URLs to try", valid=item_count, filtered=len(image_urls) - len(filtered_urls))

    if item_count == 0:
        log.warning("No valid URLs after filtering")
        return None

    for idx, image_url in enumerate(filtered_urls):
        log.info("Trying image URL", index=idx + 1, total=item_count, url=image_url[:100])

        try:
            # Add headers to appear like a real browser request
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.google.com/',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
            image_response = requests.get(image_url, headers=headers, timeout=10)
        except requests.exceptions.RequestException as e:
            log.error("Request failed", error=str(e))
            continue  # Try next URL

        if image_response.status_code == 200:
            content_type = image_response.headers.get('Content-Type', 'unknown')
            log.info("Successfully fetched", content_type=content_type)

            if 'image' not in content_type:
                log.warning("Not an image, skipping", content_type=content_type)
                continue  # Try next URL

            # Valid image found
            image_data = image_response.content
            log.info("Image fetched", size_bytes=len(image_data))
            image_key = images_prefix + str(highest_key) + '.jpg'

            # Upload to S3
            s3_client = _get_s3_client()
            try:
                log.info("Uploading to S3", bucket=bucket_name, key=image_key)
                s3_client.put_object(
                    Bucket=bucket_name,
                    Key=image_key,
                    Body=image_data,
                    ContentType='image/jpeg'
                )
                log.info("Image uploaded successfully to S3")
                return image_url  # Return the source URL

            except Exception as e:
                log.error("Error uploading image to S3", error=str(e))
                continue  # Try next URL
        else:
            log.error("HTTP error, trying next URL", status_code=image_response.status_code)
            continue  # Try next URL

    log.warning("All image URLs failed", total=item_count)
    return None


def upload_user_data(prefix, content, file_type, data, app_time=None):
    log.info("Uploading user data", prefix=prefix, file_type=file_type)
    s3_client = _get_s3_client()
    if not app_time:
        app_time = int(time.time())

    # Handle different file types
    if file_type == 'jpg':
        try:
            decoded_data = base64.b64decode(data)
            log.info("Converting image to JPEG")
            image = Image.open(io.BytesIO(decoded_data))
            jpeg_image_io = io.BytesIO()
            image.convert('RGB').save(jpeg_image_io, format='JPEG')
            data = jpeg_image_io.getvalue()
            log.info("Image converted", size_bytes=len(data))
        except Exception as e:
            log.error("Error converting image to JPEG", error=str(e))
            return
    elif file_type == 'pdf':
        try:
            data = base64.b64decode(data)
            log.info("PDF file decoded", size_bytes=len(data))
        except Exception as e:
            log.error("Failed to decode PDF base64", error=str(e))
            return
    elif file_type == 'json':
        # Ensure JSON data is encoded to bytes
        if isinstance(data, bytes):
            pass  # Already bytes
        elif isinstance(data, str):
            data = data.encode('utf-8')
        elif isinstance(data, (dict, list)):
            data = json.dumps(data).encode('utf-8')
        else:
            data = json.dumps(data).encode('utf-8')
        log.info("JSON file", size_bytes=len(data))
    image_key = f'{prefix}/{app_time}.{file_type}'
    try:
        log.info("Uploading to S3", bucket=bucket_name, key=image_key)
        s3_client.put_object(
            Bucket=bucket_name,  # Replace with your bucket name
            Key=image_key,
            Body=data,
            ContentType=content  # Adjust based on the actual image type
        )
        log.info("User data uploaded successfully")

    except Exception as e:
        log.error("Error uploading user data to S3", error=str(e))

    return app_time


# New functions for batch processing with atomic writes

def normalize_title(title: str) -> str:
    """
    Normalize recipe title for comparison.

    Args:
        title: Recipe title to normalize

    Returns:
        Lowercase and trimmed title
    """
    return title.lower().strip()


def batch_to_s3_atomic(
    recipes: List[Dict],
    search_results_list: List[Dict]
) -> Tuple[Dict, List[str], Dict[int, str], List[Dict]]:
    """
    Batch upload recipes to S3 with atomic writes using optimistic locking.

    Uses S3 ETags to ensure atomic updates and prevent race conditions.
    Includes retry logic with exponential backoff for conflicts.

    Args:
        recipes: List of recipe dictionaries to upload
        search_results_list: List of Google Image Search results for each recipe

    Returns:
        Tuple of (updated_jsonData, success_keys, position_to_key, errors)
        - updated_jsonData: Full recipe data after successful write
        - success_keys: List of recipe keys that were successfully added
        - position_to_key: Dict mapping position in recipes list to recipe key
        - errors: List of error dicts with 'file', 'title', 'reason'

    Raises:
        Exception: If max retries exceeded due to race conditions
    """
    log.info("Starting batch_to_s3_atomic", recipe_count=len(recipes))
    combined_data_key = 'jsondata/combined_data.json'

    if not bucket_name:
        raise ValueError("S3_BUCKET environment variable not set")

    for attempt in range(MAX_RETRIES):
        log.info("Batch upload attempt", attempt=attempt + 1, max_retries=MAX_RETRIES)
        # Get fresh S3 client for each attempt
        s3_client = _get_s3_client()
        # Load existing data with ETag
        try:
            log.info("Loading existing combined_data.json")
            response = s3_client.get_object(Bucket=bucket_name, Key=combined_data_key)
            existing_data = json.loads(response['Body'].read())
            etag = response['ETag'].strip('"')
            log.info("Loaded existing recipes", count=len(existing_data), etag=etag)
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                log.info("No existing combined_data.json found (first upload)")
                existing_data = {}
                etag = None
            else:
                log.error("S3 error loading combined_data.json", error=str(e))
                raise

        # Find next recipe key based on total count
        if existing_data:
            highest_key = len(existing_data)
            log.info("Existing recipe count", count=highest_key)
        else:
            highest_key = 0
            log.info("No existing recipes, starting from 1")

        # Process each recipe
        success_keys = []
        position_to_key = {}  # Map position in recipes list to recipe key
        errors = []
        next_key = highest_key + 1
        log.info("Processing recipes", count=len(recipes), start_key=next_key)

        for file_idx, recipe in enumerate(recipes):
            log.info("Processing recipe", file_idx=file_idx, recipe_type=str(type(recipe)))
            title = recipe.get('Title', '')
            log.info("Processing recipe", file_idx=file_idx, title=title)
            normalized_title = normalize_title(title)

            # Check for duplicate title (case-insensitive)
            is_duplicate = False
            for existing_recipe in existing_data.values():
                existing_title = existing_recipe.get('Title', '')
                if normalize_title(existing_title) == normalized_title:
                    is_duplicate = True
                    break

            if is_duplicate:
                log.info("Recipe is a duplicate title", file_idx=file_idx)
                errors.append({
                    'file': file_idx,
                    'title': title,
                    'reason': 'Recipe title already exists'
                })
                continue

            # Store image search results for user selection (picture picker feature)
            search_results = search_results_list[file_idx] if file_idx < len(
                search_results_list) else []
            log.info("Storing image URLs", file_idx=file_idx, key=next_key, url_count=len(search_results))

            # PICTURE_PICKER: Store URLs in image_search_results, don't upload yet
            # User will select preferred image via ImagePickerModal in frontend
            if isinstance(search_results, list) and len(search_results) > 0:
                log.info("Image URLs stored successfully", key=next_key)
                # Add recipe to data with search results but NO image_url
                recipe['key'] = next_key
                recipe['image_search_results'] = search_results  # Store all URLs for user selection
                # Do NOT set image_url - this signals frontend to show ImagePickerModal
                # NEW_RECIPE_FEATURE: Add uploadedAt timestamp for frontend "new" indicator
                recipe['uploadedAt'] = datetime.now(timezone.utc).isoformat()
                existing_data[str(next_key)] = recipe
                success_keys.append(str(next_key))
                position_to_key[file_idx] = str(next_key)  # Track position mapping
                next_key += 1
            else:
                log.error("No image URLs available for recipe", file_idx=file_idx)
                errors.append({
                    'file': file_idx,
                    'title': title,
                    'reason': 'No image search results available'
                })

        log.info("Batch processing complete", success=len(success_keys), errors=len(errors))

        # Attempt atomic write with conditional put
        if success_keys:
            try:
                updated_data_json = json.dumps(existing_data)
                log.info("Attempting atomic write to S3", etag=etag)

                params = {
                    'Bucket': bucket_name,
                    'Key': combined_data_key,
                    'Body': updated_data_json,
                    'ContentType': 'application/json'
                }

                # Add conditional write if ETag exists
                if etag is not None:
                    params['IfMatch'] = etag

                s3_client.put_object(**params)  # type: ignore
                log.info("Atomic write successful")

                # Success!
                return existing_data, success_keys, position_to_key, errors

            except ClientError as e:
                if e.response['Error']['Code'] == 'PreconditionFailed':
                    # Race condition detected - retry with exponential backoff
                    log.warning("Race condition detected, retrying", attempt=attempt + 1)

                    if attempt < MAX_RETRIES - 1:
                        delay = random.uniform(0.1, 0.5) * (2 ** attempt)
                        log.info("Retrying after delay", delay_seconds=round(delay, 2))
                        time.sleep(delay)
                        continue
                else:
                    # Other S3 error
                    log.error("S3 error during atomic write", error=str(e))
                    raise
        else:
            # No successful recipes to upload
            log.info("No successful recipes to upload")
            return existing_data, success_keys, position_to_key, errors

    # Max retries exhausted
    log.error("Max retries exhausted", max_retries=MAX_RETRIES)
    raise Exception("Race condition: max retries exceeded after {} attempts".format(MAX_RETRIES))
