"""
Unit tests for recipe deletion functions.

Tests atomic deletion of recipes and embeddings from S3 with race condition handling.
"""

import json
import pytest
from unittest.mock import MagicMock, patch
from botocore.exceptions import ClientError

from recipe_deletion import (
    delete_recipe_from_combined_data,
    delete_embedding_from_store,
    delete_recipe_atomic,
    _rollback_combined_data
)


class TestDeleteRecipeFromCombinedData:
    """Tests for delete_recipe_from_combined_data function."""

    def test_delete_existing_recipe(self):
        """Test deleting a recipe that exists in the data."""
        json_data = {
            "1": {"Title": "Recipe 1", "Ingredients": ["flour"]},
            "2": {"Title": "Recipe 2", "Ingredients": ["sugar"]},
        }

        result = delete_recipe_from_combined_data("1", json_data)

        assert "1" not in result
        assert "2" in result
        assert len(result) == 1
        assert result["2"]["Title"] == "Recipe 2"

    def test_delete_missing_recipe_is_idempotent(self):
        """Test that deleting a non-existent recipe returns original data."""
        json_data = {
            "1": {"Title": "Recipe 1", "Ingredients": ["flour"]},
        }

        result = delete_recipe_from_combined_data("999", json_data)

        # Original data unchanged
        assert len(result) == 1
        assert "1" in result

    def test_delete_from_empty_data(self):
        """Test deleting from empty data structure."""
        json_data = {}

        result = delete_recipe_from_combined_data("1", json_data)

        assert result == {}

    def test_delete_last_recipe(self):
        """Test deleting the last recipe leaves empty data."""
        json_data = {
            "1": {"Title": "Recipe 1"},
        }

        result = delete_recipe_from_combined_data("1", json_data)

        assert result == {}

    def test_original_dict_not_mutated(self):
        """Test that function doesn't mutate the original dict."""
        json_data = {
            "1": {"Title": "Recipe 1"},
            "2": {"Title": "Recipe 2"},
        }

        result = delete_recipe_from_combined_data("1", json_data)

        # Original should be unchanged
        assert len(json_data) == 2
        assert "1" in json_data
        # Result should be modified
        assert len(result) == 1
        assert "1" not in result


class TestDeleteEmbeddingFromStore:
    """Tests for delete_embedding_from_store function."""

    def test_delete_existing_embedding(self):
        """Test deleting an embedding that exists."""
        embeddings = {
            "1": [0.1, 0.2, 0.3],
            "2": [0.4, 0.5, 0.6],
        }

        result = delete_embedding_from_store("1", embeddings)

        assert "1" not in result
        assert "2" in result
        assert len(result) == 1

    def test_delete_missing_embedding_is_idempotent(self):
        """Test that deleting non-existent embedding returns original data."""
        embeddings = {
            "1": [0.1, 0.2, 0.3],
        }

        result = delete_embedding_from_store("999", embeddings)

        assert len(result) == 1
        assert "1" in result

    def test_delete_from_empty_embeddings(self):
        """Test deleting from empty embeddings structure."""
        embeddings = {}

        result = delete_embedding_from_store("1", embeddings)

        assert result == {}

    def test_delete_last_embedding(self):
        """Test deleting the last embedding leaves empty store."""
        embeddings = {
            "1": [0.1, 0.2, 0.3],
        }

        result = delete_embedding_from_store("1", embeddings)

        assert result == {}

    def test_original_dict_not_mutated(self):
        """Test that function doesn't mutate the original dict."""
        embeddings = {
            "1": [0.1, 0.2, 0.3],
            "2": [0.4, 0.5, 0.6],
        }

        result = delete_embedding_from_store("1", embeddings)

        # Original should be unchanged
        assert len(embeddings) == 2
        assert "1" in embeddings
        # Result should be modified
        assert len(result) == 1
        assert "1" not in result


