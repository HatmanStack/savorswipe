"""
Recipe deletion functions with atomic writes and error handling.

Provides functions to safely remove recipes from combined_data.json
and embeddings from recipe_embeddings.json using S3 ETag-based
optimistic locking to prevent race conditions.
"""

import json
import logging
import random
import time
from typing import Dict, Tuple, Optional
from botocore.exceptions import ClientError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def delete_recipe_from_combined_data(recipe_key: str, json_data: Dict) -> Dict:
    """
    Remove a recipe entry from combined data dictionary.

    This is a pure function that modifies the dictionary in-memory.
    It doesn't touch S3.

    Args:
        recipe_key: Recipe key to remove (e.g., "1" or "chicken_parmesan")
        json_data: Full combined_data.json dictionary

    Returns:
        Updated dictionary with recipe removed (or original if not found)
    """
    if recipe_key not in json_data:
        logger.info(f"[DELETE] Recipe key '{recipe_key}' not found in combined_data")
        return json_data

    # Create a copy to avoid mutating input
    updated_data = json_data.copy()
    deleted_recipe = updated_data.pop(recipe_key)

    logger.info(f"[DELETE] Removed recipe '{recipe_key}': {deleted_recipe.get('Title', 'Unknown')}")
    return updated_data


def delete_embedding_from_store(recipe_key: str, embeddings: Dict) -> Dict:
    """
    Remove an embedding entry from embeddings dictionary.

    This is a pure function that modifies the dictionary in-memory.
    It doesn't touch S3.

    Args:
        recipe_key: Recipe key whose embedding to remove
        embeddings: Full recipe_embeddings.json dictionary

    Returns:
        Updated dictionary with embedding removed (or original if not found)
    """
    if recipe_key not in embeddings:
        logger.info(f"[DELETE] Embedding for recipe key '{recipe_key}' not found")
        return embeddings

    # Create a copy to avoid mutating input
    updated_embeddings = embeddings.copy()
    deleted_embedding = updated_embeddings.pop(recipe_key)

    logger.info(
        f"[DELETE] Removed embedding for recipe key '{recipe_key}' "
        f"({len(deleted_embedding) if isinstance(deleted_embedding, list) else 'unknown'} dimensions)"
    )
    return updated_embeddings


