from lambda_function import process_single_recipe, lambda_handler
import unittest
from unittest.mock import MagicMock, patch, call, Mock
import json
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestLambdaFunction(unittest.TestCase):
    """Test cases for Lambda function with parallel processing."""

    def setUp(self):
        """Set up test fixtures."""
        self.test_recipe = {
            'Title': 'Test Recipe',
            'Ingredients': ['flour', 'sugar']
        }
        self.test_embedding = [0.1, 0.2, 0.3]
        # google_search_image returns List[str], not dict
        self.test_search_results = [
            'http://example.com/image1.jpg',
            'http://example.com/image2.jpg',
            'http://example.com/image3.jpg',
            'http://example.com/image4.jpg',
            'http://example.com/image5.jpg',
            'http://example.com/image6.jpg',
            'http://example.com/image7.jpg',
            'http://example.com/image8.jpg',
            'http://example.com/image9.jpg',
            'http://example.com/image10.jpg',
        ]

    @patch('lambda_function.si.google_search_image')
    def test_process_single_recipe_success(self, mock_search):
        """Test successful recipe processing."""
        # Mock embedding generator and duplicate detector
        mock_generator = MagicMock()
        mock_generator.generate_recipe_embedding.return_value = self.test_embedding

        mock_detector = MagicMock()
        mock_detector.is_duplicate.return_value = (False, None, 0.5)

        mock_search.return_value = self.test_search_results

        # Test
        recipe, embedding, search_results, error = process_single_recipe(
            self.test_recipe,
            mock_generator,
            mock_detector
        )

        # Verify
        self.assertEqual(recipe, self.test_recipe)
        self.assertEqual(embedding, self.test_embedding)
        # process_single_recipe returns first 9 of 10 search results (for 3x3 grid)
        self.assertEqual(len(search_results), 9)
        self.assertEqual(search_results, self.test_search_results[0:9])
        self.assertIsNone(error)

    @patch('lambda_function.si.google_search_image')
    def test_process_single_recipe_duplicate(self, mock_search):
        """Test recipe processing detects duplicate."""
        # Mock duplicate detected
        mock_generator = MagicMock()
        mock_generator.generate_recipe_embedding.return_value = self.test_embedding

        mock_detector = MagicMock()
        mock_detector.is_duplicate.return_value = (True, 'recipe_5', 0.92)

        # Test
        recipe, embedding, search_results, error = process_single_recipe(
            self.test_recipe,
            mock_generator,
            mock_detector
        )

        # Verify
        self.assertIsNone(recipe)
        self.assertIsNone(embedding)
        self.assertIsNone(search_results)
        self.assertIsNotNone(error)
        self.assertIn('Duplicate', error)
        self.assertIn('recipe_5', error)
        self.assertIn('0.92', error)

    @patch('lambda_function.si.google_search_image')
    def test_process_single_recipe_exception(self, mock_search):
        """Test recipe processing handles exceptions."""
        # Mock exception during embedding generation
        mock_generator = MagicMock()
        mock_generator.generate_recipe_embedding.side_effect = Exception('API Error')

        mock_detector = MagicMock()

        # Test
        recipe, embedding, search_results, error = process_single_recipe(
            self.test_recipe,
            mock_generator,
            mock_detector
        )

        # Verify error returned
        self.assertIsNone(recipe)
        self.assertIsNone(embedding)
        self.assertIsNone(search_results)
        self.assertIsNotNone(error)
        self.assertIn('Processing failed', error)

    @patch('lambda_function.boto3.client')
    def test_lambda_handler_multi_file_format(self, mock_boto):
        """Test Lambda handler returns 202 and invokes async processing."""
        # Mock environment
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket', 'FUNCTION_NAME': 'test-function'}):
            # Mock S3 and Lambda clients
            mock_s3_client = MagicMock()
            mock_lambda_client = MagicMock()

            def get_boto_client(service_name, **kwargs):
                if service_name == 's3':
                    return mock_s3_client
                elif service_name == 'lambda':
                    return mock_lambda_client
                return MagicMock()
            mock_boto.side_effect = get_boto_client

            # Test event with jobId
            event = {
                'files': [
                    {'data': 'base64data', 'type': 'image'}
                ],
                'jobId': 'test-job-123'
            }

            # Test
            response = lambda_handler(event, None)

            # Verify async response (202 Accepted)
            self.assertEqual(response['statusCode'], 202)
            body = json.loads(response['body'])
            self.assertIn('jobId', body)
            self.assertEqual(body['jobId'], 'test-job-123')
            self.assertEqual(body['status'], 'processing')

            # Verify Lambda was invoked async
            mock_lambda_client.invoke.assert_called_once()
            invoke_call = mock_lambda_client.invoke.call_args
            self.assertEqual(invoke_call.kwargs['InvocationType'], 'Event')

    @patch('lambda_function.boto3.client')
    @patch('lambda_function.EmbeddingStore')
    @patch('lambda_function.EmbeddingGenerator')
    def test_lambda_handler_no_files(self, mock_gen_class, mock_store_class, mock_boto):
        """Test Lambda handler with no files returns 400 error."""
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket'}):
            # Test empty event
            event = {}

            # Test
            response = lambda_handler(event, None)

            # Verify 400 error
            self.assertEqual(response['statusCode'], 400)
            body = json.loads(response['body'])
            self.assertIn('No files', body['returnMessage'])

    @patch('lambda_function.boto3.client')
    def test_lambda_handler_parallel_processing(self, mock_boto):
        """Test that handle_post_request invokes async processing (parallel handled in process_upload_files)."""
        # Note: Parallel processing now happens in process_upload_files, not handle_post_request
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket', 'FUNCTION_NAME': 'test-function'}):
            mock_s3_client = MagicMock()
            mock_lambda_client = MagicMock()

            def get_boto_client(service_name, **kwargs):
                if service_name == 's3':
                    return mock_s3_client
                elif service_name == 'lambda':
                    return mock_lambda_client
                return MagicMock()
            mock_boto.side_effect = get_boto_client

            event = {
                'files': [
                    {'data': 'base64data', 'type': 'image'}
                ],
                'jobId': 'test-job-123'
            }

            response = lambda_handler(event, None)

            # Verify async invocation
            self.assertEqual(response['statusCode'], 202)
            mock_lambda_client.invoke.assert_called_once()

    @patch('lambda_function.boto3.client')
    def test_lambda_handler_success_response(self, mock_boto):
        """Test Lambda handler returns correct async response format."""
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket', 'FUNCTION_NAME': 'test-function'}):
            mock_s3_client = MagicMock()
            mock_lambda_client = MagicMock()

            def get_boto_client(service_name, **kwargs):
                if service_name == 's3':
                    return mock_s3_client
                elif service_name == 'lambda':
                    return mock_lambda_client
                return MagicMock()
            mock_boto.side_effect = get_boto_client

            event = {
                'files': [{'data': 'base64data', 'type': 'image'}],
                'jobId': 'test-job-456'
            }

            response = lambda_handler(event, None)

            # Verify async response structure (202 Accepted)
            self.assertEqual(response['statusCode'], 202)
            body = json.loads(response['body'])

            # Check required fields for async response
            self.assertIn('jobId', body)
            self.assertIn('status', body)
            self.assertEqual(body['jobId'], 'test-job-456')
            self.assertEqual(body['status'], 'processing')

    @patch('lambda_function.boto3.client')
    def test_lambda_handler_embedding_storage(self, mock_boto):
        """Test that initial status is written to S3 (embeddings stored by process_upload_files)."""
        # Note: Embeddings are now stored by process_upload_files, not handle_post_request
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket', 'FUNCTION_NAME': 'test-function'}):
            mock_s3_client = MagicMock()
            mock_lambda_client = MagicMock()

            def get_boto_client(service_name, **kwargs):
                if service_name == 's3':
                    return mock_s3_client
                elif service_name == 'lambda':
                    return mock_lambda_client
                return MagicMock()
            mock_boto.side_effect = get_boto_client

            event = {
                'files': [{'data': 'base64data', 'type': 'image'}],
                'jobId': 'test-job-789'
            }

            lambda_handler(event, None)

            # Verify status file was written to S3
            put_calls = mock_s3_client.put_object.call_args_list
            status_calls = [c for c in put_calls if 'upload-status/' in str(c)]
            self.assertGreater(len(status_calls), 0)

    @patch('lambda_function.boto3.client')
    def test_lambda_handler_completion_flag(self, mock_boto):
        """Test that processing status is written to S3."""
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket', 'FUNCTION_NAME': 'test-function'}):
            mock_s3 = MagicMock()
            mock_lambda = MagicMock()

            def get_client(service_name, **kwargs):
                if service_name == 's3':
                    return mock_s3
                elif service_name == 'lambda':
                    return mock_lambda
                return MagicMock()
            mock_boto.side_effect = get_client

            event = {
                'files': [{'data': 'base64data', 'type': 'image'}],
                'jobId': 'test-completion-flag'
            }

            lambda_handler(event, None)

            # Verify S3 put_object called for status
            put_calls = [call for call in mock_s3.put_object.call_args_list
                         if 'upload-status/' in str(call)]
            self.assertGreater(len(put_calls), 0)

    @patch('lambda_function.boto3.client')
    def test_lambda_handler_completion_flag_error(self, mock_boto):
        """Test that Lambda doesn't fail if status write fails."""
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket', 'FUNCTION_NAME': 'test-function'}):
            mock_s3 = MagicMock()
            mock_lambda = MagicMock()

            # Make first S3 put fail but let Lambda invoke succeed
            put_call_count = [0]
            def selective_error(*args, **kwargs):
                put_call_count[0] += 1
                if put_call_count[0] == 1:  # First call (pending file)
                    raise Exception('S3 Error')
                return MagicMock()

            mock_s3.put_object.side_effect = selective_error

            def get_client(service_name, **kwargs):
                if service_name == 's3':
                    return mock_s3
                elif service_name == 'lambda':
                    return mock_lambda
                return MagicMock()
            mock_boto.side_effect = get_client

            event = {
                'files': [{'data': 'base64data', 'type': 'image'}],
                'jobId': 'test-error-flag'
            }

            response = lambda_handler(event, None)

            # Verify Lambda returns error (S3 save failed)
            self.assertEqual(response['statusCode'], 500)


