"""
Per-endpoint Lambda route handlers and the explicit dispatch table.

The dispatch table maps ``(method, path_pattern)`` to handler-name strings
that are resolved against the ``lambda_function`` module at request time
(so ``patch('lambda_function.handle_X')`` continues to work).
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Pattern, Tuple

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

KNOWN_METHODS = {"GET", "POST", "DELETE"}


def dispatch(method: str, path: str) -> Optional[Tuple[str, Dict[str, str]]]:
    """Resolve ``(method, path)`` to ``(handler_name, path_params)`` or ``None``."""
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
    """Return ``True`` if any route matches ``path`` under any HTTP method."""
    for _, pattern, _ in ROUTES:
        if pattern.match(path):
            return True
    return False
