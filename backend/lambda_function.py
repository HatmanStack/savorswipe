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
import ipaddress
import json
import os
import random
import re
import socket
import time
import urllib.parse
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Tuple, Optional

import boto3
from botocore.exceptions import ClientError
import handlepdf
import ocr
import upload
import search_image as si
from embeddings import EmbeddingStore
from embedding_generator import EmbeddingGenerator
from duplicate_detector import DuplicateDetector
from upload import batch_to_s3_atomic
from recipe_deletion import delete_recipe_atomic
from image_uploader import fetch_image_from_url, upload_image_to_s3

ALLOWED_ORIGIN = 'https://savorswipe.hatstack.fun'


def add_cors_headers(headers: dict, origin: Optional[str] = None) -> dict:
    """
    Add CORS headers to response. Only allows requests from production origin.

    Args:
        headers: Existing response headers
        origin: Request origin from event headers

    Returns:
        Headers dict with CORS added
    """
    cors_headers = headers.copy()

    # Only set CORS header for allowed origin
    if origin == ALLOWED_ORIGIN:
        cors_headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN

    cors_headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
    cors_headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return cors_headers


def process_single_recipe(
    recipe_data: Dict,
    embedding_generator: EmbeddingGenerator,
    duplicate_detector: DuplicateDetector
) -> Tuple[Optional[Dict], Optional[List[float]], Optional[List[str]], Optional[str]]:
    """
    Process a single recipe: generate embedding, check for duplicates, search for images.

    Fetches 10 images from Google but returns only the first 9 for the picker grid.
    The frontend will display these 9 images in a 3x3 grid for user selection.

    Args:
        recipe_data: Recipe dictionary with Title, Ingredients, etc.
        embedding_generator: Embedding generator instance
        duplicate_detector: Duplicate detector instance

    Returns:
        Tuple of (recipe, embedding, search_results, error_reason)
        - On success: (recipe_dict, embedding_vector, image_urls_list[0:9], None)
        - On duplicate: (None, None, None, error_message)
        - On error: (None, None, None, error_message)
    """
    try:
        # Extract title and type
        title = recipe_data.get('Title', 'Unknown Recipe')
        recipe_type = recipe_data.get('Type')

        # Normalize recipe type for search (handle both string and list formats)
        type_str = None
        if isinstance(recipe_type, list) and len(recipe_type) > 0:
            type_str = recipe_type[0]  # Use first type
        elif isinstance(recipe_type, str):
            type_str = recipe_type

        # Generate embedding
        embedding = embedding_generator.generate_recipe_embedding(recipe_data)

        # Check for duplicate
        is_duplicate, duplicate_key, similarity_score = duplicate_detector.is_duplicate(embedding)

        if is_duplicate:
            error_reason = f"Duplicate of recipe {duplicate_key} (similarity: {similarity_score:.2f})"
            return None, None, None, error_reason

        # Search for images with recipe type for better results (fetch 10, use first 9)
        all_search_results = si.google_search_image(title, count=10, recipe_type=type_str)
        # Return only first 9 for the 3x3 grid picker
        search_results = all_search_results[0:9]

        return recipe_data, embedding, search_results, None

    except Exception as e:
        error_reason = f"Processing failed: {str(e)}"
        return None, None, None, error_reason


