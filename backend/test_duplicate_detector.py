import unittest
from duplicate_detector import DuplicateDetector


class TestDuplicateDetector(unittest.TestCase):
    """Test cases for DuplicateDetector class."""

    def setUp(self):
        """Set up test fixtures."""
        self.test_embeddings = {
            'recipe_1': [1.0, 0.0, 0.0],
            'recipe_2': [0.0, 1.0, 0.0],
            'recipe_3': [0.7, 0.7, 0.0]
        }

    def test_cosine_similarity_identical(self):
        """Test cosine similarity of identical vectors is 1.0."""
        vec1 = [1.0, 2.0, 3.0]
        vec2 = [1.0, 2.0, 3.0]

        similarity = DuplicateDetector.cosine_similarity(vec1, vec2)

        self.assertAlmostEqual(similarity, 1.0, places=6)

    def test_cosine_similarity_orthogonal(self):
        """Test cosine similarity of orthogonal vectors is 0.0."""
        vec1 = [1.0, 0.0, 0.0]
        vec2 = [0.0, 1.0, 0.0]

        similarity = DuplicateDetector.cosine_similarity(vec1, vec2)

        self.assertAlmostEqual(similarity, 0.0, places=6)

    def test_cosine_similarity_opposite(self):
        """Test cosine similarity of opposite vectors is -1.0."""
        vec1 = [1.0, 2.0, 3.0]
        vec2 = [-1.0, -2.0, -3.0]

        similarity = DuplicateDetector.cosine_similarity(vec1, vec2)

        self.assertAlmostEqual(similarity, -1.0, places=6)

    def test_cosine_similarity_zero_vector(self):
        """Test cosine similarity with zero vector returns 0.0."""
        vec1 = [0.0, 0.0, 0.0]
        vec2 = [1.0, 2.0, 3.0]

        similarity = DuplicateDetector.cosine_similarity(vec1, vec2)

        self.assertEqual(similarity, 0.0)

        # Test both zero
        similarity = DuplicateDetector.cosine_similarity(vec1, vec1)
        self.assertEqual(similarity, 0.0)

    def test_find_most_similar_empty(self):
        """Test find_most_similar with no existing embeddings."""
        detector = DuplicateDetector({})
        new_embedding = [1.0, 0.0, 0.0]

        most_similar_key, similarity = detector.find_most_similar(new_embedding)

        self.assertIsNone(most_similar_key)
        self.assertEqual(similarity, 0.0)

    def test_find_most_similar_single(self):
        """Test find_most_similar with single very similar embedding."""
        embeddings = {
            'recipe_1': [1.0, 0.0, 0.0]
        }
        detector = DuplicateDetector(embeddings)

        # Very similar vector (just slightly different)
        new_embedding = [0.99, 0.01, 0.0]

        most_similar_key, similarity = detector.find_most_similar(new_embedding)

        self.assertEqual(most_similar_key, 'recipe_1')
        self.assertGreater(similarity, 0.9)

    def test_find_most_similar_multiple(self):
        """Test find_most_similar returns most similar from multiple embeddings."""
        detector = DuplicateDetector(self.test_embeddings)

        # New embedding very similar to recipe_3
        new_embedding = [0.71, 0.71, 0.0]

        most_similar_key, similarity = detector.find_most_similar(new_embedding)

        self.assertEqual(most_similar_key, 'recipe_3')
        self.assertGreater(similarity, 0.9)

    def test_is_duplicate_true_identical(self):
        """Test is_duplicate returns True for identical embedding."""
        detector = DuplicateDetector(self.test_embeddings)

        # Identical to recipe_1
        new_embedding = [1.0, 0.0, 0.0]

        is_dup, dup_key, similarity = detector.is_duplicate(new_embedding)

        self.assertTrue(is_dup)
        self.assertEqual(dup_key, 'recipe_1')
        self.assertAlmostEqual(similarity, 1.0, places=6)

    def test_is_duplicate_true_above_threshold(self):
        """Test is_duplicate returns True for similarity above threshold."""
        embeddings = {
            'recipe_1': [1.0, 0.0, 0.0]
        }
        detector = DuplicateDetector(embeddings)

        # Create embedding with similarity ~0.90 (above 0.85 threshold)
        # Using normalized vectors for predictable similarity
        new_embedding = [0.95, 0.31, 0.0]  # Similarity ~0.95

        is_dup, dup_key, similarity = detector.is_duplicate(new_embedding)

        self.assertTrue(is_dup)
        self.assertEqual(dup_key, 'recipe_1')
        self.assertGreater(similarity, DuplicateDetector.SIMILARITY_THRESHOLD)

    def test_is_duplicate_false_below_threshold(self):
        """Test is_duplicate returns False for similarity below threshold."""
        embeddings = {
            'recipe_1': [1.0, 0.0, 0.0]
        }
        detector = DuplicateDetector(embeddings)

        # Create embedding with similarity ~0.80 (below 0.85 threshold)
        new_embedding = [0.80, 0.60, 0.0]

        is_dup, dup_key, similarity = detector.is_duplicate(new_embedding)

        self.assertFalse(is_dup)
        self.assertIsNone(dup_key)
        self.assertLess(similarity, DuplicateDetector.SIMILARITY_THRESHOLD)

    def test_is_duplicate_false_orthogonal(self):
        """Test is_duplicate returns False for orthogonal vector."""
        embeddings = {
            'recipe_1': [1.0, 0.0, 0.0]
        }
        detector = DuplicateDetector(embeddings)

        # Orthogonal vector (similarity 0.0)
        new_embedding = [0.0, 1.0, 0.0]

        is_dup, dup_key, similarity = detector.is_duplicate(new_embedding)

        self.assertFalse(is_dup)
        self.assertIsNone(dup_key)
        self.assertAlmostEqual(similarity, 0.0, places=6)

    def test_cosine_similarity_normalization(self):
        """Test that cosine similarity is scale-invariant."""
        vec1 = [1.0, 2.0, 3.0]
        vec2 = [2.0, 4.0, 6.0]  # Scaled version of vec1

        similarity = DuplicateDetector.cosine_similarity(vec1, vec2)

        # Should be 1.0 since vec2 is just a scaled version of vec1
        self.assertAlmostEqual(similarity, 1.0, places=6)


if __name__ == '__main__':
    unittest.main()
