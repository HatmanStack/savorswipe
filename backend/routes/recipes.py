"""GET /recipes — fetch combined_data.json from S3."""

from __future__ import annotations

import json
import os

from botocore.exceptions import ClientError

from logger import get_logger


class _LFProxy:
    def __getattr__(self, name):
        import lambda_function  # noqa: PLC0415

        return getattr(lambda_function, name)


lf = _LFProxy()

log = get_logger("routes.recipes")


def handle_get_request(event, context):
    """Return combined_data.json with cache-prevention headers."""
    bucket_name = os.getenv("S3_BUCKET")
    if not bucket_name:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "S3_BUCKET environment variable not set"}),
        }

    s3_client = lf.S3
    json_key = "jsondata/combined_data.json"

    try:
        response = s3_client.get_object(Bucket=bucket_name, Key=json_key)
        json_data = response["Body"].read().decode("utf-8")
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
            "body": json_data,
        }
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code == "NoSuchKey":
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": f"File not found: {json_key}"}),
            }
        log.error("S3 ClientError fetching recipe JSON", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Failed to fetch recipes: {str(e)}"}),
        }
    except Exception as e:
        log.error("Error fetching recipe JSON from S3", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Failed to fetch recipes: {str(e)}"}),
        }