def lambda_handler(event, context):
    """
    AWS Lambda handler for processing recipe uploads and fetching recipe data.

    Event format for POST (upload):
    {
        "files": [
            {"base64": "...", "type": "image"|"pdf"},
            ...
        ],
        "jobId": "unique-job-uuid"
    }

    Event format for GET (fetch recipes):
    {
        "requestContext": {
            "http": {
                "method": "GET"
            }
        }
    }

    Event format for DELETE (delete recipe):
    {
        "requestContext": {
            "http": {
                "method": "DELETE",
                "path": "/recipe/{recipe_key}"
            }
        }
    }

    Event format for POST image (update recipe image):
    {
        "requestContext": {
            "http": {
                "method": "POST",
                "path": "/recipe/{recipe_key}/image"
            }
        },
        "body": JSON string with imageUrl
    }

    Returns:
        POST: Upload result with successCount, failCount, errors
        GET: Recipe JSON with cache-prevention headers
        DELETE: Success/error response
        POST /image: Success/error response with updated recipe
    """

    # Extract origin for CORS (case-insensitive header lookup)
    headers = event.get('headers', {})
    # Normalize header keys to lowercase for case-insensitive lookup
    headers_lower = {k.lower(): v for k, v in headers.items()}
    origin = headers_lower.get('origin')

    # Detect HTTP method from requestContext
    http_method = event.get('requestContext', {}).get('http', {}).get('method', 'POST')
    request_path = event.get('requestContext', {}).get('http', {}).get('path', '')

    print(f"[DEBUG] lambda_handler: Detected HTTP method: {http_method}, path: {request_path}")

    if http_method == 'GET':
        return handle_get_request(event, context, origin)
    elif http_method == 'DELETE':
        return handle_delete_request(event, context, origin)
    elif http_method == 'POST':
        # Check if this is an image update request or a file upload
        # Use regex to match /recipe/{key}/image to avoid false positives
        if re.match(r'^/recipe/[^/]+/image$', request_path):
            return handle_post_image_request(event, context, origin)
        else:
            return handle_post_request(event, context, origin)
    else:
        return handle_post_request(event, context, origin)


def handle_get_request(event, context, origin=None):
    """
    Handle GET requests for fetching recipe JSON from S3.

    Returns the combined_data.json file with cache-prevention headers
    to ensure clients always receive fresh data.

    Args:
        event: API Gateway Lambda proxy integration request
        context: Lambda context object

    Returns:
        {
            "statusCode": 200 or 500,
            "headers": {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            },
            "body": JSON string (recipe data or error message)
        }
    """
    bucket_name = os.getenv('S3_BUCKET')

    if not bucket_name:
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({'error': 'S3_BUCKET environment variable not set'})
        }

    s3_client = boto3.client('s3')
    json_key = 'jsondata/combined_data.json'

    try:
        # Fetch recipe JSON from S3
        response = s3_client.get_object(Bucket=bucket_name, Key=json_key)
        json_data = response['Body'].read().decode('utf-8')

        # Return with cache-prevention headers
        return {
            'statusCode': 200,
            'headers': add_cors_headers({
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }, origin),
            'body': json_data
        }

    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', '')
        if error_code == 'NoSuchKey':
            return {
                'statusCode': 404,
                'headers': add_cors_headers({
                    'Content-Type': 'application/json'
                }, origin),
                'body': json.dumps({'error': f'File not found: {json_key}'})
            }
        else:
            print(f'S3 ClientError fetching recipe JSON: {str(e)}')
            return {
                'statusCode': 500,
                'headers': add_cors_headers({
                    'Content-Type': 'application/json'
                }, origin),
                'body': json.dumps({'error': f'Failed to fetch recipes: {str(e)}'})
            }

    except Exception as e:
        print(f'Error fetching recipe JSON from S3: {str(e)}')
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({'error': f'Failed to fetch recipes: {str(e)}'})
        }


