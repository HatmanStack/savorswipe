"""
AWS Lambda Handler for Multi-File Recipe Processing

Processes multiple images and PDFs containing recipes with:
- Parallel processing (ThreadPoolExecutor, 3 workers)
- Semantic duplicate detection using OpenAI embeddings
- Atomic batch uploads to S3 with race condition protection
- Image URL deduplication
- CloudWatch metrics
- S3 completion flags for offline detection
"""

import base64
import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Tuple, Optional

import boto3
import handlepdf
import ocr
import upload
import search_image as si
from embeddings import EmbeddingStore
from embedding_generator import EmbeddingGenerator
from duplicate_detector import DuplicateDetector
from upload import batch_to_s3_atomic


def process_single_recipe(
    recipe_data: Dict,
    embedding_generator: EmbeddingGenerator,
    duplicate_detector: DuplicateDetector
) -> Tuple[Optional[Dict], Optional[List[float]], Optional[List[str]], Optional[str]]:
    """
    Process a single recipe: generate embedding, check for duplicates, search for image.

    Args:
        recipe_data: Recipe dictionary with Title, Ingredients, etc.
        embedding_generator: Embedding generator instance
        duplicate_detector: Duplicate detector instance

    Returns:
        Tuple of (recipe, embedding, search_results, error_reason)
        - On success: (recipe_dict, embedding_vector, image_urls_list, None)
        - On duplicate: (None, None, None, error_message)
        - On error: (None, None, None, error_message)
    """
    try:
        # Extract title
        title = recipe_data.get('Title', 'Unknown Recipe')

        # Generate embedding
        embedding = embedding_generator.generate_recipe_embedding(recipe_data)

        # Check for duplicate
        is_duplicate, duplicate_key, similarity_score = duplicate_detector.is_duplicate(embedding)

        if is_duplicate:
            error_reason = f"Duplicate of recipe {duplicate_key} (similarity: {similarity_score:.2f})"
            return None, None, None, error_reason

        # Search for images
        search_results = si.google_search_image(title, count=10)

        return recipe_data, embedding, search_results, None

    except Exception as e:
        error_reason = f"Processing failed: {str(e)}"
        return None, None, None, error_reason


