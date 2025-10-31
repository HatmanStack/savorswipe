"""
Integration tests for DELETE and POST image endpoints working together.

Tests full workflows combining recipe deletion and image selection.
"""

import json
import pytest
from unittest.mock import patch

from lambda_function import handle_delete_request, handle_post_image_request


class TestIntegrationEndpoints:
    """Integration tests for DELETE and POST image endpoints."""

    def test_complete_workflow_select_then_delete(self, s3_client, env_vars):
        """Test complete workflow: select image, then delete recipe."""
        # Setup: Create recipe with image search results
        combined_data = {
            "1": {
                "Title": "Chocolate Cake",
                "Ingredients": ["chocolate", "flour"],
                "image_url": None,
                "image_search_results": [
                    "https://example.com/cake1.jpg",
                    "https://example.com/cake2.jpg",
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
        select_event = {
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/recipe/1/image"
                }
            },
            "body": json.dumps({
                "imageUrl": "https://example.com/cake1.jpg"
            })
        }

        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
             patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/1.jpg", None)
            select_response = handle_post_image_request(select_event, None)

        assert select_response['statusCode'] == 200
        body = json.loads(select_response['body'])
        assert body['recipe']['image_url'] == "https://example.com/cake1.jpg"

        # Step 2: User deletes recipe
        delete_event = {
            "requestContext": {
                "http": {
                    "method": "DELETE",
                    "path": "/recipe/1"
                }
            }
        }

        delete_response = handle_delete_request(delete_event, None)

        assert delete_response['statusCode'] == 200
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

    def test_multiple_recipes_mixed_operations(self, s3_client, env_vars):
        """Test multiple recipes with mixed select/delete operations."""
        # Setup: Create 3 recipes
        combined_data = {
            "1": {"Title": "Recipe 1", "image_url": None},
            "2": {"Title": "Recipe 2", "image_url": None},
            "3": {"Title": "Recipe 3", "image_url": None},
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

            select_event_1 = {
                "requestContext": {
                    "http": {"method": "POST", "path": "/recipe/1/image"}
                },
                "body": json.dumps({"imageUrl": "https://example.com/image1.jpg"})
            }
            response_1 = handle_post_image_request(select_event_1, None)

        assert response_1['statusCode'] == 200

        # Delete recipe 2
        delete_event_2 = {
            "requestContext": {
                "http": {"method": "DELETE", "path": "/recipe/2"}
            }
        }
        response_2 = handle_delete_request(delete_event_2, None)
        assert response_2['statusCode'] == 200

        # Select image for recipe 3
        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
             patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/3.jpg", None)

            select_event_3 = {
                "requestContext": {
                    "http": {"method": "POST", "path": "/recipe/3/image"}
                },
                "body": json.dumps({"imageUrl": "https://example.com/image3.jpg"})
            }
            response_3 = handle_post_image_request(select_event_3, None)

        assert response_3['statusCode'] == 200

        # Verify final state
        result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
        final_data = json.loads(result['Body'].read())

        assert "1" in final_data
        assert final_data["1"]["image_url"] == "https://example.com/image1.jpg"
        assert "2" not in final_data
        assert "3" in final_data
        assert final_data["3"]["image_url"] == "https://example.com/image3.jpg"

    def test_delete_then_try_select_image(self, s3_client, env_vars):
        """Test that selecting image for deleted recipe fails gracefully."""
        combined_data = {
            "1": {"Title": "Recipe 1", "image_url": None}
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
        delete_event = {
            "requestContext": {
                "http": {"method": "DELETE", "path": "/recipe/1"}
            }
        }
        delete_response = handle_delete_request(delete_event, None)
        assert delete_response['statusCode'] == 200

        # Try to select image for deleted recipe
        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
             patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/1.jpg", None)

            select_event = {
                "requestContext": {
                    "http": {"method": "POST", "path": "/recipe/1/image"}
                },
                "body": json.dumps({"imageUrl": "https://example.com/image.jpg"})
            }
            select_response = handle_post_image_request(select_event, None)

        # Should fail with 404
        assert select_response['statusCode'] == 404
        body = json.loads(select_response['body'])
        assert body['success'] is False
        assert 'not found' in body['error'].lower()

    def test_select_image_overwrites_previous(self, s3_client, env_vars):
        """Test that selecting new image overwrites previous selection."""
        combined_data = {
            "1": {
                "Title": "Recipe",
                "image_url": "https://example.com/old.jpg"
            }
        }

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        # Select first image
        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
             patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/1.jpg", None)

            select_event_1 = {
                "requestContext": {
                    "http": {"method": "POST", "path": "/recipe/1/image"}
                },
                "body": json.dumps({"imageUrl": "https://example.com/first.jpg"})
            }
            response_1 = handle_post_image_request(select_event_1, None)

        assert response_1['statusCode'] == 200

        # Select second image (should overwrite)
        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
             patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/1.jpg", None)

            select_event_2 = {
                "requestContext": {
                    "http": {"method": "POST", "path": "/recipe/1/image"}
                },
                "body": json.dumps({"imageUrl": "https://example.com/second.jpg"})
            }
            response_2 = handle_post_image_request(select_event_2, None)

        assert response_2['statusCode'] == 200

        # Verify second image was stored
        result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
        final_data = json.loads(result['Body'].read())
        assert final_data["1"]["image_url"] == "https://example.com/second.jpg"

    def test_concurrent_selects_last_wins(self, s3_client, env_vars):
        """Test that concurrent image selections result in last one winning."""
        combined_data = {"1": {"Title": "Recipe", "image_url": None}}

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        # Simulate concurrent selects
        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
             patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/1.jpg", None)

            # First select
            event_1 = {
                "requestContext": {
                    "http": {"method": "POST", "path": "/recipe/1/image"}
                },
                "body": json.dumps({"imageUrl": "https://example.com/image1.jpg"})
            }
            response_1 = handle_post_image_request(event_1, None)
            assert response_1['statusCode'] == 200

            # Second select (should overwrite)
            event_2 = {
                "requestContext": {
                    "http": {"method": "POST", "path": "/recipe/1/image"}
                },
                "body": json.dumps({"imageUrl": "https://example.com/image2.jpg"})
            }
            response_2 = handle_post_image_request(event_2, None)
            assert response_2['statusCode'] == 200

        # Verify last one won
        result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
        data = json.loads(result['Body'].read())
        assert data["1"]["image_url"] == "https://example.com/image2.jpg"

    def test_delete_nonexistent_then_select_existing(self, s3_client, env_vars):
        """Test idempotent delete followed by valid select."""
        combined_data = {
            "1": {"Title": "Recipe 1", "image_url": None}
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

        # Delete non-existent recipe (idempotent)
        delete_event = {
            "requestContext": {
                "http": {"method": "DELETE", "path": "/recipe/999"}
            }
        }
        delete_response = handle_delete_request(delete_event, None)
        assert delete_response['statusCode'] == 200

        # Select image for existing recipe (should still work)
        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
             patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/1.jpg", None)

            select_event = {
                "requestContext": {
                    "http": {"method": "POST", "path": "/recipe/1/image"}
                },
                "body": json.dumps({"imageUrl": "https://example.com/image.jpg"})
            }
            select_response = handle_post_image_request(select_event, None)

        assert select_response['statusCode'] == 200

    def test_recipe_data_consistency_after_operations(self, s3_client, env_vars):
        """Test that recipe data remains consistent after multiple operations."""
        combined_data = {
            "1": {
                "Title": "Cake",
                "Ingredients": ["flour", "sugar"],
                "Directions": ["Mix", "Bake"],
                "image_url": None,
                "Type": "dessert"
            }
        }

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        # Select image
        with patch('lambda_function.fetch_image_from_url') as mock_fetch_img, \
             patch('lambda_function.upload_image_to_s3') as mock_upload:
            mock_fetch_img.return_value = (b'fake image data', 'image/jpeg')
            mock_upload.return_value = ("images/1.jpg", None)

            select_event = {
                "requestContext": {
                    "http": {"method": "POST", "path": "/recipe/1/image"}
                },
                "body": json.dumps({"imageUrl": "https://example.com/cake.jpg"})
            }
            select_response = handle_post_image_request(select_event, None)

        assert select_response['statusCode'] == 200

        # Verify all original data is preserved
        result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
        final_data = json.loads(result['Body'].read())
        recipe = final_data["1"]

        assert recipe["Title"] == "Cake"
        assert recipe["Ingredients"] == ["flour", "sugar"]
        assert recipe["Directions"] == ["Mix", "Bake"]
        assert recipe["Type"] == "dessert"
        assert recipe["image_url"] == "https://example.com/cake.jpg"
