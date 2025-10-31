import unittest
from unittest.mock import MagicMock, patch, call, Mock
import json
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lambda_function import process_single_recipe, lambda_handler


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
    @patch('lambda_function.EmbeddingStore')
    @patch('lambda_function.EmbeddingGenerator')
    @patch('lambda_function.batch_to_s3_atomic')
    @patch('lambda_function.handlepdf')
    @patch('lambda_function.ocr')
    @patch('lambda_function.upload.upload_user_data')
    def test_lambda_handler_multi_file_format(
        self, mock_upload_user, mock_ocr, mock_pdf,
        mock_batch, mock_gen_class, mock_store_class, mock_boto
    ):
        """Test Lambda handler with new multi-file format including jobId."""
        # Mock environment
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket'}):
            # Mock services
            mock_store = MagicMock()
            mock_store.load_embeddings.return_value = ({}, None)
            mock_store.add_embeddings.return_value = True
            mock_store_class.return_value = mock_store

            mock_gen = MagicMock()
            mock_gen_class.return_value = mock_gen

            # Mock OCR extraction
            mock_ocr.extract_recipe_data.return_value = json.dumps(self.test_recipe)
            mock_ocr.parseJSON.return_value = json.dumps([self.test_recipe])

            # Mock batch upload
            mock_batch.return_value = ({'1': self.test_recipe}, ['2'], [])

            # Mock CloudWatch
            mock_cloudwatch = MagicMock()
            mock_boto.return_value = mock_cloudwatch

            # Test event with jobId
            event = {
                'files': [
                    {'base64': 'base64data', 'type': 'image'}
                ],
                'jobId': 'test-job-123'
            }

            # Test
            response = lambda_handler(event, None)

            # Verify
            self.assertEqual(response['statusCode'], 200)
            body = json.loads(response['body'])
            self.assertIn('jobId', body)
            self.assertEqual(body['jobId'], 'test-job-123')

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
    @patch('lambda_function.EmbeddingStore')
    @patch('lambda_function.EmbeddingGenerator')
    @patch('lambda_function.DuplicateDetector')
    @patch('lambda_function.batch_to_s3_atomic')
    @patch('lambda_function.ThreadPoolExecutor')
    @patch('lambda_function.as_completed')
    @patch('lambda_function.handlepdf')
    @patch('lambda_function.ocr')
    @patch('lambda_function.upload.upload_user_data')
    def test_lambda_handler_parallel_processing(
        self, mock_upload_user, mock_ocr, mock_pdf,
        mock_as_completed, mock_executor_class, mock_batch, mock_detector_class,
        mock_gen_class, mock_store_class, mock_boto
    ):
        """Test that Lambda handler uses ThreadPoolExecutor with 3 workers."""
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket'}):
            # Mock services
            mock_store = MagicMock()
            mock_store.load_embeddings.return_value = ({}, None)
            mock_store.add_embeddings.return_value = True
            mock_store_class.return_value = mock_store

            mock_gen_class.return_value = MagicMock()
            mock_detector_class.return_value = MagicMock()

            # Mock OCR
            mock_ocr.extract_recipe_data.return_value = json.dumps(self.test_recipe)
            mock_ocr.parseJSON.return_value = json.dumps([self.test_recipe])

            # Mock executor
            mock_executor = MagicMock()
            mock_future = MagicMock()
            mock_future.result.return_value = (self.test_recipe, self.test_embedding, self.test_search_results, None)
            mock_executor.submit.return_value = mock_future
            mock_executor.__enter__.return_value = mock_executor
            mock_executor_class.return_value = mock_executor

            # Mock as_completed to yield our mocked future
            mock_as_completed.return_value = [mock_future]

            # Mock batch upload
            mock_batch.return_value = ({'1': self.test_recipe}, ['2'], [])

            # Mock CloudWatch
            mock_cloudwatch = MagicMock()
            mock_boto.return_value = mock_cloudwatch

            # Test (use 'data' field as Lambda expects, not 'base64')
            event = {
                'files': [
                    {'data': 'base64data', 'type': 'image'}
                ],
                'jobId': 'test-job-123'
            }

            lambda_handler(event, None)

            # Verify ThreadPoolExecutor created with max_workers=3
            mock_executor_class.assert_called_once_with(max_workers=3)

    @patch('lambda_function.boto3.client')
    @patch('lambda_function.EmbeddingStore')
    @patch('lambda_function.EmbeddingGenerator')
    @patch('lambda_function.batch_to_s3_atomic')
    @patch('lambda_function.handlepdf')
    @patch('lambda_function.ocr')
    @patch('lambda_function.upload.upload_user_data')
    @patch('lambda_function.time.time')
    def test_lambda_handler_cloudwatch_metrics(
        self, mock_time, mock_upload_user, mock_ocr, mock_pdf,
        mock_batch, mock_gen_class, mock_store_class, mock_boto
    ):
        """Test that CloudWatch metrics are sent."""
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket'}):
            # Mock time for metrics
            mock_time.side_effect = [1000, 1060]  # 60 second execution

            # Mock services
            mock_store = MagicMock()
            mock_store.load_embeddings.return_value = ({}, None)
            mock_store.add_embeddings.return_value = True
            mock_store_class.return_value = mock_store

            mock_gen_class.return_value = MagicMock()

            # Mock OCR
            mock_ocr.extract_recipe_data.return_value = json.dumps(self.test_recipe)
            mock_ocr.parseJSON.return_value = json.dumps([self.test_recipe])

            # Mock batch upload
            mock_batch.return_value = ({'1': self.test_recipe}, ['2'], [])

            # Mock CloudWatch client
            mock_s3 = MagicMock()
            mock_cloudwatch = MagicMock()
            mock_boto.side_effect = lambda service: mock_cloudwatch if service == 'cloudwatch' else mock_s3

            # Test
            event = {
                'files': [{'base64': 'base64data', 'type': 'image'}],
                'jobId': 'test-job-123'
            }

            lambda_handler(event, None)

            # Verify CloudWatch put_metric_data was called
            self.assertTrue(mock_cloudwatch.put_metric_data.called)

    @patch('lambda_function.boto3.client')
    @patch('lambda_function.EmbeddingStore')
    @patch('lambda_function.EmbeddingGenerator')
    @patch('lambda_function.batch_to_s3_atomic')
    @patch('lambda_function.handlepdf')
    @patch('lambda_function.ocr')
    @patch('lambda_function.upload.upload_user_data')
    def test_lambda_handler_success_response(
        self, mock_upload_user, mock_ocr, mock_pdf,
        mock_batch, mock_gen_class, mock_store_class, mock_boto
    ):
        """Test Lambda handler returns correct response format."""
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket'}):
            # Mock services
            mock_store = MagicMock()
            mock_store.load_embeddings.return_value = ({}, None)
            mock_store.add_embeddings.return_value = True
            mock_store_class.return_value = mock_store

            mock_gen_class.return_value = MagicMock()

            # Mock OCR
            mock_ocr.extract_recipe_data.return_value = json.dumps(self.test_recipe)
            mock_ocr.parseJSON.return_value = json.dumps([self.test_recipe])

            # Mock batch upload
            mock_batch.return_value = ({'1': self.test_recipe}, ['2'], [])

            # Mock CloudWatch
            mock_cloudwatch = MagicMock()
            mock_boto.return_value = mock_cloudwatch

            # Test
            event = {
                'files': [{'base64': 'base64data', 'type': 'image'}],
                'jobId': 'test-job-456'
            }

            response = lambda_handler(event, None)

            # Verify response structure
            self.assertEqual(response['statusCode'], 200)
            body = json.loads(response['body'])

            # Check required fields
            self.assertIn('returnMessage', body)
            self.assertIn('successCount', body)
            self.assertIn('failCount', body)
            self.assertIn('jsonData', body)
            self.assertIn('newRecipeKeys', body)
            self.assertIn('errors', body)
            self.assertIn('jobId', body)
            self.assertEqual(body['jobId'], 'test-job-456')

    @patch('lambda_function.boto3.client')
    @patch('lambda_function.EmbeddingStore')
    @patch('lambda_function.EmbeddingGenerator')
    @patch('lambda_function.batch_to_s3_atomic')
    @patch('lambda_function.handlepdf')
    @patch('lambda_function.ocr')
    @patch('lambda_function.upload.upload_user_data')
    def test_lambda_handler_embedding_storage(
        self, mock_upload_user, mock_ocr, mock_pdf,
        mock_batch, mock_gen_class, mock_store_class, mock_boto
    ):
        """Test that embeddings are saved with correct recipe keys."""
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket'}):
            # Mock services
            mock_store = MagicMock()
            mock_store.load_embeddings.return_value = ({}, None)
            mock_store.add_embeddings.return_value = True
            mock_store_class.return_value = mock_store

            mock_gen_class.return_value = MagicMock()

            # Mock OCR
            mock_ocr.extract_recipe_data.return_value = json.dumps(self.test_recipe)
            mock_ocr.parseJSON.return_value = json.dumps([self.test_recipe])

            # Mock batch upload returning success keys
            mock_batch.return_value = ({'1': self.test_recipe}, ['2', '3'], [])

            # Mock CloudWatch
            mock_cloudwatch = MagicMock()
            mock_boto.return_value = mock_cloudwatch

            # Test
            event = {
                'files': [{'base64': 'base64data', 'type': 'image'}],
                'jobId': 'test-job-789'
            }

            lambda_handler(event, None)

            # Verify add_embeddings was called
            self.assertTrue(mock_store.add_embeddings.called)

    @patch('lambda_function.boto3.client')
    @patch('lambda_function.EmbeddingStore')
    @patch('lambda_function.EmbeddingGenerator')
    @patch('lambda_function.batch_to_s3_atomic')
    @patch('lambda_function.handlepdf')
    @patch('lambda_function.ocr')
    @patch('lambda_function.upload.upload_user_data')
    def test_lambda_handler_completion_flag(
        self, mock_upload_user, mock_ocr, mock_pdf,
        mock_batch, mock_gen_class, mock_store_class, mock_boto
    ):
        """Test that completion flag is written to S3."""
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket'}):
            # Mock services
            mock_store = MagicMock()
            mock_store.load_embeddings.return_value = ({}, None)
            mock_store.add_embeddings.return_value = True
            mock_store_class.return_value = mock_store

            mock_gen_class.return_value = MagicMock()

            # Mock OCR
            mock_ocr.extract_recipe_data.return_value = json.dumps(self.test_recipe)
            mock_ocr.parseJSON.return_value = json.dumps([self.test_recipe])

            # Mock batch upload
            mock_batch.return_value = ({'1': self.test_recipe}, ['2'], [])

            # Mock S3 and CloudWatch clients
            mock_s3 = MagicMock()
            mock_cloudwatch = MagicMock()
            mock_boto.side_effect = lambda service: mock_cloudwatch if service == 'cloudwatch' else mock_s3

            # Test
            event = {
                'files': [{'base64': 'base64data', 'type': 'image'}],
                'jobId': 'test-completion-flag'
            }

            lambda_handler(event, None)

            # Verify S3 put_object called for completion flag
            put_calls = [call for call in mock_s3.put_object.call_args_list
                        if 'upload-status/' in str(call)]
            self.assertGreater(len(put_calls), 0)

    @patch('lambda_function.boto3.client')
    @patch('lambda_function.EmbeddingStore')
    @patch('lambda_function.EmbeddingGenerator')
    @patch('lambda_function.batch_to_s3_atomic')
    @patch('lambda_function.handlepdf')
    @patch('lambda_function.ocr')
    @patch('lambda_function.upload.upload_user_data')
    def test_lambda_handler_completion_flag_error(
        self, mock_upload_user, mock_ocr, mock_pdf,
        mock_batch, mock_gen_class, mock_store_class, mock_boto
    ):
        """Test that Lambda doesn't fail if completion flag write fails."""
        with patch.dict('os.environ', {'S3_BUCKET': 'test-bucket'}):
            # Mock services
            mock_store = MagicMock()
            mock_store.load_embeddings.return_value = ({}, None)
            mock_store.add_embeddings.return_value = True
            mock_store_class.return_value = mock_store

            mock_gen_class.return_value = MagicMock()

            # Mock OCR
            mock_ocr.extract_recipe_data.return_value = json.dumps(self.test_recipe)
            mock_ocr.parseJSON.return_value = json.dumps([self.test_recipe])

            # Mock batch upload
            mock_batch.return_value = ({'1': self.test_recipe}, ['2'], [])

            # Mock S3 client that fails on put_object for completion flag
            mock_s3 = MagicMock()
            mock_cloudwatch = MagicMock()

            def selective_error(*args, **kwargs):
                if 'upload-status/' in str(kwargs.get('Key', '')):
                    raise Exception('S3 Error')
                return MagicMock()

            mock_s3.put_object.side_effect = selective_error
            mock_boto.side_effect = lambda service: mock_cloudwatch if service == 'cloudwatch' else mock_s3

            # Test
            event = {
                'files': [{'base64': 'base64data', 'type': 'image'}],
                'jobId': 'test-error-flag'
            }

            # Should not raise exception
            response = lambda_handler(event, None)

            # Verify Lambda still returns success
            self.assertEqual(response['statusCode'], 200)


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
            self.assertEqual(result['headers']['Cache-Control'], 'no-cache, no-store, must-revalidate')
            self.assertEqual(result['headers']['Pragma'], 'no-cache')
            self.assertEqual(result['headers']['Expires'], '0')
            self.assertIn('Access-Control-Allow-Origin', result['headers'])

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
