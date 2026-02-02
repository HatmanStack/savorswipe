"""
Semantic Duplicate Detection Module

Detects duplicate recipes using cosine similarity of embeddings.
"""

import math
from typing import Dict, List, Optional, Tuple

from config import SIMILARITY_THRESHOLD


class DuplicateDetector:
    """Detects duplicate recipes using cosine similarity of embeddings."""

    SIMILARITY_THRESHOLD: float = SIMILARITY_THRESHOLD

    def __init__(self, existing_embeddings: Dict[str, List[float]]) -> None:
        """
        Initialize the duplicate detector.

        Args:
            existing_embeddings: Dictionary mapping recipe keys to embedding vectors
        """
        self.existing_embeddings = existing_embeddings

    @staticmethod
    def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        """
        Calculate cosine similarity between two vectors.

        Cosine similarity ranges from -1 (opposite) to 1 (identical).

        Args:
            vec1: First vector
            vec2: Second vector

        Returns:
            Cosine similarity score

        Raises:
            ValueError: If vectors have different lengths
        """
        # Guard against length mismatch
        if len(vec1) != len(vec2):
            raise ValueError(
                f"Vector length mismatch: vec1 has {len(vec1)} dimensions, "
                f"vec2 has {len(vec2)} dimensions. Vectors must have equal length."
            )

        # Calculate dot product
        dot_product = sum(a * b for a, b in zip(vec1, vec2))

        # Calculate magnitudes
        magnitude1 = math.sqrt(sum(x * x for x in vec1))
        magnitude2 = math.sqrt(sum(x * x for x in vec2))

        # Handle zero vectors
        if magnitude1 == 0 or magnitude2 == 0:
            return 0.0

        # Calculate cosine similarity
        similarity = dot_product / (magnitude1 * magnitude2)

        return similarity

    def find_most_similar(self, new_embedding: List[float]) -> Tuple[Optional[str], float]:
        """
        Find the most similar existing recipe to the new embedding.

        Args:
            new_embedding: Embedding vector to compare

        Returns:
            Tuple of (recipe_key, similarity_score) or (None, 0.0) if no embeddings exist
        """
        if not self.existing_embeddings:
            return None, 0.0

        max_similarity = 0.0
        most_similar_key = None

        for recipe_key, embedding in self.existing_embeddings.items():
            similarity = self.cosine_similarity(new_embedding, embedding)

            if similarity > max_similarity:
                max_similarity = similarity
                most_similar_key = recipe_key

        return most_similar_key, max_similarity

    def is_duplicate(self, new_embedding: List[float]) -> Tuple[bool, Optional[str], float]:
        """
        Check if the new embedding is a duplicate of an existing recipe.

        Args:
            new_embedding: Embedding vector to check

        Returns:
            Tuple of (is_duplicate, duplicate_key, similarity_score)
            - is_duplicate: True if similarity exceeds threshold
            - duplicate_key: Key of the duplicate recipe (if found)
            - similarity_score: Similarity score with most similar recipe
        """
        most_similar_key, similarity_score = self.find_most_similar(new_embedding)

        if similarity_score > self.SIMILARITY_THRESHOLD:
            return True, most_similar_key, similarity_score
        else:
            return False, None, similarity_score
