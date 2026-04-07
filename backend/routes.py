"""
Explicit route table for the recipe-processor Lambda.

Replaces the substring-based dispatch in lambda_function.lambda_handler with
regex-based path matching and parameter extraction. Each route is a tuple of
``(method, compiled_pattern, handler_name)``. The handler name is resolved
against the lambda_function module at dispatch time.

Path parameters are captured via named groups (``(?P<recipe_key>[^/]+)``)
and forwarded to the handler as kwargs.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Pattern, Tuple

# (method, compiled regex, handler name)
ROUTES: List[Tuple[str, Pattern[str], str]] = [
    ("GET", re.compile(r"^/recipes/?$"), "handle_get_request"),
    (
        "GET",
        re.compile(r"^/upload/status/(?P<jobId>[^/]+)/?$"),
        "handle_status_request",
    ),
    (
        "DELETE",
        re.compile(r"^/recipe/(?P<recipe_key>[^/]+)/?$"),
        "handle_delete_request",
    ),
    (
        "POST",
        re.compile(r"^/recipe/(?P<recipe_key>[^/]+)/image/?$"),
        "handle_post_image_request",
    ),
    ("POST", re.compile(r"^/recipe/upload/?$"), "handle_post_request"),
]

# Methods that the API understands at all (used to distinguish 404 from 405).
KNOWN_METHODS = {"GET", "POST", "DELETE"}


def dispatch(method: str, path: str) -> Optional[Tuple[str, Dict[str, str]]]:
    """
    Resolve ``(method, path)`` to ``(handler_name, path_params)``.

    Returns ``None`` on miss. Trailing slashes are tolerated.
    """
    if not path:
        return None
    for route_method, pattern, handler_name in ROUTES:
        if route_method != method:
            continue
        match = pattern.match(path)
        if match:
            return handler_name, match.groupdict()
    return None


def method_allowed_for_path(path: str) -> bool:
    """Return True if any route matches the given path under any method."""
    for _, pattern, _ in ROUTES:
        if pattern.match(path):
            return True
    return False
