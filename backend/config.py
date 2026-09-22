"""
Configuration constants for recipe processing.

These values can be overridden via environment variables for flexibility
without code changes.
"""

import os

# Duplicate detection threshold (0.0 - 1.0)
# Higher = more strict (fewer false positives, more false negatives)
SIMILARITY_THRESHOLD: float = float(os.getenv("SIMILARITY_THRESHOLD", "0.85"))

# PDF processing limits
PDF_MAX_PAGES: int = int(os.getenv("PDF_MAX_PAGES", "50"))

# Batch processing
MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", "3"))

# OpenAI Vision model used by ocr.py for recipe extraction.
# Default: gpt-4o (production-grade vision model). Override via env var.
OPENAI_VISION_MODEL: str = os.environ.get("OPENAI_VISION_MODEL", "gpt-4o")

# OpenAI embedding model used by embedding_generator.py for duplicate detection.
# Changing this after recipes exist requires re-embedding every stored recipe,
# since duplicate detection compares vectors from a single model.
OPENAI_EMBEDDING_MODEL: str = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

# Image upload
PROBLEMATIC_DOMAINS: list[str] = [
    "lookaside.instagram.com",
    "instagram.com",
    "pinterest.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "tiktok.com",
]
