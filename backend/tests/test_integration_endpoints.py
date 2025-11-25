"""
Integration tests for DELETE and POST image endpoints working together.

Tests full workflows combining recipe deletion and image selection.
"""

import json
import pytest
from unittest.mock import patch

from lambda_function import handle_delete_request, handle_post_image_request, lambda_handler


class TestIntegrationEndpoints:
    """Integration tests for DELETE and POST image endpoints."""

    def test_complete_workflow_select_then_delete(self, s3_client, env_vars, build_apigw_event):
        """Test complete workflow: select image, then delete recipe."""
        # Setup: Create recipe with image search results
        combined_data = {
            "1": {
                "Title": "Chocolate Cake",
                "Ingredients": ["chocolate", "flour"],
                "image_url": None,
                "image_search_results": [
                    "https://lh3.googleusercontent.com/cake1abc123def456",
                    "https://lh3.googleusercontent.com/cake2xyz789qrs012",
                ]
            }
        }
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

        # Step 1: User selects image
        select_event = build_apigw_event(
            method="POST",
            path="/recipe/1/image",
            path_params={"recipe_key": "1"},
            body={"imageUrl": "https://lh3.googleusercontent.com/cake1abc123def456"}
        )

        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
                patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/1.jpg", None)
            # Invoke directly via lambda_handler to test routing too
            select_response = lambda_handler(select_event, None)

        assert select_response['statusCode'] == 200
        # Check CORS headers are NOT present (API Gateway handles it)
        assert 'Access-Control-Allow-Origin' not in select_response.get('headers', {})

        body = json.loads(select_response['body'])
        assert body['recipe']['image_url'] == "https://lh3.googleusercontent.com/cake1abc123def456"

        # Step 2: User deletes recipe
        delete_event = build_apigw_event(
            method="DELETE",
            path="/recipe/1",
            path_params={"recipe_key": "1"}
        )

        # Invoke directly via lambda_handler
        delete_response = lambda_handler(delete_event, None)

        assert delete_response['statusCode'] == 200
        assert 'Access-Control-Allow-Origin' not in delete_response.get('headers', {})

        body = json.loads(delete_response['body'])
        assert body['success'] is True

        # Verify recipe is gone
        result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
        final_data = json.loads(result['Body'].read())
        assert "1" not in final_data

        # Verify embedding is gone
        result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/recipe_embeddings.json")
        final_embeddings = json.loads(result['Body'].read())
        assert "1" not in final_embeddings

    def test_missing_path_parameters(self, s3_client, env_vars, build_apigw_event):
        """Test missing path parameters return 400 error."""
        # DELETE without path parameter
        delete_event = build_apigw_event(
            method="DELETE",
            path="/recipe/1",
            path_params={} # Empty path parameters
        )

        response = lambda_handler(delete_event, None)
        assert response['statusCode'] == 400
        assert 'Missing recipe_key' in json.loads(response['body'])['error']

        # POST image without path parameter
        post_event = build_apigw_event(
            method="POST",
            path="/recipe/1/image",
            path_params={}, # Empty path parameters
            body={"imageUrl": "https://example.com/image.jpg"}
        )

        # Since routing depends on path params, this might fall through to regular POST
        # or fail if logic strictly checks path first.
        # In our implementation:
        # if '/image' in request_path and path_params.get('recipe_key'):
        #     return handle_post_image_request...
        # else:
        #     return handle_post_request...
        # So without recipe_key, it falls to handle_post_request (upload),
        # which will likely fail due to missing 'files' or 'body' structure

        response = lambda_handler(post_event, None)
        # handle_post_request expects 'files' in body, so it returns 400
        assert response['statusCode'] == 400

    @pytest.mark.parametrize("route_config", [
        {"method": "GET", "path": "/recipes", "params": {}},
        {"method": "POST", "path": "/recipe/upload", "params": {}, "body": {"files": []}}, # Should fail validation but route
        {"method": "DELETE", "path": "/recipe/test", "params": {"recipe_key": "test"}},
        {"method": "POST", "path": "/recipe/test/image", "params": {"recipe_key": "test"}, "body": {"imageUrl": "https://example.com"}},
    ])
    def test_routing_coverage(self, s3_client, env_vars, build_apigw_event, route_config):
        """Parametrized test to verify all routes are reachable."""
        # Ensure S3 bucket exists (fixture does this)

        event = build_apigw_event(
            method=route_config["method"],
            path=route_config["path"],
            path_params=route_config["params"],
            body=route_config.get("body")
        )

        # We just want to ensure it routes correctly, not necessarily succeeds
        # (e.g. DELETE might return 200/404/500 depending on S3 state, but not 404 from Lambda routing if correct)
        # Exception: handle_post_request (upload) returns 400 if empty body/files

        with patch('lambda_function.handle_get_request') as mock_get, \
             patch('lambda_function.handle_post_request') as mock_post, \
             patch('lambda_function.handle_delete_request') as mock_delete, \
             patch('lambda_function.handle_post_image_request') as mock_image:

            # Configure mocks to return success so we know they were called
            mock_response = {'statusCode': 200, 'body': '{}'}
            mock_get.return_value = mock_response
            mock_post.return_value = mock_response
            mock_delete.return_value = mock_response
            mock_image.return_value = mock_response

            lambda_handler(event, None)

            # Verify correct handler was called
            if route_config["method"] == "GET":
                mock_get.assert_called_once()
            elif route_config["method"] == "DELETE":
                mock_delete.assert_called_once()
            elif route_config["method"] == "POST" and "image" in route_config["path"]:
                mock_image.assert_called_once()
            elif route_config["method"] == "POST":
                mock_post.assert_called_once()

    def test_multiple_recipes_mixed_operations(self, s3_client, env_vars, build_apigw_event):
        """Test multiple recipes with mixed select/delete operations."""
        # Setup: Create 3 recipes with image search results
        combined_data = {
            "1": {
                "Title": "Recipe 1",
                "image_url": None,
                "image_search_results": ["https://lh3.googleusercontent.com/image1.jpg"]
            },
            "2": {"Title": "Recipe 2", "image_url": None},
            "3": {
                "Title": "Recipe 3",
                "image_url": None,
                "image_search_results": ["https://lh3.googleusercontent.com/image3.jpg"]
            },
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

        # Select image for recipe 1
        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
                patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/1.jpg", None)

            response_1 = handle_post_image_request(
                build_apigw_event("POST", "/recipe/1/image", {"recipe_key": "1"}, body={"imageUrl": "https://lh3.googleusercontent.com/image1.jpg"}),
                None,
                recipe_key="1"
            )

        assert response_1['statusCode'] == 200

        # Delete recipe 2
        response_2 = handle_delete_request(
            build_apigw_event("DELETE", "/recipe/2", {"recipe_key": "2"}),
            None,
            recipe_key="2"
        )
        assert response_2['statusCode'] == 200

        # Select image for recipe 3
        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
                patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/3.jpg", None)

            response_3 = handle_post_image_request(
                build_apigw_event("POST", "/recipe/3/image", {"recipe_key": "3"}, body={"imageUrl": "https://lh3.googleusercontent.com/image3.jpg"}),
                None,
                recipe_key="3"
            )

        assert response_3['statusCode'] == 200

        # Verify final state
        result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
        final_data = json.loads(result['Body'].read())

        assert "1" in final_data
        assert final_data["1"]["image_url"] == "https://lh3.googleusercontent.com/image1.jpg"
        assert "2" not in final_data
        assert "3" in final_data
        assert final_data["3"]["image_url"] == "https://lh3.googleusercontent.com/image3.jpg"

    def test_delete_then_try_select_image(self, s3_client, env_vars, build_apigw_event):
        """Test that selecting image for deleted recipe fails gracefully."""
        combined_data = {
            "1": {
                "Title": "Recipe 1",
                "image_url": None,
                "image_search_results": ["https://lh3.googleusercontent.com/image.jpg"]
            }
        }
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

        # Delete recipe first
        delete_response = handle_delete_request(
            build_apigw_event("DELETE", "/recipe/1", {"recipe_key": "1"}),
            None,
            recipe_key="1"
        )
        assert delete_response['statusCode'] == 200

        # Try to select image for deleted recipe
        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
                patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/1.jpg", None)

            select_response = handle_post_image_request(
                build_apigw_event("POST", "/recipe/1/image", {"recipe_key": "1"}, body={"imageUrl": "https://lh3.googleusercontent.com/image.jpg"}),
                None,
                recipe_key="1"
            )

        # Should fail with 404
        assert select_response['statusCode'] == 404
        body = json.loads(select_response['body'])
        assert body['success'] is False
        assert 'not found' in body['error'].lower()