class TestLambdaGetRequest(unittest.TestCase):
    """Test cases for GET request handling."""

    @patch('lambda_function.boto3.client')
    def test_get_request_success(self, mock_boto_client):
        """Test successful GET request returns JSON with cache headers."""
        # Arrange
        mock_s3 = Mock()
        mock_boto_client.return_value = mock_s3

        mock_body = Mock()
        mock_body.read.return_value = b'{"recipe-1": {"Title": "Test Recipe"}}'
        mock_s3.get_object.return_value = {'Body': mock_body}

        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket'}):
            from lambda_function import handle_get_request

            event = {
                'requestContext': {
                    'http': {
                        'method': 'GET'
                    }
                }
            }

            # Act
            result = handle_get_request(event, None)

            # Assert
            self.assertEqual(result['statusCode'], 200)
            self.assertEqual(result['headers']['Content-Type'], 'application/json')
            self.assertEqual(result['headers']['Cache-Control'],
                             'no-cache, no-store, must-revalidate')
            self.assertEqual(result['headers']['Pragma'], 'no-cache')
            self.assertEqual(result['headers']['Expires'], '0')
            # CORS headers now handled by API Gateway, not Lambda

            body = result['body']
            self.assertIn('recipe-1', body)
            self.assertIn('Test Recipe', body)

            # Verify S3 call
            mock_s3.get_object.assert_called_once_with(
                Bucket='test-bucket',
                Key='jsondata/combined_data.json'
            )

    @patch('lambda_function.boto3.client')
    def test_get_request_file_not_found(self, mock_boto_client):
        """Test GET request returns 404 when JSON file missing."""
        # Arrange
        mock_s3 = Mock()
        mock_boto_client.return_value = mock_s3

        from botocore.exceptions import ClientError
        error_response = {'Error': {'Code': 'NoSuchKey'}}
        mock_s3.get_object.side_effect = ClientError(error_response, 'GetObject')
        mock_s3.exceptions.NoSuchKey = ClientError

        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket'}):
            from lambda_function import handle_get_request

            event = {
                'requestContext': {
                    'http': {
                        'method': 'GET'
                    }
                }
            }

            # Act
            result = handle_get_request(event, None)

            # Assert
            self.assertEqual(result['statusCode'], 404)
            body = json.loads(result['body'])
            self.assertIn('error', body)
            self.assertIn('not found', body['error'].lower())

    @patch('lambda_function.boto3.client')
    def test_get_request_s3_error(self, mock_boto_client):
        """Test GET request returns 500 on S3 error."""
        # Arrange
        mock_s3 = Mock()
        mock_boto_client.return_value = mock_s3
        mock_s3.get_object.side_effect = Exception('S3 connection failed')

        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket'}):
            from lambda_function import handle_get_request

            event = {
                'requestContext': {
                    'http': {
                        'method': 'GET'
                    }
                }
            }

            # Act
            result = handle_get_request(event, None)

            # Assert
            self.assertEqual(result['statusCode'], 500)
            body = json.loads(result['body'])
            self.assertIn('error', body)

    def test_get_request_missing_bucket_env(self):
        """Test GET request returns 500 when S3_BUCKET not set."""
        # Arrange
        with patch.dict('os.environ', {}, clear=True):
            from lambda_function import handle_get_request

            event = {
                'requestContext': {
                    'http': {
                        'method': 'GET'
                    }
                }
            }

            # Act
            result = handle_get_request(event, None)

            # Assert
            self.assertEqual(result['statusCode'], 500)
            body = json.loads(result['body'])
            self.assertIn('S3_BUCKET', body['error'])


