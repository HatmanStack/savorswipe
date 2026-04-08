"""DELETE /recipe/{recipe_key} — atomic recipe deletion."""

from __future__ import annotations

import json
import os
import re

from logger import get_logger
from recipe_deletion import delete_recipe_atomic


class _LFProxy:
    def __getattr__(self, name):
        import lambda_function  # noqa: PLC0415

        return getattr(lambda_function, name)


lf = _LFProxy()

log = get_logger("routes.recipe_delete")


def handle_delete_request(event, context, recipe_key=None):
    bucket_name = os.getenv("S3_BUCKET")
    if not bucket_name:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"success": False, "error": "S3_BUCKET environment variable not set"}),
        }
    if not recipe_key:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"success": False, "error": "Missing recipe_key parameter"}),
        }

    log.info("Delete request received", recipe_key=recipe_key)

    if not re.match(r"^[a-zA-Z0-9_-]+$", recipe_key):
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {"success": False, "error": f"Invalid recipe_key format: {recipe_key}"}
            ),
        }

    try:
        s3_client = lf.S3
        success, error_message = delete_recipe_atomic(
            recipe_key,
            s3_client,
            bucket_name,
            combined_data_key="jsondata/combined_data.json",
            embeddings_key="jsondata/recipe_embeddings.json",
        )

        if success:
            log.info("Successfully deleted recipe", recipe_key=recipe_key)
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps(
                    {"success": True, "message": f"Recipe {recipe_key} deleted successfully"}
                ),
            }

        log.error("Failed to delete recipe", recipe_key=recipe_key, error=error_message)
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "success": False,
                    "error": f'Failed to delete recipe: {error_message or "Unknown error"}',
                }
            ),
        }
    except Exception as e:
        log.error("Unexpected error deleting recipe", recipe_key=recipe_key, error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {"success": False, "error": f"Failed to delete recipe: {str(e)}"}
            ),
        }