def delete_recipe_atomic(
    recipe_key: str,
    s3_client,
    bucket: str,
    combined_data_key: str = "jsondata/combined_data.json",
    embeddings_key: str = "jsondata/recipe_embeddings.json"
) -> Tuple[bool, Optional[str]]:
    """
    Atomically delete recipe from both combined_data.json and recipe_embeddings.json.

    Uses S3 ETag-based optimistic locking with retry logic to handle race conditions.
    Both files are updated atomically to ensure consistency.

    Args:
        recipe_key: Recipe key to delete
        s3_client: Boto3 S3 client
        bucket: S3 bucket name
        combined_data_key: S3 key for combined_data.json (default: jsondata/combined_data.json)
        embeddings_key: S3 key for recipe_embeddings.json (default: jsondata/recipe_embeddings.json)

    Returns:
        Tuple of (success: bool, error_message: str or None)
        - (True, None) on success
        - (False, error_message) on failure
    """
    MAX_RETRIES = 3

    for attempt in range(MAX_RETRIES):
        logger.info(f"[DELETE] Attempt {attempt + 1}/{MAX_RETRIES} to delete recipe '{recipe_key}'")

        try:
            # Step 1: Load combined_data.json with ETag
            logger.info(f"[DELETE] Loading {combined_data_key}...")
            try:
                response = s3_client.get_object(Bucket=bucket, Key=combined_data_key)
                combined_data = json.loads(response['Body'].read())
                combined_data_etag = response['ETag'].strip('"')
                logger.info(
                    f"[DELETE] Loaded combined_data with {len(combined_data)} recipes, ETag: {combined_data_etag}")
            except ClientError as e:
                if e.response['Error']['Code'] == 'NoSuchKey':
                    logger.warning(f"[DELETE] {combined_data_key} not found")
                    combined_data = {}
                    combined_data_etag = None
                else:
                    return False, f"Error loading {combined_data_key}: {str(e)}"

            # Step 2: Load recipe_embeddings.json with ETag
            logger.info(f"[DELETE] Loading {embeddings_key}...")
            try:
                response = s3_client.get_object(Bucket=bucket, Key=embeddings_key)
                embeddings = json.loads(response['Body'].read())
                embeddings_etag = response['ETag'].strip('"')
                logger.info(
                    f"[DELETE] Loaded embeddings with {len(embeddings)} entries, ETag: {embeddings_etag}")
            except ClientError as e:
                if e.response['Error']['Code'] == 'NoSuchKey':
                    logger.warning(f"[DELETE] {embeddings_key} not found")
                    embeddings = {}
                    embeddings_etag = None
                else:
                    return False, f"Error loading {embeddings_key}: {str(e)}"

            # Step 3: Delete recipe from both dictionaries
            logger.info(f"[DELETE] Removing recipe '{recipe_key}' from both files...")
            updated_combined_data = delete_recipe_from_combined_data(recipe_key, combined_data)
            updated_embeddings = delete_embedding_from_store(recipe_key, embeddings)

            # Step 4: Perform atomic writes
            logger.info(f"[DELETE] Writing updated combined_data to S3...")
            combined_data_body = json.dumps(updated_combined_data)

            params_combined = {
                'Bucket': bucket,
                'Key': combined_data_key,
                'Body': combined_data_body,
                'ContentType': 'application/json'
            }

            if combined_data_etag is not None:
                params_combined['IfMatch'] = combined_data_etag

            try:
                s3_client.put_object(**params_combined)  # type: ignore
                logger.info("[DELETE] Successfully wrote combined_data")
            except ClientError as e:
                if e.response['Error']['Code'] == 'PreconditionFailed':
                    logger.warning(
                        f"[DELETE] Race condition on combined_data (attempt {attempt + 1})")
                    if attempt < MAX_RETRIES - 1:
                        delay = random.uniform(0.1, 0.5) * (2 ** attempt)
                        logger.info(f"[DELETE] Retrying after {delay:.2f}s...")
                        time.sleep(delay)
                        continue
                    else:
                        return False, f"Max retries exceeded updating {combined_data_key}"
                else:
                    return False, f"Error writing {combined_data_key}: {str(e)}"

            # Step 5: Write embeddings
            logger.info(f"[DELETE] Writing updated embeddings to S3...")
            embeddings_body = json.dumps(updated_embeddings)

            params_embeddings = {
                'Bucket': bucket,
                'Key': embeddings_key,
                'Body': embeddings_body,
                'ContentType': 'application/json'
            }

            if embeddings_etag is not None:
                params_embeddings['IfMatch'] = embeddings_etag

            try:
                s3_client.put_object(**params_embeddings)  # type: ignore
                logger.info("[DELETE] Successfully wrote embeddings")
            except ClientError as e:
                if e.response['Error']['Code'] == 'PreconditionFailed':
                    logger.warning(f"[DELETE] Race condition on embeddings (attempt {attempt + 1})")
                    if attempt < MAX_RETRIES - 1:
                        delay = random.uniform(0.1, 0.5) * (2 ** attempt)
                        logger.info(f"[DELETE] Retrying after {delay:.2f}s...")
                        time.sleep(delay)
                        continue
                    else:
                        return False, f"Max retries exceeded updating {embeddings_key}"
                else:
                    return False, f"Error writing {embeddings_key}: {str(e)}"

            # Success!
            logger.info(f"[DELETE] Recipe '{recipe_key}' deleted successfully")
            return True, None

        except Exception as e:
            logger.error(f"[DELETE] Unexpected error: {str(e)}")
            return False, f"Unexpected error: {str(e)}"

    # Should not reach here, but just in case
    return False, f"Max retries ({MAX_RETRIES}) exceeded"
