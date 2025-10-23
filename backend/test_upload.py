import unittest
from unittest.mock import MagicMock, patch, call
import json
from botocore.exceptions import ClientError
from upload import normalize_title, batch_to_s3_atomic


class TestUploadModule(unittest.TestCase):
    """Test cases for upload module batch processing functions."""

    def setUp(self):
        """Set up test fixtures."""
        self.bucket_name = 'test-bucket'
        self.test_recipes = [
            {
                'Title': 'Chocolate Chip Cookies',
                'Ingredients': ['flour', 'sugar', 'chocolate chips']
            },
            {
                'Title': 'Banana Bread',
                'Ingredients': ['bananas', 'flour', 'sugar']
            }
        ]
        self.existing_data = {
            '1': {'Title': 'Existing Recipe', 'key': 1}
        }

    def test_normalize_title(self):
        """Test title normalization (lowercase and trim)."""
        test_cases = [
            ('Chocolate Chip Cookies', 'chocolate chip cookies'),
            ('  BANANA BREAD  ', 'banana bread'),
            ('Mixed Case Recipe', 'mixed case recipe'),
            ('Recipe   With   Spaces', 'recipe   with   spaces')
        ]

        for input_title, expected in test_cases:
            with self.subTest(input=input_title):
                result = normalize_title(input_title)
                self.assertEqual(result, expected)

    @patch('upload.s3_client')
    @patch('upload.upload_image')
    def test_batch_to_s3_empty_list(self, mock_upload_image, mock_s3):
        """Test batch upload with empty recipes list."""
        # Mock existing data
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(self.existing_data).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response

        # Test with empty list
        result_data, success_keys, errors = batch_to_s3_atomic([], [])

        # Verify
        self.assertEqual(success_keys, [])
        self.assertEqual(errors, [])
        mock_upload_image.assert_not_called()
        mock_s3.put_object.assert_not_called()

    @patch('upload.s3_client')
    @patch('upload.upload_image')
    def test_batch_to_s3_all_success(self, mock_upload_image, mock_s3):
        """Test batch upload with all recipes succeeding."""
        # Mock existing data
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(self.existing_data).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response

        # Mock successful image uploads
        mock_upload_image.return_value = True

        # Mock search results
        search_results_list = [
            {'items': [{'link': 'url1'}]},
            {'items': [{'link': 'url2'}]}
        ]

        # Test
        result_data, success_keys, errors = batch_to_s3_atomic(
            self.test_recipes,
            search_results_list
        )

        # Verify
        self.assertEqual(len(success_keys), 2)
        self.assertEqual(success_keys, ['2', '3'])  # Keys after existing key '1'
        self.assertEqual(len(errors), 0)
        self.assertEqual(mock_upload_image.call_count, 2)
        mock_s3.put_object.assert_called_once()

    @patch('upload.s3_client')
    @patch('upload.upload_image')
    def test_batch_to_s3_uses_conditional_write(self, mock_upload_image, mock_s3):
        """Test that batch upload uses S3 conditional write with ETag."""
        # Mock existing data with ETag
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(self.existing_data).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response
        mock_upload_image.return_value = True

        search_results_list = [{'items': [{'link': 'url1'}]}]

        # Test
        batch_to_s3_atomic(self.test_recipes[:1], search_results_list)

        # Verify put_object was called with IfMatch parameter
        put_call_kwargs = mock_s3.put_object.call_args[1]
        self.assertIn('IfMatch', put_call_kwargs)
        self.assertEqual(put_call_kwargs['IfMatch'], 'etag123')

    @patch('upload.s3_client')
    @patch('upload.upload_image')
    def test_batch_to_s3_duplicate_title(self, mock_upload_image, mock_s3):
        """Test that duplicate titles are rejected with error."""
        # Mock existing data with recipe that has same title as new one
        existing = {
            '1': {'Title': 'Chocolate Chip Cookies', 'key': 1}
        }
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(existing).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response

        search_results_list = [{'items': [{'link': 'url1'}]}]

        # Test with duplicate title
        result_data, success_keys, errors = batch_to_s3_atomic(
            self.test_recipes[:1],
            search_results_list
        )

        # Verify error was added
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]['file'], 0)
        self.assertIn('already exists', errors[0]['reason'])
        self.assertEqual(len(success_keys), 0)

    @patch('upload.s3_client')
    @patch('upload.upload_image')
    def test_batch_to_s3_image_upload_failure(self, mock_upload_image, mock_s3):
        """Test error handling when image upload fails."""
        # Mock existing data
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(self.existing_data).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response

        # Mock failed image upload
        mock_upload_image.return_value = False

        search_results_list = [{'items': [{'link': 'url1'}]}]

        # Test
        result_data, success_keys, errors = batch_to_s3_atomic(
            self.test_recipes[:1],
            search_results_list
        )

        # Verify error was added
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]['file'], 0)
        self.assertIn('Image upload failed', errors[0]['reason'])
        self.assertEqual(len(success_keys), 0)

    @patch('upload.s3_client')
    @patch('upload.upload_image')
    @patch('upload.time.sleep')
    def test_batch_to_s3_race_condition_retry(self, mock_sleep, mock_upload_image, mock_s3):
        """Test retry logic when first put_object fails with conflict."""
        # Mock existing data
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(self.existing_data).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response
        mock_upload_image.return_value = True

        # First put_object fails with PreconditionFailed, second succeeds
        error_response = {'Error': {'Code': 'PreconditionFailed'}}
        mock_s3.put_object.side_effect = [
            ClientError(error_response, 'PutObject'),
            MagicMock()  # Success on second attempt
        ]

        search_results_list = [{'items': [{'link': 'url1'}]}]

        # Test
        result_data, success_keys, errors = batch_to_s3_atomic(
            self.test_recipes[:1],
            search_results_list
        )

        # Verify retry happened
        self.assertEqual(mock_s3.put_object.call_count, 2)
        self.assertEqual(mock_s3.get_object.call_count, 2)  # Load twice
        self.assertEqual(len(success_keys), 1)
        mock_sleep.assert_called_once()  # Backoff after first failure

    @patch('upload.s3_client')
    @patch('upload.upload_image')
    @patch('upload.time.sleep')
    def test_batch_to_s3_race_condition_rollback(self, mock_sleep, mock_upload_image, mock_s3):
        """Test that uploaded images are rolled back on write conflict."""
        # Mock existing data
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(self.existing_data).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response
        mock_upload_image.return_value = True

        # First attempt fails with conflict
        error_response = {'Error': {'Code': 'PreconditionFailed'}}
        mock_s3.put_object.side_effect = [
            ClientError(error_response, 'PutObject'),
            MagicMock()  # Second attempt succeeds
        ]

        search_results_list = [{'items': [{'link': 'url1'}]}]

        # Test
        batch_to_s3_atomic(self.test_recipes[:1], search_results_list)

        # Verify delete_object was called for rollback
        delete_calls = [call for call in mock_s3.delete_object.call_args_list]
        self.assertGreater(len(delete_calls), 0)

    @patch('upload.s3_client')
    @patch('upload.upload_image')
    @patch('upload.time.sleep')
    def test_batch_to_s3_max_retries_exceeded(self, mock_sleep, mock_upload_image, mock_s3):
        """Test that exception is raised after max retries exhausted."""
        # Mock existing data
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(self.existing_data).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response
        mock_upload_image.return_value = True

        # All put_object attempts fail
        error_response = {'Error': {'Code': 'PreconditionFailed'}}
        mock_s3.put_object.side_effect = ClientError(error_response, 'PutObject')

        search_results_list = [{'items': [{'link': 'url1'}]}]

        # Test - should raise exception
        with self.assertRaises(Exception) as context:
            batch_to_s3_atomic(self.test_recipes[:1], search_results_list)

        self.assertIn('max retries', str(context.exception).lower())

    @patch('upload.s3_client')
    @patch('upload.upload_image')
    def test_batch_to_s3_error_format(self, mock_upload_image, mock_s3):
        """Test that errors use 'file' key (not 'index') consistently."""
        # Mock existing data
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(self.existing_data).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response

        # Mock image upload failure
        mock_upload_image.return_value = False

        search_results_list = [{'items': [{'link': 'url1'}]}]

        # Test
        result_data, success_keys, errors = batch_to_s3_atomic(
            self.test_recipes[:1],
            search_results_list
        )

        # Verify error format
        self.assertEqual(len(errors), 1)
        self.assertIn('file', errors[0])
        self.assertNotIn('index', errors[0])
        self.assertIsInstance(errors[0]['file'], int)


if __name__ == '__main__':
    unittest.main()
