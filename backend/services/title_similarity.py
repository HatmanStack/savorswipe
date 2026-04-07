"""
Title similarity helper for matching multi-page recipes.

Pure function. Computes Jaccard similarity between two recipe titles
after lowercasing, stripping punctuation, and removing common stopwords.
"""

from __future__ import annotations

import re

_STOPWORDS = {"the", "a", "an", "and", "or", "of", "for", "with", "to"}


def _normalize(title: str) -> set[str]:
    title = title.lower()
    title = re.sub(r"[^\w\s]", "", title)
    return set(title.split()) - _STOPWORDS


def title_similarity(title1: str, title2: str) -> float:
    """Return Jaccard word overlap between two titles in [0, 1]."""
    words1 = _normalize(title1)
    words2 = _normalize(title2)

    if not words1 or not words2:
        return 0.0

    intersection = words1 & words2
    union = words1 | words2
    return len(intersection) / len(union) if union else 0.0