def handle_delete_request(event, context, origin=None):
    """
    Handle DELETE requests for recipe deletion.

    Deletes a recipe from both combined_data.json and recipe_embeddings.json
    using atomic writes with ETag-based optimistic locking.

    Args:
        event: API Gateway Lambda proxy integration request
        context: Lambda context object

    Returns:
        {
            "statusCode": 200 or 400 or 500,
            "headers": {...},
            "body": JSON string with response
        }
    """
    bucket_name = os.getenv('S3_BUCKET')

    if not bucket_name:
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({'success': False, 'error': 'S3_BUCKET environment variable not set'})
        }

    # Extract recipe_key from request path
    request_path = event.get('requestContext', {}).get('http', {}).get('path', '')
    print(f"[DELETE] Request path: {request_path}")

    # Parse path like "/recipe/chicken_parmesan" to extract recipe_key
    match = re.match(r'^/recipe/([a-zA-Z0-9_-]+)$', request_path)

    if not match:
        return {
            'statusCode': 400,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({
                'success': False,
                'error': 'Invalid path format. Expected: /recipe/{recipe_key}'
            })
        }

    recipe_key = match.group(1)
    print(f"[DELETE] Parsed recipe_key: {recipe_key}")

    # Validate recipe_key format (alphanumeric, underscore, hyphen)
    if not re.match(r'^[a-zA-Z0-9_-]+$', recipe_key):
        return {
            'statusCode': 400,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({
                'success': False,
                'error': f'Invalid recipe_key format: {recipe_key}'
            })
        }

    try:
        s3_client = boto3.client('s3')

        # Perform atomic deletion
        success, error_message = delete_recipe_atomic(
            recipe_key,
            s3_client,
            bucket_name,
            combined_data_key='jsondata/combined_data.json',
            embeddings_key='jsondata/recipe_embeddings.json'
        )

        if success:
            print(f"[DELETE] Successfully deleted recipe '{recipe_key}'")
            return {
                'statusCode': 200,
                'headers': add_cors_headers({
                    'Content-Type': 'application/json'
                }, origin),
                'body': json.dumps({
                    'success': True,
                    'message': f'Recipe {recipe_key} deleted successfully'
                })
            }
        else:
            print(f"[DELETE] Failed to delete recipe '{recipe_key}': {error_message}")
            # Distinguish between "not found" (idempotent, 200) and real failures (500)
            if error_message and 'not found' in error_message.lower():
                # Recipe was already deleted or never existed - idempotent operation
                return {
                    'statusCode': 200,
                    'headers': add_cors_headers({
                        'Content-Type': 'application/json'
                    }, origin),
                    'body': json.dumps({
                        'success': True,
                        'message': f'Recipe {recipe_key} was already deleted or not found'
                    })
                }
            else:
                # Real failure (S3 error, permissions, race condition, etc.)
                return {
                    'statusCode': 500,
                    'headers': add_cors_headers({
                        'Content-Type': 'application/json'
                    }, origin),
                    'body': json.dumps({
                        'success': False,
                        'error': f'Failed to delete recipe: {error_message or "Unknown error"}'
                    })
                }

    except Exception as e:
        print(f"[DELETE] Unexpected error deleting recipe '{recipe_key}': {str(e)}")
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({
                'success': False,
                'error': f'Failed to delete recipe: {str(e)}'
            })
        }


def _validate_image_url_for_api(image_url: str) -> Tuple[bool, Optional[str]]:
    """
    Validate image URL at API entry point to prevent SSRF attacks.

    Checks:
    1. URL uses HTTPS scheme
    2. Hostname resolves to public IP (not private/reserved)

    NOTE: No domain whitelist - SSRF protection is provided by public IP validation.
    This allows Google Image Search results from any public website.

    Args:
        image_url: URL to validate

    Returns:
        Tuple of (is_valid, error_message) where error_message is None if valid
    """
    try:
        parsed = urllib.parse.urlparse(image_url)

        # Check scheme is HTTPS
        if parsed.scheme != 'https':
            return False, f"Invalid scheme: {parsed.scheme} (only HTTPS allowed)"

        hostname = parsed.hostname
        if not hostname:
            return False, "URL has no hostname"

        # Resolve hostname to IP and check it's not private/reserved
        try:
            ip_str = socket.gethostbyname(hostname)
            ip = ipaddress.ip_address(ip_str)

            # Reject private, loopback, link-local, multicast addresses
            if (ip.is_private or ip.is_loopback or ip.is_link_local or
                    ip.is_multicast or ip.is_reserved):
                return False, f"Refusing to fetch private/reserved IP: {hostname} -> {ip_str}"

            print(f"[SSRF-CHECK] URL validation passed: {hostname} -> {ip_str}")
            return True, None

        except (socket.gaierror, socket.error) as e:
            return False, f"Failed to resolve hostname {hostname}: {str(e)}"

    except Exception as e:
        return False, f"Error validating URL: {str(e)}"


