"""
Integration tests for POST /recipe/{recipe_key}/image endpoint.

Tests the full flow of image selection and recipe update through the Lambda endpoint.
"""

import json
import pytest
from unittest.mock import patch

from lambda_function import handle_post_image_request


class TestPostImageEndpoint:
    """Tests for POST image update endpoint."""

    def test_successful_image_selection(self, s3_client, env_vars):
        """Test successfully selecting and uploading an image."""
        # Setup: Create initial recipe data
        combined_data = {
            "1": {
                "Title": "Test Recipe",
                "Ingredients": ["flour", "sugar"],
                "image_url": None,
                "image_search_results": [
                    "https://example.com/image1.jpg",
                    "https://example.com/image2.jpg",
                ]
            }
        }

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        # Create event
        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/selected-image.jpg"
            })
        }

        # Mock the image fetching
        with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
            mock_fetch.return_value = ("images/1.jpg", None, False)

            # Act
            response = handle_post_image_request(event, None)

        # Assert
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True
        assert body['recipe']['image_url'] == "https://example.com/selected-image.jpg"

        # Verify recipe updated in S3
        result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
        updated_data = json.loads(result['Body'].read())
        assert updated_data["1"]["image_url"] == "https://example.com/selected-image.jpg"

    def test_image_fetch_failure_with_fallback(self, s3_client, env_vars):
        """Test that endpoint succeeds when fallback image is used."""
        combined_data = {
            "1": {"Title": "Test Recipe", "image_url": None}
        }

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/bad-image.jpg"
            })
        }

        # Mock: Fetch fails but fallback succeeds
        with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
            mock_fetch.return_value = ("images/1.jpg", None, True)  # used_fallback=True

            response = handle_post_image_request(event, None)

        # Should still return 200 (fallback was used)
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True

    def test_image_fetch_failure(self, s3_client, env_vars):
        """Test error when image fetch and fallback both fail."""
        combined_data = {
            "1": {"Title": "Test Recipe"}
        }

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/image.jpg"
            })
        }

        # Mock: Both fetch and fallback fail
        with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
            mock_fetch.return_value = (None, "Failed to fetch and fallback not available", True)

            response = handle_post_image_request(event, None)

        # Should return 500
        assert response['statusCode'] == 500
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'Failed to process image' in body['error']

    def test_recipe_not_found(self, s3_client, env_vars):
        """Test error when recipe doesn't exist."""
        combined_data = {
            "1": {"Title": "Recipe 1"}
        }

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/999/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/image.jpg"
            })
        }

        with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
            mock_fetch.return_value = ("images/999.jpg", None, False)

            response = handle_post_image_request(event, None)

        # Should return 404
        assert response['statusCode'] == 404
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'not found' in body['error'].lower()

    def test_invalid_path_format(self, s3_client, env_vars):
        """Test invalid path format."""
        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1"  # Missing /image
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/image.jpg"
            })
        }

        response = handle_post_image_request(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'Invalid path format' in body['error']

    def test_missing_imageUrl(self, s3_client, env_vars):
        """Test error when imageUrl is missing from body."""
        combined_data = {"1": {"Title": "Recipe 1"}}

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({})  # No imageUrl
        }

        response = handle_post_image_request(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'imageUrl is required' in body['error']

    def test_empty_imageUrl(self, s3_client, env_vars):
        """Test error when imageUrl is empty."""
        combined_data = {"1": {"Title": "Recipe 1"}}

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({
                "imageUrl": ""
            })
        }

        response = handle_post_image_request(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['success'] is False

    def test_invalid_json_body(self, s3_client, env_vars):
        """Test error when body is invalid JSON."""
        combined_data = {"1": {"Title": "Recipe 1"}}

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": "invalid json {{"
        }

        response = handle_post_image_request(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'Invalid JSON' in body['error']

    def test_includes_cors_headers(self, s3_client, env_vars):
        """Test that response includes CORS headers."""
        combined_data = {"1": {"Title": "Recipe 1"}}

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/image.jpg"
            })
        }

        with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
            mock_fetch.return_value = ("images/1.jpg", None, False)

            response = handle_post_image_request(event, None)

        assert 'Access-Control-Allow-Origin' in response['headers']
        assert response['headers']['Access-Control-Allow-Origin'] == '*'

    def test_missing_s3_bucket_env_var(self):
        """Test that missing S3_BUCKET env var returns 500."""
        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/image.jpg"
            })
        }

        with patch.dict('os.environ', {}, clear=True):
            response = handle_post_image_request(event, None)

        assert response['statusCode'] == 500
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'S3_BUCKET' in body['error']

    def test_multiple_recipes_different_images(self, s3_client, env_vars):
        """Test updating images for different recipes."""
        combined_data = {
            "1": {"Title": "Recipe 1", "image_url": None},
            "2": {"Title": "Recipe 2", "image_url": None},
        }

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        # Update recipe 1
        event1 = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/image1.jpg"
            })
        }

        with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
            mock_fetch.return_value = ("images/1.jpg", None, False)
            response1 = handle_post_image_request(event1, None)

        assert response1['statusCode'] == 200

        # Update recipe 2
        event2 = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/2/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/image2.jpg"
            })
        }

        with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
            mock_fetch.return_value = ("images/2.jpg", None, False)
            response2 = handle_post_image_request(event2, None)

        assert response2['statusCode'] == 200

        # Verify both recipes updated
        result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
        updated_data = json.loads(result['Body'].read())
        assert updated_data["1"]["image_url"] == "https://example.com/image1.jpg"
        assert updated_data["2"]["image_url"] == "https://example.com/image2.jpg"

    def test_recipe_with_existing_image(self, s3_client, env_vars):
        """Test updating a recipe that already has an image."""
        combined_data = {
            "1": {
                "Title": "Recipe 1",
                "image_url": "https://example.com/old-image.jpg"
            }
        }

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/new-image.jpg"
            })
        }

        with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
            mock_fetch.return_value = ("images/1.jpg", None, False)
            response = handle_post_image_request(event, None)

        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['recipe']['image_url'] == "https://example.com/new-image.jpg"

    def test_recipe_returned_in_response(self, s3_client, env_vars):
        """Test that updated recipe is returned in response."""
        combined_data = {
            "1": {
                "Title": "Chocolate Cake",
                "Ingredients": ["flour", "sugar", "chocolate"],
                "image_url": None
            }
        }

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/cake.jpg"
            })
        }

        with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
            mock_fetch.return_value = ("images/1.jpg", None, False)
            response = handle_post_image_request(event, None)

        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['recipe']['Title'] == "Chocolate Cake"
        assert body['recipe']['image_url'] == "https://example.com/cake.jpg"
        assert "Ingredients" in body['recipe']

    def test_content_type_header(self, s3_client, env_vars):
        """Test that response has correct Content-Type."""
        combined_data = {"1": {"Title": "Recipe 1"}}

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/image.jpg"
            })
        }

        with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
            mock_fetch.return_value = ("images/1.jpg", None, False)
            response = handle_post_image_request(event, None)

        assert response['headers']['Content-Type'] == 'application/json'
