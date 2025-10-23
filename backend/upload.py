import json
import os
import boto3
import requests
import time
import io
import base64
import random
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

    if upload_image(search_results, bucket_name, highest_key):
        recipe['key'] = highest_key
        existing_data_json[str(highest_key)] = recipe
        updated_data_json = json.dumps(existing_data_json)    
        s3_client.put_object(Bucket=bucket_name, Key=combined_data_key, Body=updated_data_json, ContentType='application/json')
        return True, existing_data_json
    else:
        return False, existing_data_json

def upload_image(search_results, bucket_name, highest_key):
    images_prefix = 'images/'
    for searched_item in search_results['items']: ## You are returned 10 items from the google search to iterate through and find a good response
        image_url = searched_item['link']
        print(f"Fetching image from URL: {image_url}")
        image_response = requests.get(image_url)

        if image_response.status_code == 200:
            if 'image' in image_response.headers['Content-Type']:
                
                image_data = image_response.content
                image_key = images_prefix + str(highest_key) + '.jpg'

                tmp_image_path = f'/tmp/searchImage.jpg'
                with open(tmp_image_path, 'wb') as image_file:
                    image_file.write(image_data)
                # Upload to S3
                s3_client = boto3.client('s3')
                try:
                    s3_client.put_object(
                        Bucket=bucket_name,  # Replace with your bucket name
                        Key=image_key,
                        Body=image_data,
                        ContentType='image/jpeg'  
                    )
                    print('Image uploaded successfully.')
                    return True
                    
                except Exception as e:
                    print(f"Error uploading image to S3: {e}")
                    return False
            else:
                print("The fetched content is not an image.")
        else:
            print(f"Error fetching image: {image_response.status_code}")
    return False    
    

def upload_user_data(prefix, content, type, data, app_time = None):    
    s3_client = boto3.client('s3')
    if not app_time:
        app_time = int(time.time())
    if type=='jpg':
        try:
            data = base64.b64decode(data)
            image = Image.open(io.BytesIO(data))
            jpeg_image_io = io.BytesIO()
            image.convert('RGB').save(jpeg_image_io, format='JPEG')
            data = jpeg_image_io.getvalue()
        except Exception as e:
            print(f"Error converting image to JPEG: {e}")
            return
    image_key = f'{prefix}/{app_time}.{type}'
    try:
        s3_client.put_object(
            Bucket=bucket_name,  # Replace with your bucket name
            Key=image_key,
            Body=data,
            ContentType=content  # Adjust based on the actual image type
        )
        print('User Image uploaded successfully.')
        
        
    except Exception as e:
        print(f"Error uploading User Image to S3: {e}")
    
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
) -> Tuple[Dict, List[str], List[Dict]]:
    """
    Batch upload recipes to S3 with atomic writes using optimistic locking.

    Uses S3 ETags to ensure atomic updates and prevent race conditions.
    Includes retry logic with exponential backoff for conflicts.

    Args:
        recipes: List of recipe dictionaries to upload
        search_results_list: List of Google Image Search results for each recipe

    Returns:
        Tuple of (updated_jsonData, success_keys, errors)
        - updated_jsonData: Full recipe data after successful write
        - success_keys: List of recipe keys that were successfully added
        - errors: List of error dicts with 'file', 'title', 'reason'

    Raises:
        Exception: If max retries exceeded due to race conditions
    """
    MAX_RETRIES = 3
    combined_data_key = 'jsondata/combined_data.json'

    for attempt in range(MAX_RETRIES):
        # Load existing data with ETag
        try:
            response = s3_client.get_object(Bucket=bucket_name, Key=combined_data_key)
            existing_data = json.loads(response['Body'].read())
            etag = response['ETag'].strip('"')
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                existing_data = {}
                etag = None
            else:
                raise

        # Find highest recipe key
        if existing_data:
            highest_key = max(int(key) for key in existing_data.keys())
        else:
            highest_key = 0

        # Process each recipe
        success_keys = []
        errors = []
        next_key = highest_key + 1
        images_to_upload = []

        for file_idx, recipe in enumerate(recipes):
            title = recipe.get('Title', '')
            normalized_title = normalize_title(title)

            # Check for duplicate title (case-insensitive)
            is_duplicate = False
            for existing_recipe in existing_data.values():
                existing_title = existing_recipe.get('Title', '')
                if normalize_title(existing_title) == normalized_title:
                    is_duplicate = True
                    break

            if is_duplicate:
                errors.append({
                    'file': file_idx,
                    'title': title,
                    'reason': 'Recipe title already exists'
                })
                continue

            # Upload image for this recipe
            search_results = search_results_list[file_idx] if file_idx < len(search_results_list) else {'items': []}

            if upload_image(search_results, bucket_name, next_key):
                # Add recipe to data
                recipe['key'] = next_key
                existing_data[str(next_key)] = recipe
                success_keys.append(str(next_key))
                images_to_upload.append(str(next_key))
                next_key += 1
            else:
                errors.append({
                    'file': file_idx,
                    'title': title,
                    'reason': 'Image upload failed'
                })

        # Attempt atomic write with conditional put
        if success_keys:
            try:
                updated_data_json = json.dumps(existing_data)

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

                # Success!
                return existing_data, success_keys, errors

            except ClientError as e:
                if e.response['Error']['Code'] == 'PreconditionFailed':
                    # Race condition detected - rollback uploaded images
                    print(f"Race condition detected on attempt {attempt + 1}, rolling back...")

                    for key in images_to_upload:
                        try:
                            image_key = f'images/{key}.jpg'
                            s3_client.delete_object(Bucket=bucket_name, Key=image_key)
                        except Exception as rollback_error:
                            print(f"Error rolling back image {key}: {rollback_error}")

                    # Retry with exponential backoff
                    if attempt < MAX_RETRIES - 1:
                        delay = random.uniform(0.1, 0.5) * (2 ** attempt)
                        time.sleep(delay)
                        continue
                else:
                    # Other S3 error
                    raise
        else:
            # No successful recipes to upload
            return existing_data, success_keys, errors

    # Max retries exhausted
    raise Exception("Race condition: max retries exceeded after {} attempts".format(MAX_RETRIES))