def handle_post_image_request(event, context, origin=None):
    """
    Handle POST requests for image selection and update.

    Updates a recipe with a selected image from Google Custom Search,
    fetching the image and storing it in S3, then updating the recipe's
    image_url field for deduplication tracking.

    Request body format:
    {
        "imageUrl": "https://google-cdn.com/selected-image.jpg"
    }

    Args:
        event: API Gateway Lambda proxy integration request
        context: Lambda context object

    Returns:
        {
            "statusCode": 200 or 400 or 404 or 500,
            "headers": {...},
            "body": JSON string with response
        }
    """
    bucket_name = os.getenv('S3_BUCKET')

    if not bucket_name:
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({'success': False, 'error': 'S3_BUCKET environment variable not set'})
        }

    # Extract recipe_key from request path
    request_path = event.get('requestContext', {}).get('http', {}).get('path', '')
    print(f"[POST-IMAGE] Request path: {request_path}")

    # Parse path like "/recipe/chicken_parmesan/image" to extract recipe_key
    match = re.match(r'^/recipe/([a-zA-Z0-9_-]+)/image$', request_path)

    if not match:
        return {
            'statusCode': 400,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({
                'success': False,
                'error': 'Invalid path format. Expected: /recipe/{recipe_key}/image'
            })
        }

    recipe_key = match.group(1)
    print(f"[POST-IMAGE] Parsed recipe_key: {recipe_key}")

    # Parse request body
    try:
        body_content = event.get('body')
        if body_content:
            # API Gateway format - body is a JSON string
            body = json.loads(body_content)
        else:
            # Direct invocation format - event is the body
            body = event
    except json.JSONDecodeError as e:
        print(f"[POST-IMAGE] JSON decode error: {e}")
        return {
            'statusCode': 400,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({
                'success': False,
                'error': f'Invalid JSON in request body: {str(e)}'
            })
        }

    # Extract and validate imageUrl
    image_url = body.get('imageUrl', '')
    if not image_url:
        return {
            'statusCode': 400,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({
                'success': False,
                'error': 'imageUrl is required'
            })
        }

    # Validate imageUrl to prevent SSRF attacks
    is_valid, validation_error = _validate_image_url_for_api(image_url)
    if not is_valid:
        print(f"[POST-IMAGE] URL validation failed: {validation_error}")
        return {
            'statusCode': 400,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({
                'success': False,
                'error': f'Invalid image URL: {validation_error}'
            })
        }

    # Validate that imageUrl is one of the recipe's search results
    # Load recipe to verify the imageUrl was from our search results (not injected)
    try:
        s3_client = boto3.client('s3')
        response = s3_client.get_object(Bucket=bucket_name, Key='jsondata/combined_data.json')
        json_data = json.loads(response['Body'].read())

        recipe = json_data.get(recipe_key)
        if not recipe or 'image_search_results' not in recipe:
            print(f"[POST-IMAGE] Recipe {recipe_key} not found or has no search results")
            return {
                'statusCode': 404,
                'headers': add_cors_headers({
                    'Content-Type': 'application/json'
                }, origin),
                'body': json.dumps({
                    'success': False,
                    'error': 'Recipe not found'
                })
            }

        # Check if imageUrl is in the recipe's search results
        if image_url not in recipe.get('image_search_results', []):
            print(f"[POST-IMAGE] Image URL not in recipe's search results")
            return {
                'statusCode': 400,
                'headers': add_cors_headers({
                    'Content-Type': 'application/json'
                }, origin),
                'body': json.dumps({
                    'success': False,
                    'error': 'Image URL is not from this recipe\'s search results'
                })
            }
    except ClientError as e:
        print(f"[POST-IMAGE] Error validating image URL against search results: {str(e)}")
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({
                'success': False,
                'error': 'Failed to validate image selection'
            })
        }

    print(f"[POST-IMAGE] Fetching and uploading image: {image_url[:100]}...")

    try:
        s3_client = boto3.client('s3')

        # Step 1: Fetch image from Google URL
        image_bytes, content_type = fetch_image_from_url(image_url)

        if image_bytes is None:
            print(f"[POST-IMAGE] Failed to fetch image from URL")
            return {
                'statusCode': 500,
                'headers': add_cors_headers({
                    'Content-Type': 'application/json'
                }, origin),
                'body': json.dumps({
                    'success': False,
                    'error': 'Failed to fetch image from the provided URL'
                })
            }

        print(f"[POST-IMAGE] Image fetched: {len(image_bytes)} bytes, content-type: {content_type}")

        # Step 2: Upload image to S3
        s3_path, error_msg = upload_image_to_s3(
            recipe_key, image_bytes, s3_client, bucket_name, content_type=content_type)

        if s3_path is None:
            print(f"[POST-IMAGE] Failed to upload image to S3: {error_msg}")
            return {
                'statusCode': 500,
                'headers': add_cors_headers({
                    'Content-Type': 'application/json'
                }, origin),
                'body': json.dumps({
                    'success': False,
                    'error': f'Failed to upload image to S3: {error_msg}'
                })
            }

        print(f"[POST-IMAGE] Image uploaded successfully: {s3_path}")

        # NOTE: Image has been uploaded to S3. If JSON update fails below, the image
        # becomes orphaned with no reference in combined_data.json. The retry logic
        # handles most failures, but if all retries fail, the image remains in S3.
        # Future cleanup job or manual intervention may be needed for orphaned images.
        # This is acceptable given low failure likelihood with retry logic.

        # Load combined_data.json and update recipe with Google URL for dedup
        MAX_RETRIES = 3
        for attempt in range(MAX_RETRIES):
            try:
                print(f"[POST-IMAGE] Attempt {attempt + 1}/{MAX_RETRIES} to update recipe")

                # Load existing data with ETag
                try:
                    response = s3_client.get_object(
                        Bucket=bucket_name, Key='jsondata/combined_data.json')
                    json_data = json.loads(response['Body'].read())
                    etag = response['ETag'].strip('"')
                    print(
                        f"[POST-IMAGE] Loaded combined_data with {len(json_data)} recipes, ETag: {etag}")
                except ClientError as e:
                    if e.response['Error']['Code'] == 'NoSuchKey':
                        print(f"[POST-IMAGE] combined_data.json not found")
                        return {
                            'statusCode': 404,
                            'headers': add_cors_headers({
                                'Content-Type': 'application/json'
                            }, origin),
                            'body': json.dumps({
                                'success': False,
                                'error': 'Recipe data not found'
                            })
                        }
                    else:
                        return {
                            'statusCode': 500,
                            'headers': add_cors_headers({
                                'Content-Type': 'application/json'
                            }, origin),
                            'body': json.dumps({
                                'success': False,
                                'error': f'Failed to load recipe data: {str(e)}'
                            })
                        }

                # Find and update recipe
                if recipe_key not in json_data:
                    print(f"[POST-IMAGE] Recipe '{recipe_key}' not found in combined_data")
                    return {
                        'statusCode': 404,
                        'headers': add_cors_headers({
                            'Content-Type': 'application/json'
                        }, origin),
                        'body': json.dumps({
                            'success': False,
                            'error': f'Recipe {recipe_key} not found'
                        })
                    }

                # Update recipe's image_url with Google URL for deduplication tracking
                recipe = json_data[recipe_key]
                recipe['image_url'] = image_url
                print(
                    f"[POST-IMAGE] Updated recipe '{recipe_key}' with image_url: {image_url[:100]}...")

                # Atomic write back to S3
                try:
                    updated_json = json.dumps(json_data)

                    params = {
                        'Bucket': bucket_name,
                        'Key': 'jsondata/combined_data.json',
                        'Body': updated_json,
                        'ContentType': 'application/json'
                    }

                    if etag is not None:
                        params['IfMatch'] = etag

                    s3_client.put_object(**params)
                    print(f"[POST-IMAGE] Successfully updated combined_data.json")

                    # Success!
                    return {
                        'statusCode': 200,
                        'headers': add_cors_headers({
                            'Content-Type': 'application/json'
                        }, origin),
                        'body': json.dumps({
                            'success': True,
                            'message': 'Image saved and recipe updated',
                            'recipe': recipe
                        })
                    }

                except ClientError as e:
                    if e.response['Error']['Code'] == 'PreconditionFailed':
                        # Race condition detected
                        print(f"[POST-IMAGE] Race condition on attempt {attempt + 1}, retrying...")
                        if attempt < MAX_RETRIES - 1:
                            delay = random.uniform(0.1, 0.5) * (2 ** attempt)
                            print(f"[POST-IMAGE] Retrying after {delay:.2f}s...")
                            time.sleep(delay)
                            continue
                        else:
                            return {
                                'statusCode': 500,
                                'headers': add_cors_headers({
                                    'Content-Type': 'application/json'
                                }, origin),
                                'body': json.dumps({
                                    'success': False,
                                    'error': 'Failed to update recipe after multiple retries'
                                })
                            }
                    else:
                        print(f"[POST-IMAGE] S3 error: {str(e)}")
                        return {
                            'statusCode': 500,
                            'headers': add_cors_headers({
                                'Content-Type': 'application/json'
                            }, origin),
                            'body': json.dumps({
                                'success': False,
                                'error': f'Failed to update recipe: {str(e)}'
                            })
                        }

            except Exception as e:
                print(f"[POST-IMAGE] Unexpected error: {str(e)}")
                return {
                    'statusCode': 500,
                    'headers': add_cors_headers({
                        'Content-Type': 'application/json'
                    }, origin),
                    'body': json.dumps({
                        'success': False,
                        'error': f'Unexpected error: {str(e)}'
                    })
                }

        # Should not reach here
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({
                'success': False,
                'error': 'Failed to update recipe after multiple attempts'
            })
        }

    except Exception as e:
        print(f"[POST-IMAGE] Unexpected error processing image: {str(e)}")
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({
                'success': False,
                'error': f'Failed to process image: {str(e)}'
            })
        }


