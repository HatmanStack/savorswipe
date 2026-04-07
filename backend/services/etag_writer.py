"""
ETag-locked optimistic write helper.

Replaces the 4-deep nested try/except retry loop in lambda_function.py with
a single-level helper. The caller supplies a ``mutate_fn`` that takes the
current parsed JSON and returns the new parsed JSON, plus an optional
``cleanup_fn`` for orphan resources that should be released only when all
retries have failed.

The helper handles:
- GET-with-ETag (initial load)
- conditional PUT (``IfMatch=etag``)
- bounded exponential backoff (capped at 2s total wait)
- single cleanup_fn invocation on exhaustion (never on success)
"""

from __future__ import annotations

import json
import random
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

from botocore.exceptions import ClientError

from logger import get_logger

log = get_logger("services.etag_writer")

MAX_RETRIES = 3
_BACKOFF_CAP_SECONDS = 2.0


@dataclass
class WriteResult:
    """Outcome of an ETag-locked write attempt."""

    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    not_found: bool = False
    attempts: int = 0


def write_with_etag(
    s3_client,
    bucket: str,
    key: str,
    mutate_fn: Callable[[Any], Any],
    cleanup_fn: Optional[Callable[[], None]] = None,
    max_retries: int = MAX_RETRIES,
    sleep_fn: Callable[[float], None] = time.sleep,
    rand_fn: Callable[[float, float], float] = random.uniform,
) -> WriteResult:
    """
    Optimistic concurrency write to an S3 JSON object using ETag IfMatch.

    ``mutate_fn`` is invoked with the parsed JSON and must return the new
    parsed JSON object to write. It may raise ``KeyError`` to signal a
    "not found" condition that should be surfaced to the caller without
    triggering cleanup.

    Returns a ``WriteResult``. ``cleanup_fn`` is invoked exactly once iff
    the final attempt fails (and never on success or on a not_found exit).
    """
    last_error: Optional[str] = None
    total_sleep = 0.0

    for attempt in range(max_retries):
        try:
            response = s3_client.get_object(Bucket=bucket, Key=key)
            current = json.loads(response["Body"].read())
            etag = response["ETag"].strip('"')
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code == "NoSuchKey":
                return WriteResult(success=False, not_found=True, error="NoSuchKey", attempts=attempt + 1)
            last_error = f"GET failed: {e}"
            log.error("ETag writer GET failed", key=key, error=str(e))
            break

        try:
            new_data = mutate_fn(current)
        except KeyError as e:
            # Caller signalled "target missing"; not retryable, no cleanup.
            return WriteResult(
                success=False,
                not_found=True,
                error=str(e),
                attempts=attempt + 1,
            )

        try:
            s3_client.put_object(
                Bucket=bucket,
                Key=key,
                Body=json.dumps(new_data),
                ContentType="application/json",
                IfMatch=etag,
            )
            return WriteResult(success=True, data=new_data, attempts=attempt + 1)
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code == "PreconditionFailed":
                last_error = "PreconditionFailed"
                if attempt < max_retries - 1:
                    delay = rand_fn(0, (2**attempt) * 0.1)
                    remaining = max(0.0, _BACKOFF_CAP_SECONDS - total_sleep)
                    delay = min(delay, remaining)
                    log.warning(
                        "ETag writer retrying after conflict",
                        key=key,
                        attempt=attempt + 1,
                        delay=round(delay, 3),
                    )
                    if delay > 0:
                        sleep_fn(delay)
                        total_sleep += delay
                    continue
                break
            last_error = f"PUT failed: {e}"
            log.error("ETag writer PUT failed", key=key, error=str(e))
            break

    if cleanup_fn is not None:
        try:
            cleanup_fn()
        except Exception as cleanup_err:  # pragma: no cover - defensive
            log.error("ETag writer cleanup_fn raised", error=str(cleanup_err))

    return WriteResult(success=False, error=last_error or "unknown", attempts=max_retries)
