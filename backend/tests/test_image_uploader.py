"""
Unit tests for image fetching and S3 upload functions.

Tests image fetching from URLs, fallback image loading, and S3 uploads.
"""

import json
import os
import pytest
import requests
import requests_mock
from unittest.mock import patch, MagicMock
from botocore.exceptions import ClientError

from image_uploader import (
    fetch_image_from_url,
    upload_image_to_s3
)


class TestFetchImageFromUrl:
    """Tests for fetch_image_from_url function."""

    def test_successful_fetch(self, requests_mock):
        """Test successfully fetching an image."""
        image_data = b'fake image data'
        requests_mock.get(
            'https://example.com/image.jpg',
            content=image_data,
            headers={'Content-Type': 'image/jpeg'}
        )

        result, content_type = fetch_image_from_url('https://example.com/image.jpg')

        assert result == image_data
        assert 'image' in content_type.lower()

    def test_fetch_with_png_content_type(self, requests_mock):
        """Test fetching PNG images."""
        image_data = b'fake png data'
        requests_mock.get(
            'https://example.com/image.png',
            content=image_data,
            headers={'Content-Type': 'image/png'}
        )

        result, content_type = fetch_image_from_url('https://example.com/image.png')

        assert result == image_data
        assert content_type == 'image/png'

    def test_fetch_non_200_status(self, requests_mock):
        """Test handling of non-200 HTTP responses."""
        requests_mock.get(
            'https://example.com/missing.jpg',
            status_code=404
        )

        result, content_type = fetch_image_from_url('https://example.com/missing.jpg')

        assert result is None
        assert content_type is None

    def test_fetch_invalid_content_type(self, requests_mock):
        """Test rejection of non-image content types."""
        requests_mock.get(
            'https://example.com/notanimage',
            content=b'html content',
            headers={'Content-Type': 'text/html'}
        )

        result, content_type = fetch_image_from_url('https://example.com/notanimage')

        assert result is None
        assert content_type is None

    def test_fetch_timeout(self, requests_mock):
        """Test handling of request timeout."""
        requests_mock.get(
            'https://example.com/slow.jpg',
            exc=requests.exceptions.Timeout()
        )

        result, content_type = fetch_image_from_url('https://example.com/slow.jpg', timeout=1)

        assert result is None
        assert content_type is None

    def test_fetch_connection_error(self, requests_mock):
        """Test handling of connection errors."""
        requests_mock.get(
            'https://example.com/error.jpg',
            exc=requests.exceptions.ConnectionError()
        )

        result, content_type = fetch_image_from_url('https://example.com/error.jpg')

        assert result is None
        assert content_type is None

    def test_fetch_empty_url(self):
        """Test handling of empty URL."""
        result, content_type = fetch_image_from_url('')

        assert result is None
        assert content_type is None

    def test_fetch_none_url(self):
        """Test handling of None URL."""
        result, content_type = fetch_image_from_url(None)

        assert result is None
        assert content_type is None

    def test_fetch_with_custom_timeout(self, requests_mock):
        """Test custom timeout parameter."""
        image_data = b'image'
        requests_mock.get(
            'https://example.com/image.jpg',
            content=image_data,
            headers={'Content-Type': 'image/jpeg'}
        )

        result, _ = fetch_image_from_url('https://example.com/image.jpg', timeout=30)

        assert result == image_data

    def test_fetch_with_browser_headers(self, requests_mock):
        """Test that fetch includes browser-like headers."""
        image_data = b'image'
        requests_mock.get(
            'https://example.com/image.jpg',
            content=image_data,
            headers={'Content-Type': 'image/jpeg'}
        )

        fetch_image_from_url('https://example.com/image.jpg')

        # Verify request was made with User-Agent header
        assert len(requests_mock.request_history) > 0
        request = requests_mock.request_history[0]
        assert 'User-Agent' in request.headers