class TestDeleteRecipeAtomic:
    """Tests for delete_recipe_atomic function with S3 mocking."""

    def test_successful_deletion(self, s3_client, env_vars):
        """Test successfully deleting a recipe and its embedding."""
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

        # Act: Delete recipe 1
        success, error_msg = delete_recipe_atomic("1", s3_client, "test-bucket")

        # Assert
        assert success is True
        assert error_msg is None

        # Verify recipe removed from combined_data
        response = s3_client.get_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json"
        )
        updated_combined = json.loads(response['Body'].read())
        assert "1" not in updated_combined
        assert "2" in updated_combined

        # Verify embedding removed
        response = s3_client.get_object(
            Bucket="test-bucket",
            Key="jsondata/recipe_embeddings.json"
        )
        updated_embeddings = json.loads(response['Body'].read())
        assert "1" not in updated_embeddings
        assert "2" in updated_embeddings

    def test_delete_missing_recipe_is_idempotent(self, s3_client, env_vars):
        """Test that deleting non-existent recipe returns success (idempotent)."""
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

        # Act: Try to delete non-existent recipe
        success, error_msg = delete_recipe_atomic("999", s3_client, "test-bucket")

        # Assert: Should succeed (idempotent)
        assert success is True
        assert error_msg is None

    def test_delete_when_combined_data_missing(self, s3_client, env_vars):
        """Test deletion when combined_data.json doesn't exist yet."""
        # Setup: Only create embeddings
        embeddings = {"1": [0.1] * 1536}
        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/recipe_embeddings.json",
            Body=json.dumps(embeddings)
        )

        # Act: Delete recipe
        success, error_msg = delete_recipe_atomic("1", s3_client, "test-bucket")

        # Assert: Should still succeed
        assert success is True
        assert error_msg is None

    def test_delete_when_embeddings_missing(self, s3_client, env_vars):
        """Test deletion when recipe_embeddings.json doesn't exist yet."""
        # Setup: Only create combined_data
        combined_data = {"1": {"Title": "Recipe 1"}}
        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        # Act: Delete recipe
        success, error_msg = delete_recipe_atomic("1", s3_client, "test-bucket")

        # Assert: Should still succeed
        assert success is True
        assert error_msg is None

    def test_race_condition_with_retry(self, s3_client, env_vars):
        """Test race condition detection and retry logic."""
        # Setup initial data
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

        # Simulate race condition on first attempt
        call_count = [0]
        original_put_object = s3_client.put_object

        def put_object_with_race_condition(**kwargs):
            call_count[0] += 1
            # Fail on first call to combined_data (simulate race condition)
            if call_count[0] == 1 and 'combined_data' in kwargs['Key']:
                error_response = {'Error': {'Code': 'PreconditionFailed'}}
                raise ClientError(error_response, 'PutObject')
            # Success on retry
            return original_put_object(**kwargs)

        with patch.object(s3_client, 'put_object', side_effect=put_object_with_race_condition):
            success, error_msg = delete_recipe_atomic("1", s3_client, "test-bucket")

        # Should succeed after retry
        assert success is True
        assert error_msg is None

    def test_custom_s3_keys(self, s3_client, env_vars):
        """Test using custom S3 keys for combined_data and embeddings."""
        # Setup with custom keys
        custom_combined_key = "custom/recipes.json"
        custom_embeddings_key = "custom/vectors.json"

        combined_data = {"1": {"Title": "Recipe 1"}}
        embeddings = {"1": [0.1] * 1536}

        s3_client.put_object(
            Bucket="test-bucket",
            Key=custom_combined_key,
            Body=json.dumps(combined_data)
        )
        s3_client.put_object(
            Bucket="test-bucket",
            Key=custom_embeddings_key,
            Body=json.dumps(embeddings)
        )

        # Act: Delete with custom keys
        success, error_msg = delete_recipe_atomic(
            "1",
            s3_client,
            "test-bucket",
            combined_data_key=custom_combined_key,
            embeddings_key=custom_embeddings_key
        )

        # Assert
        assert success is True
        assert error_msg is None

        # Verify deletion in custom keys
        response = s3_client.get_object(Bucket="test-bucket", Key=custom_combined_key)
        updated_data = json.loads(response['Body'].read())
        assert "1" not in updated_data

    def test_s3_error_other_than_precondition(self, s3_client, env_vars):
        """Test handling of S3 errors other than race conditions."""
        combined_data = {"1": {"Title": "Recipe 1"}}

        s3_client.put_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json",
            Body=json.dumps(combined_data)
        )

        # Mock an access denied error
        with patch.object(s3_client, 'put_object') as mock_put:
            error_response = {'Error': {'Code': 'AccessDenied'}}
            mock_put.side_effect = ClientError(error_response, 'PutObject')

            success, error_msg = delete_recipe_atomic("1", s3_client, "test-bucket")

        # Should fail with error message
        assert success is False
        assert error_msg is not None
        assert "AccessDenied" in error_msg

    def test_delete_multiple_recipes(self, s3_client, env_vars):
        """Test deleting recipes one by one."""
        # Setup: Create multiple recipes
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

        # Delete recipe 2
        success, _ = delete_recipe_atomic("2", s3_client, "test-bucket")
        assert success is True

        # Verify state after first deletion
        response = s3_client.get_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json"
        )
        data = json.loads(response['Body'].read())
        assert "1" in data
        assert "2" not in data
        assert "3" in data

        # Delete recipe 1
        success, _ = delete_recipe_atomic("1", s3_client, "test-bucket")
        assert success is True

        # Verify final state
        response = s3_client.get_object(
            Bucket="test-bucket",
            Key="jsondata/combined_data.json"
        )
        data = json.loads(response['Body'].read())
        assert "1" not in data
        assert "3" in data

    def test_rollback_on_embeddings_failure(self):
        """Test that combined_data is restored when embeddings write fails."""
        # Setup mock S3 client
        mock_client = MagicMock()

        combined_data = {
            "1": {"Title": "Recipe 1"},
            "2": {"Title": "Recipe 2"},
        }
        embeddings = {
            "1": [0.1] * 10,
            "2": [0.2] * 10,
        }

        # Track all put_object calls to verify rollback
        put_calls = []

        def mock_get_object(Bucket, Key):
            body = MagicMock()
            if 'combined_data' in Key:
                body.read.return_value = json.dumps(combined_data).encode()
            else:
                body.read.return_value = json.dumps(embeddings).encode()
            return {'Body': body, 'ETag': '"etag123"'}

        def mock_put_object(**kwargs):
            put_calls.append(kwargs)
            if 'embeddings' in kwargs['Key']:
                # Embeddings write always fails
                error_response = {'Error': {'Code': 'PreconditionFailed'}}
                raise ClientError(error_response, 'PutObject')

        mock_client.get_object.side_effect = mock_get_object
        mock_client.put_object.side_effect = mock_put_object

        success, error_msg = delete_recipe_atomic("1", mock_client, "test-bucket")

        # Should fail since embeddings write failed on all retries
        assert success is False
        assert error_msg is not None

        # Verify rollback was attempted: there should be a combined_data write
        # with recipe removed, then a rollback write restoring the recipe
        combined_puts = [c for c in put_calls if 'combined_data' in c['Key']]
        assert len(combined_puts) >= 2, f"Expected at least 2 combined_data puts (delete + rollback), got {len(combined_puts)}"

        # First combined_data put should have recipe "1" removed
        first_put_data = json.loads(combined_puts[0]['Body'])
        assert "1" not in first_put_data
        assert "2" in first_put_data

        # Rollback put should restore recipe "1"
        rollback_put_data = json.loads(combined_puts[1]['Body'])
        assert "1" in rollback_put_data

    def test_rollback_failure_logging(self):
        """Test that rollback failure is logged when embeddings write and rollback both fail."""
        mock_client = MagicMock()

        combined_data = {
            "1": {"Title": "Recipe 1"},
        }
        embeddings = {
            "1": [0.1] * 10,
        }

        put_calls = []

        def mock_get_object(Bucket, Key):
            body = MagicMock()
            if 'combined_data' in Key:
                body.read.return_value = json.dumps(combined_data).encode()
            else:
                body.read.return_value = json.dumps(embeddings).encode()
            return {'Body': body, 'ETag': '"etag123"'}

        def mock_put_object(**kwargs):
            put_calls.append(kwargs)
            # Let the initial combined_data write succeed
            if 'combined_data' in kwargs['Key'] and len([c for c in put_calls if 'combined_data' in c['Key']]) == 1:
                return {}
            # Embeddings write fails, triggering rollback
            if 'embeddings' in kwargs['Key']:
                error_response = {'Error': {'Code': 'AccessDenied'}}
                raise ClientError(error_response, 'PutObject')
            # Rollback write also fails
            if 'combined_data' in kwargs['Key']:
                error_response = {'Error': {'Code': 'AccessDenied'}}
                raise ClientError(error_response, 'PutObject')
            return {}

        mock_client.get_object.side_effect = mock_get_object
        mock_client.put_object.side_effect = mock_put_object

        # Should not raise, should return (False, error_message)
        with patch('recipe_deletion.log') as mock_log:
            success, error_msg = delete_recipe_atomic("1", mock_client, "test-bucket")

            assert success is False
            assert error_msg is not None

            # Verify combined_data write succeeded, then embeddings failed, then rollback attempted
            combined_puts = [c for c in put_calls if 'combined_data' in c['Key']]
            embeddings_puts = [c for c in put_calls if 'embeddings' in c['Key']]
            assert len(combined_puts) >= 2, f"Expected at least 2 combined_data puts (write + rollback), got {len(combined_puts)}"
            assert len(embeddings_puts) >= 1, f"Expected at least 1 embeddings put, got {len(embeddings_puts)}"

            # Verify the rollback-specific error message from _rollback_combined_data
            assert mock_log.error.called, "Expected log.error to be called on rollback failure"
            error_calls = [str(call) for call in mock_log.error.call_args_list]
            assert any('CRITICAL: Rollback failed - manual recovery needed' in call for call in error_calls), \
                f"Expected 'CRITICAL: Rollback failed - manual recovery needed' in error log calls, got: {error_calls}"