def lambda_handler(event, context):
    """
    AWS Lambda handler for processing recipe uploads.

    Event format:
    {
        "files": [
            {"base64": "...", "type": "image"|"pdf"},
            ...
        ],
        "jobId": "unique-job-uuid"
    }

    Returns:
        {
            "statusCode": 200,
            "body": JSON string with:
                - returnMessage
                - successCount
                - failCount
                - jsonData
                - newRecipeKeys
                - errors
                - jobId
        }
    """
    start_time = time.time()

    # Parse request
    if 'files' not in event:
        return {
            'statusCode': 400,
            'body': json.dumps({'returnMessage': 'No files provided in request'})
        }

    files = event['files']
    job_id = event.get('jobId', str(uuid.uuid4()))

    # Initialize services
    bucket_name = os.getenv('S3_BUCKET')
    if not bucket_name:
        return {
            'statusCode': 500,
            'body': json.dumps({'returnMessage': 'S3_BUCKET environment variable not set'})
        }

    try:
        # Initialize embedding store and load existing embeddings
        embedding_store = EmbeddingStore(bucket_name)
        existing_embeddings, _ = embedding_store.load_embeddings()

        # Initialize embedding generator
        embedding_generator = EmbeddingGenerator()

        # Initialize duplicate detector
        duplicate_detector = DuplicateDetector(existing_embeddings)

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'returnMessage': f'Service initialization failed: {str(e)}'})
        }

    # Extract recipes from files
    PDF_MAX_PAGES = 20  # Safety limit (frontend should chunk)
    all_recipes = []
    file_errors = []

    for file_idx, file_data in enumerate(files):
        try:
            # Get file data and type from frontend payload
            file_content = file_data.get('data', '')
            file_type = file_data.get('type', '').lower()

            # Strip data URI prefix if present (e.g., "data:image/jpeg;base64,...")
            if file_content.startswith('data:'):
                file_content = file_content.split(',', 1)[1] if ',' in file_content else file_content

            # Upload user file for records
            try:
                app_time = upload.upload_user_data('user_images', 'image/jpeg', 'jpg', file_content)
            except Exception as upload_err:
                app_time = int(time.time())

            # Detect if PDF from MIME type
            is_pdf = 'pdf' in file_type or file_type == 'application/pdf'

            if is_pdf:
                # Extract images from PDF
                base64_images = handlepdf.pdf_to_base64_images(file_content)

                # Check if PDF processing failed (returns False for PDFs over limit)
                if base64_images is False:
                    file_errors.append({
                        'file': file_idx,
                        'title': 'unknown',
                        'reason': f'PDF too large (exceeds page limit)'
                    })
                    continue

                # Check page count
                if len(base64_images) > PDF_MAX_PAGES:
                    file_errors.append({
                        'file': file_idx,
                        'title': 'unknown',
                        'reason': f'PDF too large ({len(base64_images)} pages, max {PDF_MAX_PAGES})'
                    })
                    continue
            else:
                # Single image
                base64_images = [file_content]

            # Extract recipes from images
            for base64_image in base64_images:
                recipe_json = ocr.extract_recipe_data(base64_image)
                upload.upload_user_data('user_images_json', 'application/json', 'json', recipe_json, app_time)

                if recipe_json is None:
                    continue

                try:
                    parsed_data = json.loads(recipe_json)

                    # Handle multi-recipe response (OCR detected multiple recipes on one page)
                    # Note: The parseJSON step (line 230) will handle unwrapping and consolidation
                    if isinstance(parsed_data, list):
                        # Multiple recipes from this image
                        for recipe_idx, recipe in enumerate(parsed_data):
                            all_recipes.append((recipe, file_idx))
                    else:
                        # Single recipe OR multi-recipe dict format (parseJSON will handle)
                        all_recipes.append((parsed_data, file_idx))

                except json.JSONDecodeError as e:
                    pass

        except Exception as e:
            file_errors.append({
                'file': file_idx,
                'title': 'unknown',
                'reason': f'Extraction failed: {str(e)}'
            })

    # Parse recipes using OCR
    try:
        if all_recipes:
            # Collect just the recipes for parseJSON
            recipes_only = [r[0] for r in all_recipes]
            print(f"[LAMBDA] Parsing and combining {len(recipes_only)} recipe objects...")
            print(f"[LAMBDA] Recipe objects preview: {str(recipes_only)[:500]}")
            parsed_json = ocr.parseJSON(recipes_only)
            print(f"[LAMBDA] ParseJSON returned {len(parsed_json)} characters")
            parsed_recipes = json.loads(parsed_json)

            # Handle both list and single recipe outputs
            if not isinstance(parsed_recipes, list):
                parsed_recipes = [parsed_recipes]

            print(f"[LAMBDA] Parsed {len(parsed_recipes)} recipe(s)")
            for idx, recipe in enumerate(parsed_recipes):
                title = recipe.get('Title', 'Unknown')
                print(f"[LAMBDA] Recipe {idx+1}/{len(parsed_recipes)}: {title}")

            # Re-associate file indices
            final_recipes = []
            for i, recipe in enumerate(parsed_recipes):
                if i < len(all_recipes):
                    file_idx = all_recipes[i][1]
                    final_recipes.append((recipe, file_idx))

            all_recipes = final_recipes
        else:
            all_recipes = []
    except Exception as e:
        pass

    # Process recipes in parallel
    unique_recipes = []
    search_results_list = []
    new_embeddings = {}
    position_to_file_idx = {}

    try:
        with ThreadPoolExecutor(max_workers=3) as executor:
            # Submit all recipes for processing
            future_to_idx = {}
            for recipe, file_idx in all_recipes:
                future = executor.submit(
                    process_single_recipe,
                    recipe,
                    embedding_generator,
                    duplicate_detector
                )
                future_to_idx[future] = (recipe, file_idx)

            # Collect results as they complete
            for future in as_completed(future_to_idx):
                recipe, file_idx = future_to_idx[future]
                result_recipe, embedding, search_results, error_reason = future.result()

                if error_reason:
                    # Processing failed
                    file_errors.append({
                        'file': file_idx,
                        'title': recipe.get('Title', 'unknown'),
                        'reason': error_reason
                    })
                else:
                    # Success - add to batch
                    position = len(unique_recipes)
                    unique_recipes.append(result_recipe)
                    search_results_list.append(search_results)
                    new_embeddings[position] = embedding
                    position_to_file_idx[position] = file_idx

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'returnMessage': f'Parallel processing failed: {str(e)}'})
        }

    # Batch upload to S3 with image URL deduplication
    success_keys = []
    json_data = {}

    try:
        if unique_recipes:
            # Get existing recipe data for URL deduplication
            s3_client = boto3.client('s3')
            try:
                response = s3_client.get_object(Bucket=bucket_name, Key='jsondata/combined_data.json')
                json_data = json.loads(response['Body'].read())
            except s3_client.exceptions.NoSuchKey:
                # File doesn't exist yet - first upload
                json_data = {}
            except Exception as e:
                # Other errors should be logged/raised
                json_data = {}

            # Extract used URLs
            used_urls = si.extract_used_image_urls(json_data)

            # Select unique URLs for each recipe
            unique_search_results = []
            for search_results in search_results_list:
                unique_url = si.select_unique_image_url(search_results, used_urls)
                if unique_url:
                    # Convert back to format expected by upload_image
                    unique_search_results.append({'items': [{'link': unique_url}]})
                    used_urls.add(unique_url)  # Add to used set for next iteration
                else:
                    unique_search_results.append({'items': []})

            # Batch upload
            json_data, success_keys, position_to_key, upload_errors = batch_to_s3_atomic(
                unique_recipes,
                unique_search_results
            )

            # Merge upload errors into file_errors
            file_errors.extend(upload_errors)

            # Map position-based embeddings to actual recipe keys using position_to_key mapping
            keyed_embeddings = {}
            for position, embedding in new_embeddings.items():
                # Use the position_to_key mapping to get the correct recipe key
                if position in position_to_key:
                    recipe_key = position_to_key[position]
                    keyed_embeddings[recipe_key] = embedding

            # Save embeddings atomically
            if keyed_embeddings:
                embedding_store.add_embeddings(keyed_embeddings)

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'returnMessage': f'Batch upload failed: {str(e)}'})
        }

    # Build response
    success_count = len(success_keys)
    fail_count = len(file_errors)

    if success_count > 0 and fail_count == 0:
        message = f'{success_count} recipes added successfully'
    elif success_count > 0 and fail_count > 0:
        message = f'{success_count} recipes added, {fail_count} failed'
    elif success_count == 0 and fail_count > 0:
        message = f'All {fail_count} recipes failed'
    else:
        message = 'No recipes processed'

    # Send CloudWatch metrics
    try:
        cloudwatch = boto3.client('cloudwatch')
        execution_time = time.time() - start_time
        duplicate_count = sum(1 for err in file_errors if 'Duplicate' in err.get('reason', ''))

        cloudwatch.put_metric_data(
            Namespace='RecipeProcessor',
            MetricData=[
                {
                    'MetricName': 'SuccessCount',
                    'Value': success_count,
                    'Unit': 'Count'
                },
                {
                    'MetricName': 'FailureCount',
                    'Value': fail_count,
                    'Unit': 'Count'
                },
                {
                    'MetricName': 'ExecutionTime',
                    'Value': execution_time,
                    'Unit': 'Seconds'
                },
                {
                    'MetricName': 'DuplicateCount',
                    'Value': duplicate_count,
                    'Unit': 'Count'
                }
            ]
        )
    except Exception as e:
        pass

    # Write S3 completion flag
    try:
        s3_client = boto3.client('s3')
        completion_data = {
            'jobId': job_id,
            'status': 'completed',
            'timestamp': int(time.time()),
            'successCount': success_count,
            'failCount': fail_count,
            'newRecipeKeys': success_keys,
            'errors': file_errors
        }

        s3_client.put_object(
            Bucket=bucket_name,
            Key=f'upload-status/{job_id}.json',
            Body=json.dumps(completion_data),
            ContentType='application/json'
        )
    except Exception as e:
        pass

    # Return response
    return {
        'statusCode': 200,
        'body': json.dumps({
            'returnMessage': message,
            'successCount': success_count,
            'failCount': fail_count,
            'jsonData': json_data,
            'newRecipeKeys': success_keys,
            'errors': file_errors,
            'jobId': job_id
        })
    }
