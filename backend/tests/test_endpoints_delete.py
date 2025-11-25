"""
Integration tests for DELETE /recipe/{recipe_key} endpoint.

Tests the full flow of deleting recipes through the Lambda endpoint.
"""

import json
import pytest
from unittest.mock import patch

# Import the lambda handler
from lambda_function import handle_delete_request


class TestDeleteEndpoint:
    """Tests for DELETE endpoint."""

    def test_successful_deletion(self, s3_client, env_vars):
        """Test successfully deleting a recipe through the endpoint."""
        # Setup: Create initial data in S3
        combined_data = {
            "1": {"Title": "Recipe 1"},
            "2": {"Title": "Recipe 2"},
        }
        embeddings = {
            "1": [0.1] * 1536,
            "2": [0.2] * 1536,
        }

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )
        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/recipe_embeddings.json",
            Body=json.dumps(embeddings)
        )

        # Create event
        event = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/1"
                }
            }
        }

        # Act
        response = handle_delete_request(event, None, recipe_key='1')

        # Assert
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True
        assert 'deleted successfully' in body['message']

        # Verify recipe removed
        result = s3_client.get_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json"
        )
        updated_data = json.loads(result['Body'].read())
        assert "1" not in updated_data
        assert "2" in updated_data

    def test_delete_missing_recipe_is_idempotent(self, s3_client, env_vars):
        """Test that deleting non-existent recipe returns 200 success (idempotent)."""
        # Setup: Create initial data
        combined_data = {"1": {"Title": "Recipe 1"}}
        embeddings = {"1": [0.1] * 1536}

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )
        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/recipe_embeddings.json",
            Body=json.dumps(embeddings)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/999"
                }
            }
        }

        # Act
        response = handle_delete_request(event, None, recipe_key='999')

        # Assert: Should return 200 (idempotent)
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True

    def test_delete_invalid_path_format(self, s3_client, env_vars):
        """Test that missing recipe_key returns 400."""
        event = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/"  # Missing recipe_key
                }
            }
        }

        response = handle_delete_request(event, None, recipe_key=None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'Missing recipe_key' in body['error']

    def test_delete_invalid_recipe_key_format(self, s3_client, env_vars):
        """Test that invalid recipe_key characters return 400."""
        event = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/recipe@key"  # Invalid character @
                }
            }
        }

        response = handle_delete_request(event, None, recipe_key='recipe@key')

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'Invalid recipe_key format' in body['error']

    def test_delete_alphanumeric_recipe_key(self, s3_client, env_vars):
        """Test that alphanumeric recipe keys work."""
        combined_data = {"recipe123": {"Title": "Test"}}
        embeddings = {"recipe123": [0.1] * 1536}

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )
        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/recipe_embeddings.json",
            Body=json.dumps(embeddings)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/recipe123"
                }
            }
        }

        response = handle_delete_request(event, None, recipe_key='recipe123')

        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True

    def test_delete_underscore_hyphen_recipe_key(self, s3_client, env_vars):
        """Test that recipe keys with underscores and hyphens work."""
        combined_data = {"my-recipe_1": {"Title": "Test"}}
        embeddings = {"my-recipe_1": [0.1] * 1536}

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )
        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/recipe_embeddings.json",
            Body=json.dumps(embeddings)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/my-recipe_1"
                }
            }
        }

        response = handle_delete_request(event, None, recipe_key='my-recipe_1')

        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True

    def test_delete_with_missing_combined_data_file(self, s3_client, env_vars):
        """Test deletion when combined_data.json doesn't exist."""
        # Only create embeddings
        embeddings = {"1": [0.1] * 1536}
        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/recipe_embeddings.json",
            Body=json.dumps(embeddings)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/1"
                }
            }
        }

        response = handle_delete_request(event, None, recipe_key='1')

        # Should still succeed
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True

    def test_delete_with_missing_embeddings_file(self, s3_client, env_vars):
        """Test deletion when recipe_embeddings.json doesn't exist."""
        # Only create combined_data
        combined_data = {"1": {"Title": "Recipe 1"}}
        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/1"
                }
            }
        }

        response = handle_delete_request(event, None, recipe_key='1')

        # Should still succeed
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True

    def test_delete_missing_s3_bucket_env_var(self):
        """Test that missing S3_BUCKET env var returns 500."""
        event = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/1"
                }
            }
        }

        # Unset S3_BUCKET
        with patch.dict('os.environ', {}, clear=True):
            response = handle_delete_request(event, None, recipe_key='1')

        assert response['statusCode'] == 500
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'S3_BUCKET' in body['error']

    def test_delete_multiple_recipes_sequentially(self, s3_client, env_vars):
        """Test deleting multiple recipes one by one."""
        combined_data = {
            "1": {"Title": "Recipe 1"},
            "2": {"Title": "Recipe 2"},
            "3": {"Title": "Recipe 3"},
        }
        embeddings = {
            "1": [0.1] * 1536,
            "2": [0.2] * 1536,
            "3": [0.3] * 1536,
        }

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )
        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/recipe_embeddings.json",
            Body=json.dumps(embeddings)
        )

        # Delete recipe 1
        event1 = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/1"
                }
            }
        }
        response1 = handle_delete_request(event1, None, recipe_key='1')
        assert response1['statusCode'] == 200

        # Delete recipe 2
        event2 = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/2"
                }
            }
        }
        response2 = handle_delete_request(event2, None, recipe_key='2')
        assert response2['statusCode'] == 200

        # Verify final state
        result = s3_client.get_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json"
        )
        final_data = json.loads(result['Body'].read())
        assert "1" not in final_data
        assert "2" not in final_data
        assert "3" in final_data

    def test_delete_response_content_type(self, s3_client, env_vars):
        """Test that response has correct Content-Type."""
        combined_data = {"1": {"Title": "Recipe 1"}}
        embeddings = {"1": [0.1] * 1536}

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )
        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/recipe_embeddings.json",
            Body=json.dumps(embeddings)
        )

        event = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/1"
                }
            }
        }

        response = handle_delete_request(event, None, recipe_key='1')

        assert response['headers']['Content-Type'] == 'application/json'
