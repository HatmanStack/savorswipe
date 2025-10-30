import json
import os
import boto3
import requests
import time
import io
import base64
import random
from datetime import datetime, timezone
from PIL import Image
from botocore.exceptions import ClientError
from typing import List, Dict, Tuple, Optional

s3_client = boto3.client('s3')
bucket_name = os.getenv('S3_BUCKET') 

def to_s3(recipe, search_results, jsonData = None):
    combined_data_key = 'jsondata/combined_data.json'
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
        highest_key = max(int(key) for key in existing_data_json.keys()) + 1
    except s3_client.exceptions.NoSuchKey:
        existing_data_json = {}
        highest_key = 1  # Start with 1 if no existing data

    image_url = upload_image(search_results, bucket_name, highest_key)
    if image_url:
        recipe['key'] = highest_key
        recipe['image_url'] = image_url  # Save the source image URL
        # NEW_RECIPE_FEATURE: Add uploadedAt timestamp for frontend "new" indicator
        recipe['uploadedAt'] = datetime.now(timezone.utc).isoformat()
        existing_data_json[str(highest_key)] = recipe
        updated_data_json = json.dumps(existing_data_json)
        s3_client.put_object(Bucket=bucket_name, Key=combined_data_key, Body=updated_data_json, ContentType='application/json')
        return True, existing_data_json
    else:
        return False, existing_data_json

def upload_image(search_results, bucket_name, highest_key):
    print(f"[UPLOAD] Starting image upload for recipe key {highest_key}")
    print(f"[UPLOAD] search_results type: {type(search_results)}")
    print(f"[UPLOAD] search_results preview: {str(search_results)[:200]}")
    images_prefix = 'images/'

    # Handle both list format (new) and dict format (legacy)
    if isinstance(search_results, list):
        # New format: list of URLs
        print(f"[UPLOAD] Processing as list format ({len(search_results)} URLs)")
        image_urls = search_results
    elif isinstance(search_results, dict) and 'items' in search_results:
        # Legacy format: {'items': [{'link': 'url'}]}
        print(f"[UPLOAD] Processing as dict format with 'items' key")
        image_urls = [item['link'] for item in search_results['items']]
    else:
        print(f"[UPLOAD ERROR] Invalid search_results format: {type(search_results)}")
        return None

    item_count = len(image_urls)
    print(f"[UPLOAD] Have {item_count} search result URLs to try")

    if item_count == 0:
        print(f"[UPLOAD] No search results provided, returning None")
        return None

    for idx, image_url in enumerate(image_urls):
        print(f"[UPLOAD] Trying image {idx + 1}/{item_count} from URL: {image_url[:100]}...")

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
            print(f"[UPLOAD ERROR] Request failed: {e}")
            continue  # Try next URL

        if image_response.status_code == 200:
            content_type = image_response.headers.get('Content-Type', 'unknown')
            print(f"[UPLOAD] Successfully fetched, content-type: {content_type}")

            if 'image' not in content_type:
                print(f"[UPLOAD WARNING] Not an image (skipping): {content_type}")
                continue  # Try next URL

            # Valid image found
            image_data = image_response.content
            print(f"[UPLOAD] Image size: {len(image_data)} bytes")
            image_key = images_prefix + str(highest_key) + '.jpg'

            tmp_image_path = f'/tmp/searchImage.jpg'
            with open(tmp_image_path, 'wb') as image_file:
                image_file.write(image_data)
            print(f"[UPLOAD] Wrote temporary file to {tmp_image_path}")

            # Upload to S3
            s3_client = boto3.client('s3')
            try:
                print(f"[UPLOAD] Uploading to S3: {bucket_name}/{image_key}")
                s3_client.put_object(
                    Bucket=bucket_name,
                    Key=image_key,
                    Body=image_data,
                    ContentType='image/jpeg'
                )
                print(f'[UPLOAD] Image uploaded successfully to S3')
                return image_url  # Return the source URL

            except Exception as e:
                print(f"[UPLOAD ERROR] Error uploading image to S3: {e}")
                continue  # Try next URL
        else:
            print(f"[UPLOAD ERROR] HTTP {image_response.status_code}, trying next URL")
            continue  # Try next URL

    print(f"[UPLOAD] All {item_count} image URLs failed, returning None")
    return None    
    

