import unittest
from unittest.mock import MagicMock, patch, call
import json
import sys
import os
from botocore.exceptions import ClientError

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from embeddings import EmbeddingStore


class TestEmbeddingStore(unittest.TestCase):
    """Test cases for EmbeddingStore class."""

    def setUp(self):
        """Set up test fixtures."""
        self.bucket_name = 'test-bucket'
        self.test_embeddings = {
            'recipe_1': [0.1, 0.2, 0.3],
            'recipe_2': [0.4, 0.5, 0.6]
        }

    @patch('embeddings.boto3.client')
    def test_load_embeddings_success(self, mock_boto_client):
        """Test loading embeddings successfully from S3."""
        # Mock S3 response
        mock_s3 = MagicMock()
        mock_boto_client.return_value = mock_s3

        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(self.test_embeddings).encode()),
            'ETag': '"abc123"'
        }
        mock_s3.get_object.return_value = mock_response

        # Test
        store = EmbeddingStore(self.bucket_name)
        embeddings, etag = store.load_embeddings()

        # Verify
        self.assertEqual(embeddings, self.test_embeddings)
        self.assertEqual(etag, 'abc123')
        mock_s3.get_object.assert_called_once_with(
            Bucket=self.bucket_name,
            Key=EmbeddingStore.EMBEDDINGS_KEY
        )

    @patch('embeddings.boto3.client')
    def test_load_embeddings_not_exists(self, mock_boto_client):
        """Test loading embeddings when file doesn't exist."""
        # Mock S3 NoSuchKey error
        mock_s3 = MagicMock()
        mock_boto_client.return_value = mock_s3

        error_response = {'Error': {'Code': 'NoSuchKey'}}
        mock_s3.get_object.side_effect = ClientError(error_response, 'GetObject')

        # Test
        store = EmbeddingStore(self.bucket_name)
        embeddings, etag = store.load_embeddings()

        # Verify
        self.assertEqual(embeddings, {})
        self.assertIsNone(etag)

    @patch('embeddings.boto3.client')
    def test_load_embeddings_strips_etag_quotes(self, mock_boto_client):
        """Test that ETag quotes are stripped correctly."""
        # Mock S3 response with quoted ETag
        mock_s3 = MagicMock()
        mock_boto_client.return_value = mock_s3

        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps({}).encode()),
            'ETag': '"abc123"'  # With quotes
        }
        mock_s3.get_object.return_value = mock_response

        # Test
        store = EmbeddingStore(self.bucket_name)
        _, etag = store.load_embeddings()

        # Verify quotes stripped
        self.assertEqual(etag, 'abc123')

    @patch('embeddings.boto3.client')
    def test_save_embeddings_without_etag(self, mock_boto_client):
        """Test saving embeddings without ETag (no conditional write)."""
        # Mock S3
        mock_s3 = MagicMock()
        mock_boto_client.return_value = mock_s3

        # Test
        store = EmbeddingStore(self.bucket_name)
        result = store.save_embeddings(self.test_embeddings, etag=None)

        # Verify
        self.assertTrue(result)

        # Check put_object was called without IfMatch
        call_kwargs = mock_s3.put_object.call_args[1]
        self.assertEqual(call_kwargs['Bucket'], self.bucket_name)
        self.assertEqual(call_kwargs['Key'], EmbeddingStore.EMBEDDINGS_KEY)
        self.assertNotIn('IfMatch', call_kwargs)

        # Verify body is valid JSON
        body_data = json.loads(call_kwargs['Body'])
        self.assertEqual(body_data, self.test_embeddings)

    @patch('embeddings.boto3.client')
    def test_save_embeddings_with_etag(self, mock_boto_client):
        """Test saving embeddings with ETag (conditional write)."""
        # Mock S3
        mock_s3 = MagicMock()
        mock_boto_client.return_value = mock_s3

        # Test
        store = EmbeddingStore(self.bucket_name)
        result = store.save_embeddings(self.test_embeddings, etag='abc123')

        # Verify
        self.assertTrue(result)

        # Check put_object was called with IfMatch
        call_kwargs = mock_s3.put_object.call_args[1]
        self.assertEqual(call_kwargs['IfMatch'], 'abc123')

    @patch('embeddings.boto3.client')
    def test_save_embeddings_precondition_failed(self, mock_boto_client):
        """Test save fails when ETag doesn't match (conflict)."""
        # Mock S3 PreconditionFailed error
        mock_s3 = MagicMock()
        mock_boto_client.return_value = mock_s3

        error_response = {'Error': {'Code': 'PreconditionFailed'}}
        mock_s3.put_object.side_effect = ClientError(error_response, 'PutObject')

        # Test
        store = EmbeddingStore(self.bucket_name)
        result = store.save_embeddings(self.test_embeddings, etag='old_etag')

        # Verify returns False on conflict
        self.assertFalse(result)

    @patch('embeddings.boto3.client')
    def test_save_embeddings_other_error(self, mock_boto_client):
        """Test save raises exception for non-conflict errors."""
        # Mock S3 other error
        mock_s3 = MagicMock()
        mock_boto_client.return_value = mock_s3

        error_response = {'Error': {'Code': 'AccessDenied'}}
        mock_s3.put_object.side_effect = ClientError(error_response, 'PutObject')

        # Test - should raise exception
        store = EmbeddingStore(self.bucket_name)
        with self.assertRaises(ClientError):
            store.save_embeddings(self.test_embeddings)

    @patch('embeddings.boto3.client')
    @patch('embeddings.time.sleep')  # Mock sleep to speed up tests
    def test_add_embeddings_success_first_try(self, mock_sleep, mock_boto_client):
        """Test adding embeddings succeeds on first attempt."""
        # Mock S3
        mock_s3 = MagicMock()
        mock_boto_client.return_value = mock_s3

        # Mock load_embeddings
        existing = {'recipe_1': [0.1, 0.2, 0.3]}
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(existing).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response

        # Test
        store = EmbeddingStore(self.bucket_name)
        new_embeddings = {'recipe_2': [0.4, 0.5, 0.6]}
        result = store.add_embeddings(new_embeddings)

        # Verify
        self.assertTrue(result)
        self.assertEqual(mock_s3.put_object.call_count, 1)
        mock_sleep.assert_not_called()  # No retries needed

    @patch('embeddings.boto3.client')
    @patch('embeddings.time.sleep')
    def test_add_embeddings_retries_on_conflict(self, mock_sleep, mock_boto_client):
        """Test retry logic when first save fails with conflict."""
        # Mock S3
        mock_s3 = MagicMock()
        mock_boto_client.return_value = mock_s3

        # Mock load_embeddings (called twice due to retry)
        existing = {'recipe_1': [0.1, 0.2, 0.3]}
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(existing).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response

        # First put_object fails, second succeeds
        error_response = {'Error': {'Code': 'PreconditionFailed'}}
        mock_s3.put_object.side_effect = [
            ClientError(error_response, 'PutObject'),
            MagicMock()  # Success on second attempt
        ]

        # Test
        store = EmbeddingStore(self.bucket_name)
        new_embeddings = {'recipe_2': [0.4, 0.5, 0.6]}
        result = store.add_embeddings(new_embeddings)

        # Verify
        self.assertTrue(result)
        self.assertEqual(mock_s3.put_object.call_count, 2)
        self.assertEqual(mock_s3.get_object.call_count, 2)
        mock_sleep.assert_called_once()  # Backoff after first failure

    @patch('embeddings.boto3.client')
    @patch('embeddings.time.sleep')
    def test_add_embeddings_max_retries_exceeded(self, mock_sleep, mock_boto_client):
        """Test failure after max retries exhausted."""
        # Mock S3
        mock_s3 = MagicMock()
        mock_boto_client.return_value = mock_s3

        # Mock load_embeddings
        existing = {'recipe_1': [0.1, 0.2, 0.3]}
        mock_response = {
            'Body': MagicMock(read=lambda: json.dumps(existing).encode()),
            'ETag': '"etag123"'
        }
        mock_s3.get_object.return_value = mock_response

        # All put_object attempts fail
        error_response = {'Error': {'Code': 'PreconditionFailed'}}
        mock_s3.put_object.side_effect = ClientError(error_response, 'PutObject')

        # Test
        store = EmbeddingStore(self.bucket_name)
        new_embeddings = {'recipe_2': [0.4, 0.5, 0.6]}
        result = store.add_embeddings(new_embeddings)

        # Verify
        self.assertFalse(result)
        self.assertEqual(mock_s3.put_object.call_count, EmbeddingStore.MAX_RETRIES)
        self.assertEqual(mock_sleep.call_count, EmbeddingStore.MAX_RETRIES - 1)


if __name__ == '__main__':
    unittest.main()
