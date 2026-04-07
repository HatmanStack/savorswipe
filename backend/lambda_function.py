"""
AWS Lambda dispatcher for the recipe processor.

This module is intentionally thin: it owns logger setup, the
``lambda_handler`` dispatch shim, and a small set of re-exports so
existing tests that patch ``lambda_function.<symbol>`` continue to
work after the route/service split.

Architecture / auth notes:
    See docs/DEPLOYMENT.md and docs/plans/2026-04-07-audit-savorswipe/
    for the rationale behind the open-source, single-user/demo posture.
"""

from __future__ import annotations

import json

# Submodules referenced by tests via ``lambda_function.si.<x>``.
import search_image as si  # noqa: F401

# Module-scope AWS clients and helpers — re-exported so tests can
# monkeypatch ``lambda_function.<symbol>`` and route modules can read
# the patched values via ``lf.<symbol>`` indirection.
from aws_clients import CLOUDWATCH, LAMBDA, S3  # noqa: F401
from embedding_generator import EmbeddingGenerator  # noqa: F401
from embeddings import EmbeddingStore  # noqa: F401
from image_uploader import fetch_image_from_url, upload_image_to_s3  # noqa: F401
from logger import get_logger
from routes import dispatch, method_allowed_for_path

# Route handlers (imported after the symbols above so circular
# attribute lookups in route modules see them).
from routes.recipe_delete import handle_delete_request  # noqa: E402,F401
from routes.recipe_image import handle_post_image_request  # noqa: E402,F401
from routes.recipes import handle_get_request  # noqa: E402,F401
from routes.upload import (  # noqa: E402,F401
    handle_async_processing,
    handle_post_request,
    process_single_recipe,
    process_upload_files,
)
from routes.upload_status import handle_status_request  # noqa: E402,F401

log = get_logger("lambda")


def _json_response(status: int, payload: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(payload),
    }


def lambda_handler(event, context):
    """Dispatch API Gateway events to per-route handlers."""
    if event.get("async_processing"):
        return handle_async_processing(event, context)

    http_method = event.get("requestContext", {}).get("http", {}).get("method", "POST")
    request_path = event.get("requestContext", {}).get("http", {}).get("path", "")
    api_path_params = event.get("pathParameters") or {}

    log.debug("lambda_handler dispatch", method=http_method, path=request_path)

    # Direct invocation fallback (no requestContext path) — treat as POST upload.
    if not request_path:
        return handle_post_request(event, context)

    resolved = dispatch(http_method, request_path)
    if resolved is None:
        if method_allowed_for_path(request_path):
            return _json_response(
                405,
                {
                    "success": False,
                    "error": f"Method {http_method} not allowed for {request_path}",
                },
            )
        return _json_response(
            404,
            {"success": False, "error": f"No route for {http_method} {request_path}"},
        )

    handler_name, path_params = resolved
    path_params = {**path_params, **api_path_params}

    handler = globals().get(handler_name)
    if handler is None:
        log.error("Handler not found", handler=handler_name)
        return _json_response(500, {"success": False, "error": f"Handler {handler_name} not found"})

    if handler_name == "handle_status_request":
        return handler(event, context, path_params.get("jobId"))
    if handler_name == "handle_delete_request":
        return handler(event, context, path_params.get("recipe_key"))
    if handler_name == "handle_post_image_request":
        return handler(event, context, path_params.get("recipe_key"))
    return handler(event, context)
