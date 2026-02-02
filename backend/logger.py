"""
Structured Logging Module for Lambda Functions.

Provides JSON-structured logging that is CloudWatch-friendly and supports
consistent formatting across all backend modules.
"""
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any, Optional

# Configure root logger to output raw messages (we format as JSON ourselves)
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s',
    stream=sys.stdout
)


class StructuredLogger:
    """
    Structured JSON logger for Lambda functions.

    Outputs logs in CloudWatch Insights-friendly JSON format with consistent
    structure across all log entries.
    """

    def __init__(self, component: str) -> None:
        """
        Initialize logger for a specific component.

        Args:
            component: Name of the component (e.g., 'lambda', 'upload', 'ocr')
        """
        self.component = component
        self.debug_mode = os.getenv('DEBUG_MODE', 'false').lower() == 'true'
        self._logger = logging.getLogger(f'recipe-processor.{component}')

    def _format(
        self,
        level: str,
        message: str,
        extra: Optional[dict[str, Any]] = None
    ) -> str:
        """
        Format log entry as JSON string.

        Args:
            level: Log level (INFO, WARN, ERROR, DEBUG)
            message: Log message
            extra: Additional context key-value pairs

        Returns:
            JSON-formatted log string
        """
        entry: dict[str, Any] = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'level': level,
            'component': self.component,
            'message': message,
        }
        if extra:
            entry['context'] = extra
        return json.dumps(entry, default=str)

    def info(self, message: str, **kwargs: Any) -> None:
        """Log info level message."""
        self._logger.info(self._format('INFO', message, kwargs or None))

    def warning(self, message: str, **kwargs: Any) -> None:
        """Log warning level message."""
        self._logger.warning(self._format('WARN', message, kwargs or None))

    def error(self, message: str, **kwargs: Any) -> None:
        """Log error level message."""
        self._logger.error(self._format('ERROR', message, kwargs or None))

    def debug(self, message: str, **kwargs: Any) -> None:
        """Log debug level message (only if DEBUG_MODE is enabled)."""
        if self.debug_mode:
            self._logger.debug(self._format('DEBUG', message, kwargs or None))


def get_logger(component: str) -> StructuredLogger:
    """
    Get a structured logger for a component.

    Args:
        component: Name of the component

    Returns:
        StructuredLogger instance

    Example:
        >>> log = get_logger('upload')
        >>> log.info('Processing file', filename='recipe.jpg', size=12345)
    """
    return StructuredLogger(component)
