from backend.upload import batch_to_s3_atomic
import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone
import json


class TestUploadTimestamp(unittest.TestCase):
    """Test suite for uploadedAt timestamp injection in recipe uploads."""

    def setUp(self):
        """Set up test fixtures."""
        self.bucket_patcher = patch('backend.upload.bucket_name', 'test-bucket')
        self.bucket_patcher.start()
        self.mock_recipe = {
            'Title': 'Test Recipe',
            'Servings': 4,
            'Ingredients': {'flour': '2 cups'},
            'Directions': ['Mix ingredients']
        }
        # List of URL strings (new format expected by batch_to_s3_atomic)
        self.mock_search_results = [['http://example.com/image.jpg']]

    def tearDown(self):
        self.bucket_patcher.stop()

    def _setup_mocks(self, mock_s3, mock_upload_image, existing_data=None):
        """
        Helper to set up S3 and upload_image mocks consistently.

        Args:
            mock_s3: Mocked S3 client
            mock_upload_image: Mocked upload_image function
            existing_data: Optional dict of existing recipe data (defaults to empty)
        """
        if existing_data is None:
            existing_data = {}

        # Mock S3 get_object (fetching existing combined_data.json)
        mock_s3.get_object.return_value = {
            'Body': MagicMock(read=lambda: json.dumps(existing_data).encode()),
            'ETag': '"etag123"'
        }

        # Mock S3 put_object (writing updated combined_data.json)
        mock_s3.put_object.return_value = {
            'ETag': '"new-etag456"'
        }

        # Mock successful image upload
        mock_upload_image.return_value = 'http://example.com/image.jpg'

    @patch('backend.upload.s3_client')
    @patch('backend.upload.upload_image')
    def test_uploaded_at_field_added(self, mock_upload_image, mock_s3):
        """Test that uploadedAt field is added to recipe."""
        self._setup_mocks(mock_s3, mock_upload_image)

        # Call batch_to_s3_atomic
        result_data, success_keys, _, _ = batch_to_s3_atomic(
            [self.mock_recipe],
            self.mock_search_results
        )

        # Assert uploadedAt field exists
        self.assertEqual(len(success_keys), 1)
        recipe_key = success_keys[0]
        uploaded_recipe = result_data[recipe_key]
        self.assertIn('uploadedAt', uploaded_recipe)
        self.assertIsInstance(uploaded_recipe['uploadedAt'], str)

    @patch('backend.upload.s3_client')
    @patch('backend.upload.upload_image')
    def test_uploaded_at_is_iso8601_format(self, mock_upload_image, mock_s3):
        """Test that uploadedAt timestamp uses ISO 8601 format."""
        self._setup_mocks(mock_s3, mock_upload_image)

        # Call batch_to_s3_atomic
        result_data, success_keys, _, _ = batch_to_s3_atomic(
            [self.mock_recipe],
            self.mock_search_results
        )

        # Extract uploadedAt value
        recipe_key = success_keys[0]
        uploaded_at = result_data[recipe_key]['uploadedAt']

        # Parse using datetime.fromisoformat() - should not raise exception
        try:
            parsed_timestamp = datetime.fromisoformat(uploaded_at)
            self.assertIsInstance(parsed_timestamp, datetime)
        except ValueError as e:
            self.fail(f"uploadedAt is not valid ISO 8601 format: {e}")

    @patch('backend.upload.s3_client')
    @patch('backend.upload.upload_image')
    def test_uploaded_at_is_recent(self, mock_upload_image, mock_s3):
        """Test that uploadedAt timestamp is recent (within seconds of test execution)."""
        self._setup_mocks(mock_s3, mock_upload_image)

        # Capture current time before call
        before_time = datetime.now(timezone.utc)

        # Call batch_to_s3_atomic
        result_data, success_keys, _, _ = batch_to_s3_atomic(
            [self.mock_recipe],
            self.mock_search_results
        )

        # Capture current time after call
        after_time = datetime.now(timezone.utc)

        # Parse uploadedAt timestamp
        recipe_key = success_keys[0]
        uploaded_at = result_data[recipe_key]['uploadedAt']
        parsed_timestamp = datetime.fromisoformat(uploaded_at)

        # Assert timestamp is between before and after times (allowing 10 second tolerance)
        time_diff = (after_time - parsed_timestamp).total_seconds()
        self.assertLess(time_diff, 10, "Timestamp should be within 10 seconds of test execution")
        self.assertGreaterEqual(parsed_timestamp, before_time,
                                "Timestamp should not be in the past")

    @patch('backend.upload.s3_client')
    @patch('backend.upload.upload_image')
    def test_uploaded_at_uses_utc_timezone(self, mock_upload_image, mock_s3):
        """Test that uploadedAt timestamp uses UTC timezone."""
        self._setup_mocks(mock_s3, mock_upload_image)

        # Call batch_to_s3_atomic
        result_data, success_keys, _, _ = batch_to_s3_atomic(
            [self.mock_recipe],
            self.mock_search_results
        )

        # Parse uploadedAt timestamp
        recipe_key = success_keys[0]
        uploaded_at = result_data[recipe_key]['uploadedAt']
        parsed_timestamp = datetime.fromisoformat(uploaded_at)

        # Check timezone info exists and is UTC
        self.assertIsNotNone(parsed_timestamp.tzinfo, "Timestamp should have timezone info")
        utc_offset = parsed_timestamp.utcoffset()
        self.assertEqual(utc_offset.total_seconds(), 0, "Timezone offset should be 0 (UTC)")

    @patch('backend.upload.s3_client')
    @patch('backend.upload.upload_image')
    def test_multiple_recipes_all_have_timestamp(self, mock_upload_image, mock_s3):
        """Test that all recipes in batch receive uploadedAt timestamp."""
        self._setup_mocks(mock_s3, mock_upload_image)

        # Create multiple recipes
        recipes = [
            {'Title': 'Recipe 1', 'Servings': 2, 'Ingredients': {
                'egg': '1'}, 'Directions': ['Cook']},
            {'Title': 'Recipe 2', 'Servings': 4, 'Ingredients': {
                'milk': '1 cup'}, 'Directions': ['Heat']},
            {'Title': 'Recipe 3', 'Servings': 6, 'Ingredients': {
                'sugar': '2 tbsp'}, 'Directions': ['Mix']}
        ]
        # List of URL strings for each recipe
        search_results = [
            ['http://example.com/image1.jpg'],
            ['http://example.com/image2.jpg'],
            ['http://example.com/image3.jpg']
        ]

        # Call batch_to_s3_atomic
        result_data, success_keys, _, _ = batch_to_s3_atomic(recipes, search_results)

        # Assert all recipes have uploadedAt field
        self.assertEqual(len(success_keys), 3)
        for recipe_key in success_keys:
            uploaded_recipe = result_data[recipe_key]
            self.assertIn('uploadedAt', uploaded_recipe)
            self.assertIsInstance(uploaded_recipe['uploadedAt'], str)

            # Also verify it's a valid timestamp
            parsed_timestamp = datetime.fromisoformat(uploaded_recipe['uploadedAt'])
            self.assertIsInstance(parsed_timestamp, datetime)


if __name__ == '__main__':
    unittest.main()