class TestUploadImageToS3:
    """Tests for upload_image_to_s3 function."""

    @pytest.fixture(autouse=True)
    def mock_pil_conversion(self, monkeypatch):
        """Mock PIL Image conversion to just return the input bytes."""
        from unittest.mock import MagicMock
        mock_image = MagicMock()
        mock_bytes_io = MagicMock()
        mock_bytes_io.getvalue.return_value = b'test image data'

        def mock_save(self, file_obj, format=None, **params):
            # Simulate saving by writing test data
            file_obj.write(b'converted_jpeg_data')
            return None

        mock_image.convert.return_value = mock_image
        mock_image.save = lambda *args, **kwargs: mock_save(mock_image, *args, **kwargs)

        def mock_open(*args, **kwargs):
            return mock_image

        monkeypatch.setattr('image_uploader.Image.open', mock_open)

    def test_successful_upload(self, s3_client, env_vars):
        """Test successfully uploading an image to S3."""
        image_bytes = b'test image data'

        s3_path, error_msg = upload_image_to_s3(
            "test_recipe",
            image_bytes,
            s3_client,
            "test-bucket"
        )

        assert s3_path == "images/test_recipe.jpg"
        assert error_msg is None

        # Verify image was uploaded
        response = s3_client.get_object(Bucket="test-bucket", Key="images/test_recipe.jpg")
        assert len(response['Body'].read()) > 0  # Image converted to JPEG

    def test_upload_with_empty_image_bytes(self, s3_client, env_vars):
        """Test uploading empty image bytes."""
        s3_path, error_msg = upload_image_to_s3(
            "test_recipe",
            b'',
            s3_client,
            "test-bucket"
        )

        assert s3_path is None
        assert error_msg is not None

    def test_upload_with_none_image_bytes(self, s3_client, env_vars):
        """Test uploading None as image bytes."""
        s3_path, error_msg = upload_image_to_s3(
            "test_recipe",
            None,
            s3_client,
            "test-bucket"
        )

        assert s3_path is None
        assert error_msg is not None

    def test_upload_s3_error(self, s3_client, env_vars):
        """Test handling of S3 errors."""
        image_bytes = b'test image'

        with patch.object(s3_client, 'put_object') as mock_put:
            error_response = {'Error': {'Code': 'AccessDenied'}}
            mock_put.side_effect = ClientError(error_response, 'PutObject')

            s3_path, error_msg = upload_image_to_s3(
                "test_recipe",
                image_bytes,
                s3_client,
                "test-bucket"
            )

        assert s3_path is None
        assert 'AccessDenied' in error_msg

    def test_upload_different_recipe_keys(self, s3_client, env_vars):
        """Test uploading images for different recipe keys."""
        image_bytes = b'test image'

        # Upload for recipe 1
        s3_path1, _ = upload_image_to_s3("recipe_1", image_bytes, s3_client, "test-bucket")
        assert s3_path1 == "images/recipe_1.jpg"

        # Upload for recipe 2
        s3_path2, _ = upload_image_to_s3("recipe_2", image_bytes, s3_client, "test-bucket")
        assert s3_path2 == "images/recipe_2.jpg"

        # Verify both images exist
        result1 = s3_client.get_object(Bucket="test-bucket", Key="images/recipe_1.jpg")
        assert len(result1['Body'].read()) > 0  # Image converted to JPEG

        result2 = s3_client.get_object(Bucket="test-bucket", Key="images/recipe_2.jpg")
        assert len(result2['Body'].read()) > 0  # Image converted to JPEG

    def test_upload_content_type(self, s3_client, env_vars):
        """Test that upload uses correct content-type."""
        image_bytes = b'test image'

        with patch.object(s3_client, 'put_object', wraps=s3_client.put_object) as mock_put:
            upload_image_to_s3("recipe", image_bytes, s3_client, "test-bucket")

            # Verify ContentType was set to image/jpeg
            call_kwargs = mock_put.call_args[1]
            assert call_kwargs['ContentType'] == 'image/jpeg'

    def test_upload_race_condition_retry(self, s3_client, env_vars):
        """Test retry logic on race condition."""
        image_bytes = b'test image'
        call_count = [0]
        original_put = s3_client.put_object

        def put_object_with_race_condition(**kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                # Fail on first call with race condition
                error_response = {'Error': {'Code': 'PreconditionFailed'}}
                raise ClientError(error_response, 'PutObject')
            # Success on retry - call the original S3 method
            return original_put(**kwargs)

        with patch.object(s3_client, 'put_object', side_effect=put_object_with_race_condition):
            s3_path, error_msg = upload_image_to_s3(
                "recipe",
                image_bytes,
                s3_client,
                "test-bucket",
                max_retries=3
            )

        # Should succeed after retry
        assert s3_path == "images/recipe.jpg"
        assert error_msg is None
        assert call_count[0] == 2  # One failure, one success

    def test_upload_max_retries_exceeded(self, s3_client, env_vars):
        """Test handling when max retries exceeded."""
        image_bytes = b'test image'

        with patch.object(s3_client, 'put_object') as mock_put:
            error_response = {'Error': {'Code': 'PreconditionFailed'}}
            mock_put.side_effect = ClientError(error_response, 'PutObject')

            s3_path, error_msg = upload_image_to_s3(
                "recipe",
                image_bytes,
                s3_client,
                "test-bucket",
                max_retries=3
            )

        assert s3_path is None
        assert 'max retries exceeded' in error_msg.lower()
