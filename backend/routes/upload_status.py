"""GET /upload/status/{jobId} — fetch async upload job status from S3."""

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

log = get_logger("routes.upload_status")


def handle_status_request(event, context, job_id):
    if not job_id:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Missing jobId parameter"}),
        }

    bucket_name = os.getenv("S3_BUCKET")
    if not bucket_name:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "S3_BUCKET environment variable not set"}),
        }
    status_key = f"upload-status/{job_id}.json"

    try:
        s3_client = lf.S3
        response = s3_client.get_object(Bucket=bucket_name, Key=status_key)
        status_data = json.loads(response["Body"].read().decode("utf-8"))
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json", "Cache-Control": "no-cache"},
            "body": json.dumps(status_data),
        }
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "NoSuchKey":
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Job not found", "jobId": job_id}),
            }
        log.error("Error fetching job status", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Failed to fetch status: {str(e)}"}),
        }
    except Exception as e:
        log.error("Error fetching job status", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Failed to fetch status: {str(e)}"}),
        }