def handle_post_request(event, context, origin=None):
    """
    Handle POST requests for recipe uploads.

    This is the existing lambda_handler logic, extracted for clarity.
    """
    start_time = time.time()

    # Debug: Log full event structure (first 500 chars)
    print(f"[DEBUG] Full event keys: {list(event.keys())}")
    print(f"[DEBUG] Event preview: {str(event)[:500]}")

    # Check if body exists and log it
    if 'body' in event:
        print(
            f"[DEBUG] Body exists, type: {type(event['body'])}, length: {len(str(event['body']))}")
        print(f"[DEBUG] Body preview: {str(event['body'])[:200]}")
    else:
        print("[DEBUG] No 'body' key in event!")

    # Parse request body (API Gateway sends body as JSON string)
    try:
        body_content = event.get('body')
        if body_content:
            # API Gateway format - body is a JSON string
            print("[DEBUG] handle_post_request: Parsing body from API Gateway format")
            body = json.loads(body_content)
        else:
            # Direct invocation format - event is the body
            print("[DEBUG] handle_post_request: Using direct invocation format")
            body = event
    except json.JSONDecodeError as e:
        print(f"[DEBUG] handle_post_request: JSON decode error: {e!r}")
        return {
            'statusCode': 400,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({'returnMessage': f'Invalid JSON in request body: {str(e)}'})
        }

    # Validate files key exists
    if 'files' not in body:
        print(
            f"[DEBUG] handle_post_request: ERROR: No 'files' key in body. Body keys: {list(body.keys())}")
        return {
            'statusCode': 400,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({'returnMessage': 'No files provided in request'})
        }

    print(f"[DEBUG] Body parsed successfully, contains {len(body.get('files', []))} files")

    files = body['files']
    job_id = body.get('jobId', str(uuid.uuid4()))

    print(f"[DEBUG] Job ID: {job_id}, Files count: {len(files)}")

    # Initialize services
    print("[DEBUG] Getting S3_BUCKET environment variable...")
    bucket_name = os.getenv('S3_BUCKET')
    print(f"[DEBUG] S3_BUCKET = '{bucket_name}'")
    if not bucket_name:
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({'returnMessage': 'S3_BUCKET environment variable not set'})
        }

    try:
        # Initialize embedding store and load existing embeddings
        print("[DEBUG] Initializing EmbeddingStore...")
        embedding_store = EmbeddingStore(bucket_name)
        print("[DEBUG] Loading existing embeddings...")
        existing_embeddings, _ = embedding_store.load_embeddings()
        print(f"[DEBUG] Loaded {len(existing_embeddings)} existing embeddings")

        # Initialize embedding generator
        print("[DEBUG] Initializing EmbeddingGenerator...")
        embedding_generator = EmbeddingGenerator()
        print("[DEBUG] EmbeddingGenerator initialized")

        # Initialize duplicate detector
        print("[DEBUG] Initializing DuplicateDetector...")
        duplicate_detector = DuplicateDetector(existing_embeddings)
        print("[DEBUG] All services initialized successfully")

    except Exception as e:
        print(f"[ERROR] Service initialization failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({'returnMessage': f'Service initialization failed: {str(e)}'})
        }

    # Extract recipes from files
    PDF_MAX_PAGES = 20  # Safety limit (frontend should chunk)
    all_recipes = []
    file_errors = []

    print(f"[DEBUG] Starting file processing for {len(files)} files...")

    for file_idx, file_data in enumerate(files):
        try:
            print(f"[DEBUG] Processing file {file_idx + 1}/{len(files)}...")
            # Get file data and type from frontend payload
            file_content = file_data.get('data', '')
            file_type = file_data.get('type', '').lower()
            print(f"[DEBUG] File {file_idx}: type={file_type}, data_length={len(file_content)}")

            # Strip data URI prefix if present (e.g., "data:image/jpeg;base64,...")
            if file_content.startswith('data:'):
                file_content = file_content.split(
                    ',', 1)[1] if ',' in file_content else file_content

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
            print(f"[DEBUG] Extracting recipes from {len(base64_images)} image(s)...")
            for img_idx, base64_image in enumerate(base64_images):
                print(f"[DEBUG] Calling OCR for image {img_idx + 1}/{len(base64_images)}...")
                recipe_json = ocr.extract_recipe_data(base64_image)
                print(
                    f"[DEBUG] OCR completed for image {img_idx + 1}, result: {len(str(recipe_json)) if recipe_json else 0} chars")
                upload.upload_user_data('user_images_json', 'application/json',
                                        'json', recipe_json, app_time)

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
            print(f"[ERROR] File {file_idx} extraction failed: {str(e)}")
            import traceback
            traceback.print_exc()
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

    print(f"[LAMBDA] Starting parallel processing of {len(all_recipes)} recipe(s)...")

    try:
        with ThreadPoolExecutor(max_workers=3) as executor:
            # Submit all recipes for processing
            future_to_idx = {}
            for recipe, file_idx in all_recipes:
                print(
                    f"[LAMBDA] Submitting recipe '{recipe.get('Title', 'unknown')}' for processing...")
                future = executor.submit(
                    process_single_recipe,
                    recipe,
                    embedding_generator,
                    duplicate_detector
                )
                future_to_idx[future] = (recipe, file_idx)

            print(
                f"[LAMBDA] Submitted {len(future_to_idx)} recipe(s) for processing, waiting for results...")

            # Collect results as they complete
            for idx, future in enumerate(as_completed(future_to_idx)):
                recipe, file_idx = future_to_idx[future]
                print(
                    f"[LAMBDA] Processing result {idx+1}/{len(future_to_idx)} for '{recipe.get('Title', 'unknown')}'...")
                result_recipe, embedding, search_results, error_reason = future.result()

                if error_reason:
                    # Processing failed
                    print(
                        f"[LAMBDA] Recipe '{recipe.get('Title', 'unknown')}' failed: {error_reason}")
                    file_errors.append({
                        'file': file_idx,
                        'title': recipe.get('Title', 'unknown'),
                        'reason': error_reason
                    })
                else:
                    # Success - add to batch
                    print(
                        f"[LAMBDA] Recipe '{recipe.get('Title', 'unknown')}' processed successfully")
                    position = len(unique_recipes)
                    unique_recipes.append(result_recipe)
                    search_results_list.append(search_results)
                    new_embeddings[position] = embedding
                    position_to_file_idx[position] = file_idx

        print(
            f"[LAMBDA] Parallel processing complete: {len(unique_recipes)} successful, {len(file_errors)} failed")

    except Exception as e:
        print(f"[LAMBDA ERROR] Parallel processing failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
            'body': json.dumps({'returnMessage': f'Parallel processing failed: {str(e)}'})
        }

    # Batch upload to S3 with image URL deduplication
    success_keys = []
    json_data = {}

    print(f"[LAMBDA] Starting S3 upload for {len(unique_recipes)} unique recipe(s)...")

    try:
        if unique_recipes:
            # Get existing recipe data for URL deduplication
            print("[LAMBDA] Loading existing recipe data from S3...")
            s3_client = boto3.client('s3')
            try:
                response = s3_client.get_object(
                    Bucket=bucket_name, Key='jsondata/combined_data.json')
                json_data = json.loads(response['Body'].read())
                print(f"[LAMBDA] Loaded {len(json_data)} existing recipes from S3")
            except s3_client.exceptions.NoSuchKey:
                # File doesn't exist yet - first upload
                print("[LAMBDA] No existing recipe data found (first upload)")
                json_data = {}
            except Exception as e:
                # Other errors should be logged/raised
                print(f"[LAMBDA] Error loading existing data: {str(e)}")
                json_data = {}

            # Extract used URLs
            print("[LAMBDA] Extracting used image URLs...")
            used_urls = si.extract_used_image_urls(json_data)
            print(f"[LAMBDA] Found {len(used_urls)} used image URLs")

            # Filter URLs for each recipe (preserve all unused URLs as fallbacks)
            unique_search_results = []
            for search_results in search_results_list:
                # Filter out already-used URLs, keep all unused ones as fallbacks
                unused_urls = [url for url in search_results if url not in used_urls]

                if unused_urls:
                    # Pass all unused URLs as list (upload_image handles list format)
                    unique_search_results.append(unused_urls)
                    # Mark first URL as used to avoid reuse in next recipe
                    used_urls.add(unused_urls[0])
                else:
                    # All URLs already used - pass first 5 as fallback
                    unique_search_results.append(search_results[:5])

            # Batch upload
            print(f"[LAMBDA] Starting batch upload to S3...")
            json_data, success_keys, position_to_key, upload_errors = batch_to_s3_atomic(
                unique_recipes,
                unique_search_results
            )
            print(f"[LAMBDA] Batch upload complete: {len(success_keys)} successful")

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
                print(f"[LAMBDA] Saving {len(keyed_embeddings)} embeddings...")
                embedding_store.add_embeddings(keyed_embeddings)
                print("[LAMBDA] Embeddings saved successfully")
        else:
            print("[LAMBDA] No unique recipes to upload")

    except Exception as e:
        print(f"[LAMBDA ERROR] Batch upload failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'headers': add_cors_headers({
                'Content-Type': 'application/json'
            }, origin),
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

    # Return response with CORS headers
    print(f"[LAMBDA] Request complete: {success_count} successful, {fail_count} failed")
    print(f"[LAMBDA] Returning response with status 200")
    return {
        'statusCode': 200,
        'headers': add_cors_headers({
            'Content-Type': 'application/json'
        }, origin),
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
