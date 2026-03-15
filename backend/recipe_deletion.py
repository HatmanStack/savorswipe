"""
Recipe deletion functions with atomic writes and error handling.

Provides functions to safely remove recipes from combined_data.json
and embeddings from recipe_embeddings.json using S3 ETag-based
optimistic locking to prevent race conditions.
"""

import json
import random
import time
from typing import Dict, Optional, Tuple

from botocore.exceptions import ClientError

from logger import StructuredLogger

log = StructuredLogger("deletion")


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
        log.info("Recipe key not found in combined_data", recipe_key=recipe_key)
        return json_data

    # Create a copy to avoid mutating input
    updated_data = json_data.copy()
    deleted_recipe = updated_data.pop(recipe_key)

    log.info("Removed recipe", recipe_key=recipe_key, title=deleted_recipe.get('Title', 'Unknown'))
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
        log.info("Embedding not found", recipe_key=recipe_key)
        return embeddings

    # Create a copy to avoid mutating input
    updated_embeddings = embeddings.copy()
    deleted_embedding = updated_embeddings.pop(recipe_key)

    log.info(
        "Removed embedding",
        recipe_key=recipe_key,
        dimensions=len(deleted_embedding) if isinstance(deleted_embedding, list) else 'unknown'
    )
    return updated_embeddings


def _rollback_combined_data(
    recipe_key: str,
    deleted_recipe: Dict,
    s3_client,
    bucket: str,
    combined_data_key: str
) -> bool:
    """
    Best-effort rollback: restore a deleted recipe to combined_data.json.

    Re-reads combined_data with a fresh ETag and writes the recipe back.

    Args:
        recipe_key: The recipe key to restore
        deleted_recipe: The recipe data to restore
        s3_client: Boto3 S3 client
        bucket: S3 bucket name
        combined_data_key: S3 key for combined_data.json

    Returns:
        True if rollback succeeded, False otherwise
    """
    try:
        log.warning("Rolling back combined_data: restoring deleted recipe", recipe_key=recipe_key)

        # Re-read combined_data with fresh ETag
        response = s3_client.get_object(Bucket=bucket, Key=combined_data_key)
        current_data = json.loads(response['Body'].read())
        fresh_etag = response['ETag'].strip('"')

        # Restore the deleted recipe
        current_data[recipe_key] = deleted_recipe

        # Write back with fresh ETag
        s3_client.put_object(
            Bucket=bucket,
            Key=combined_data_key,
            Body=json.dumps(current_data),
            ContentType='application/json',
            IfMatch=fresh_etag
        )

        log.info("Rollback successful: recipe restored", recipe_key=recipe_key)
        return True

    except Exception as rollback_err:
        # Deliberately log full recipe_data so operators can manually restore
        # the deleted recipe if automatic rollback fails.
        log.error(
            "CRITICAL: Rollback failed - manual recovery needed",
            recipe_key=recipe_key,
            recipe_data=json.dumps(deleted_recipe),
            error=str(rollback_err)
        )
        return False


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
    Both files are updated atomically to ensure consistency. If the embeddings write
    fails after the combined_data write succeeds, a best-effort rollback is attempted.

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
        log.info("Delete attempt", attempt=attempt + 1, max_retries=MAX_RETRIES, recipe_key=recipe_key)

        try:
            # Step 1: Load combined_data.json with ETag
            log.info("Loading combined_data", key=combined_data_key)
            try:
                response = s3_client.get_object(Bucket=bucket, Key=combined_data_key)
                combined_data = json.loads(response['Body'].read())
                combined_data_etag = response['ETag'].strip('"')
                log.info("Loaded combined_data", recipe_count=len(combined_data), etag=combined_data_etag)
            except ClientError as e:
                if e.response['Error']['Code'] == 'NoSuchKey':
                    log.warning("combined_data not found", key=combined_data_key)
                    combined_data = {}
                    combined_data_etag = None
                else:
                    return False, f"Error loading {combined_data_key}: {str(e)}"

            # Step 2: Load recipe_embeddings.json with ETag
            log.info("Loading embeddings", key=embeddings_key)
            try:
                response = s3_client.get_object(Bucket=bucket, Key=embeddings_key)
                embeddings = json.loads(response['Body'].read())
                embeddings_etag = response['ETag'].strip('"')
                log.info("Loaded embeddings", entry_count=len(embeddings), etag=embeddings_etag)
            except ClientError as e:
                if e.response['Error']['Code'] == 'NoSuchKey':
                    log.warning("Embeddings not found", key=embeddings_key)
                    embeddings = {}
                    embeddings_etag = None
                else:
                    return False, f"Error loading {embeddings_key}: {str(e)}"

            # Step 3: Delete recipe from both dictionaries
            # Save the recipe before deletion for potential rollback
            deleted_recipe = combined_data.get(recipe_key)

            log.info("Removing recipe from both files", recipe_key=recipe_key)
            updated_combined_data = delete_recipe_from_combined_data(recipe_key, combined_data)
            updated_embeddings = delete_embedding_from_store(recipe_key, embeddings)

            # Step 4: Write updated combined_data to S3
            log.info("Writing updated combined_data to S3")
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
                log.info("Successfully wrote combined_data")
            except ClientError as e:
                if e.response['Error']['Code'] == 'PreconditionFailed':
                    log.warning("Race condition on combined_data", attempt=attempt + 1)
                    if attempt < MAX_RETRIES - 1:
                        delay = random.uniform(0.1, 0.5) * (2 ** attempt)
                        log.info("Retrying after delay", delay_seconds=round(delay, 2))
                        time.sleep(delay)
                        continue
                    else:
                        return False, f"Max retries exceeded updating {combined_data_key}"
                else:
                    return False, f"Error writing {combined_data_key}: {str(e)}"

            # Step 5: Write embeddings
            log.info("Writing updated embeddings to S3")
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
                log.info("Successfully wrote embeddings")
            except ClientError as e:
                # Embeddings write failed after combined_data succeeded — rollback
                log.error(
                    "Embeddings write failed after combined_data succeeded",
                    recipe_key=recipe_key,
                    error=str(e)
                )

                if deleted_recipe is not None:
                    _rollback_combined_data(
                        recipe_key, deleted_recipe, s3_client, bucket, combined_data_key
                    )

                if e.response['Error']['Code'] == 'PreconditionFailed':
                    if attempt < MAX_RETRIES - 1:
                        delay = random.uniform(0.1, 0.5) * (2 ** attempt)
                        log.info("Retrying after delay", delay_seconds=round(delay, 2))
                        time.sleep(delay)
                        continue
                    else:
                        return False, f"Max retries exceeded updating {embeddings_key}"
                else:
                    return False, f"Error writing {embeddings_key}: {str(e)}"

            # Success!
            log.info("Recipe deleted successfully", recipe_key=recipe_key)
            return True, None

        except Exception as e:
            log.error("Unexpected error", error=str(e))
            return False, f"Unexpected error: {str(e)}"

    # Should not reach here, but just in case
    return False, f"Max retries ({MAX_RETRIES}) exceeded"
