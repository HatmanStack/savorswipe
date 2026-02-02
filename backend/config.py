"""
Configuration constants for recipe processing.

These values can be overridden via environment variables for flexibility
without code changes.
"""
import os

# Duplicate detection threshold (0.0 - 1.0)
# Higher = more strict (fewer false positives, more false negatives)
SIMILARITY_THRESHOLD: float = float(os.getenv('SIMILARITY_THRESHOLD', '0.85'))

# PDF processing limits
PDF_MAX_PAGES: int = int(os.getenv('PDF_MAX_PAGES', '50'))

# Recipe freshness - hours before "new" badge disappears
NEW_RECIPE_HOURS: int = int(os.getenv('NEW_RECIPE_HOURS', '72'))

# Batch processing
MAX_RETRIES: int = int(os.getenv('MAX_RETRIES', '3'))

# Image upload
PROBLEMATIC_DOMAINS: list[str] = [
    'lookaside.instagram.com',
    'instagram.com',
    'pinterest.com',
    'facebook.com',
    'twitter.com',
    'x.com',
    'tiktok.com',
]