def upload_user_data(prefix, content, file_type, data, app_time=None):
    print(f"[UPLOAD] Uploading user data to {prefix}, file_type={file_type}")
    s3_client = boto3.client('s3')
    if not app_time:
        app_time = int(time.time())
    if file_type == 'jpg':
        try:
            print(f"[UPLOAD] Converting image to JPEG...")
            data = base64.b64decode(data)
            image = Image.open(io.BytesIO(data))
            jpeg_image_io = io.BytesIO()
            image.convert('RGB').save(jpeg_image_io, format='JPEG')
            data = jpeg_image_io.getvalue()
            print(f"[UPLOAD] Image converted, size: {len(data)} bytes")
        except Exception as e:
            print(f"[UPLOAD ERROR] Error converting image to JPEG: {e}")
            return
    image_key = f'{prefix}/{app_time}.{file_type}'
    try:
        print(f"[UPLOAD] Uploading to S3: {bucket_name}/{image_key}")
        s3_client.put_object(
            Bucket=bucket_name,  # Replace with your bucket name
            Key=image_key,
            Body=data,
            ContentType=content  # Adjust based on the actual image type
        )
        print(f'[UPLOAD] User data uploaded successfully')


    except Exception as e:
        print(f"[UPLOAD ERROR] Error uploading User Image to S3: {e}")

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
    print(f"[UPLOAD] Starting batch_to_s3_atomic with {len(recipes)} recipes")
    MAX_RETRIES = 3
    combined_data_key = 'jsondata/combined_data.json'

    for attempt in range(MAX_RETRIES):
        print(f"[UPLOAD] Attempt {attempt + 1}/{MAX_RETRIES}")
        # Load existing data with ETag
        try:
            print(f"[UPLOAD] Loading existing combined_data.json...")
            response = s3_client.get_object(Bucket=bucket_name, Key=combined_data_key)
            existing_data = json.loads(response['Body'].read())
            etag = response['ETag'].strip('"')
            print(f"[UPLOAD] Loaded {len(existing_data)} existing recipes, ETag: {etag}")
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                print(f"[UPLOAD] No existing combined_data.json found (first upload)")
                existing_data = {}
                etag = None
            else:
                print(f"[UPLOAD ERROR] S3 error loading combined_data.json: {e}")
                raise

        # Find highest recipe key
        if existing_data:
            highest_key = max(int(key) for key in existing_data.keys())
            print(f"[UPLOAD] Highest existing key: {highest_key}")
        else:
            highest_key = 0
            print(f"[UPLOAD] No existing keys, starting from 1")

        # Process each recipe
        success_keys = []
        position_to_key = {}  # Map position in recipes list to recipe key
        errors = []
        next_key = highest_key + 1
        images_to_upload = []
        print(f"[UPLOAD] Processing {len(recipes)} recipes starting from key {next_key}")

        for file_idx, recipe in enumerate(recipes):
            print(f"[UPLOAD] Processing recipe {file_idx}, type: {type(recipe)}")
            title = recipe.get('Title', '')
            print(f"[UPLOAD] Processing recipe {file_idx}: '{title}'")
            normalized_title = normalize_title(title)

            # Check for duplicate title (case-insensitive)
            is_duplicate = False
            for existing_recipe in existing_data.values():
                existing_title = existing_recipe.get('Title', '')
                if normalize_title(existing_title) == normalized_title:
                    is_duplicate = True
                    break

            if is_duplicate:
                print(f"[UPLOAD] Recipe {file_idx} is a duplicate title")
                errors.append({
                    'file': file_idx,
                    'title': title,
                    'reason': 'Recipe title already exists'
                })
                continue

            # Upload image for this recipe
            search_results = search_results_list[file_idx] if file_idx < len(search_results_list) else {'items': []}
            print(f"[UPLOAD] Uploading image for recipe {file_idx} (key {next_key})...")

            image_url = upload_image(search_results, bucket_name, next_key)
            if image_url:
                print(f"[UPLOAD] Image uploaded successfully for key {next_key}")
                # Add recipe to data
                recipe['key'] = next_key
                recipe['image_url'] = image_url  # Save the source image URL
                # NEW_RECIPE_FEATURE: Add uploadedAt timestamp for frontend "new" indicator
                recipe['uploadedAt'] = datetime.now(timezone.utc).isoformat()
                existing_data[str(next_key)] = recipe
                success_keys.append(str(next_key))
                position_to_key[file_idx] = str(next_key)  # Track position mapping
                images_to_upload.append(str(next_key))
                next_key += 1
            else:
                print(f"[UPLOAD ERROR] Image upload failed for recipe {file_idx}")
                errors.append({
                    'file': file_idx,
                    'title': title,
                    'reason': 'Image upload failed'
                })

        print(f"[UPLOAD] Batch processing complete: {len(success_keys)} success, {len(errors)} errors")

        # Attempt atomic write with conditional put
        if success_keys:
            try:
                updated_data_json = json.dumps(existing_data)
                print(f"[UPLOAD] Attempting atomic write to S3 with ETag={etag}")

                params = {
                    'Bucket': bucket_name,
                    'Key': combined_data_key,
                    'Body': updated_data_json,
                    'ContentType': 'application/json'
                }

                # Add conditional write if ETag exists
                if etag is not None:
                    params['IfMatch'] = etag

                s3_client.put_object(**params)
                print(f"[UPLOAD] Atomic write successful!")

                # Success!
                return existing_data, success_keys, position_to_key, errors

            except ClientError as e:
                if e.response['Error']['Code'] == 'PreconditionFailed':
                    # Race condition detected - rollback uploaded images
                    print(f"[UPLOAD WARNING] Race condition detected on attempt {attempt + 1}, rolling back...")

                    for key in images_to_upload:
                        try:
                            image_key = f'images/{key}.jpg'
                            print(f"[UPLOAD] Rolling back image {image_key}")
                            s3_client.delete_object(Bucket=bucket_name, Key=image_key)
                        except Exception as rollback_error:
                            print(f"[UPLOAD ERROR] Error rolling back image {key}: {rollback_error}")

                    # Retry with exponential backoff
                    if attempt < MAX_RETRIES - 1:
                        delay = random.uniform(0.1, 0.5) * (2 ** attempt)
                        print(f"[UPLOAD] Retrying after {delay:.2f}s delay...")
                        time.sleep(delay)
                        continue
                else:
                    # Other S3 error
                    print(f"[UPLOAD ERROR] S3 error during atomic write: {e}")
                    raise
        else:
            # No successful recipes to upload
            print(f"[UPLOAD] No successful recipes to upload")
            return existing_data, success_keys, position_to_key, errors

    # Max retries exhausted
    print(f"[UPLOAD ERROR] Max retries exhausted after {MAX_RETRIES} attempts")
    raise Exception("Race condition: max retries exceeded after {} attempts".format(MAX_RETRIES))