class TestLambdaRouting(unittest.TestCase):
    """Test cases for HTTP method routing."""

    @patch('lambda_function.handle_get_request')
    def test_routes_get_request(self, mock_get_handler):
        """Test lambda_handler routes GET to handle_get_request."""
        # Arrange
        mock_get_handler.return_value = {'statusCode': 200}

        event = {
            'requestContext': {
                'http': {
                    'method': 'GET'
                }
            }
        }

        # Act
        result = lambda_handler(event, None)

        # Assert
        mock_get_handler.assert_called_once_with(event, None)
        self.assertEqual(result['statusCode'], 200)

    @patch('lambda_function.handle_post_request')
    def test_routes_post_request(self, mock_post_handler):
        """Test lambda_handler routes POST to handle_post_request."""
        # Arrange
        mock_post_handler.return_value = {'statusCode': 200}

        event = {
            'requestContext': {
                'http': {
                    'method': 'POST'
                }
            },
            'files': []
        }

        # Act
        result = lambda_handler(event, None)

        # Assert
        mock_post_handler.assert_called_once_with(event, None)
        self.assertEqual(result['statusCode'], 200)

    @patch('lambda_function.handle_post_request')
    def test_defaults_to_post_when_method_missing(self, mock_post_handler):
        """Test lambda_handler defaults to POST for backwards compatibility."""
        # Arrange
        mock_post_handler.return_value = {'statusCode': 400}

        event = {
            'files': []  # No requestContext
        }

        # Act
        result = lambda_handler(event, None)

        # Assert
        mock_post_handler.assert_called_once_with(event, None)
        self.assertEqual(result['statusCode'], 400)


class TestLambdaPostRequest(unittest.TestCase):
    """Test cases for POST request handling (existing functionality)."""

    @patch('lambda_function.handle_post_request')
    def test_post_request_still_works(self, mock_post_handler):
        """Ensure POST upload logic still functions."""
        # Arrange
        mock_post_handler.return_value = {
            'statusCode': 200,
            'body': json.dumps({
                'returnMessage': '2 recipes added successfully',
                'successCount': 2,
                'failCount': 0
            })
        }

        event = {
            'files': [
                {'data': 'base64-image-data', 'type': 'image/jpeg'}
            ],
            'jobId': 'test-123'
        }

        # Act
        result = lambda_handler(event, None)

        # Assert
        self.assertEqual(result['statusCode'], 200)
        body = json.loads(result['body'])
        self.assertEqual(body['successCount'], 2)


if __name__ == '__main__':
    unittest.main()
