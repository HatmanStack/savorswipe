"""
Pytest configuration and shared fixtures for backend tests.

Provides mocking infrastructure for:
- AWS S3 (using moto)
- Google Custom Search API
- OpenAI embedding generation
- Recipe duplicate detection
"""

import os
import json
import pytest
from unittest.mock import MagicMock, patch
from moto import mock_aws
import boto3


@pytest.fixture
def aws_credentials():
    """Mock AWS credentials for testing."""
    with patch.dict(
        os.environ,
        {
            "AWS_ACCESS_KEY_ID": "testing",
            "AWS_SECRET_ACCESS_KEY": "testing",
            "AWS_SECURITY_TOKEN": "testing",
            "AWS_SESSION_TOKEN": "testing",
            "AWS_DEFAULT_REGION": "us-east-1",
        },
    ):
        yield


@pytest.fixture
def s3_bucket(aws_credentials):
    """Create a mock S3 bucket for testing."""
    with mock_aws():
        conn = boto3.resource("s3", region_name="us-east-1")
        conn.create_bucket(Bucket="test-bucket")
        yield conn


@pytest.fixture
def s3_client(s3_bucket):
    """Get mock S3 client for testing."""
    return boto3.client("s3", region_name="us-east-1")


@pytest.fixture
def mock_embedding_generator():
    """Mock embedding generator for testing."""
    generator = MagicMock()
    # Return consistent test embeddings
    generator.generate_recipe_embedding.return_value = [
        0.1, 0.2, 0.3, 0.4, 0.5,  # First 5 dimensions of embedding
    ] + [0.0] * 1531  # Fill rest to match 1536-dimensional embeddings
    return generator


@pytest.fixture
def mock_duplicate_detector():
    """Mock duplicate detector for testing."""
    detector = MagicMock()
    # By default, no duplicates found
    detector.is_duplicate.return_value = (False, None, 0.0)
    return detector


@pytest.fixture
def mock_google_search_results():
    """Create mock Google Search API results."""

    def _mock_results(count=10):
        """Return list of mock image URLs."""
        return [
            f"https://example.com/image{i}.jpg" for i in range(1, count + 1)
        ]

    return _mock_results


@pytest.fixture
def env_vars(aws_credentials):
    """Set required environment variables for testing."""
    with patch.dict(
        os.environ,
        {
            "S3_BUCKET": "test-bucket",
            "SEARCH_KEY": "test-search-key",
            "SEARCH_ID": "test-search-id",
            "API_KEY": "test-api-key",
        },
    ):
        yield


@pytest.fixture
def sample_recipe():
    """Sample recipe for testing."""
    return {
        "Title": "Test Recipe",
        "Ingredients": ["flour", "sugar", "eggs"],
        "Directions": ["Mix all ingredients", "Bake at 350F"],
        "Type": "dessert",
    }


@pytest.fixture
def sample_recipes_with_images():
    """Sample recipes that already have images assigned."""
    return {
        "1": {
            "Title": "Recipe 1",
            "image_url": "https://example.com/image1.jpg",
        },
        "2": {
            "Title": "Recipe 2",
            "image_url": "https://example.com/image2.jpg",
        },
        "3": {
            "Title": "Recipe 3",
            "image_url": "https://example.com/image3.jpg",
        },
    }

@pytest.fixture
def build_apigw_event():
    """
    Factory fixture to build API Gateway v2 HTTP API events.
    """
    def _builder(method, path, path_params=None, headers=None, body=None):
        if headers is None:
            headers = {}

        event = {
            "requestContext": {
                "http": {
                    "method": method,
                    "path": path,
                }
            },
            "pathParameters": path_params or {},
            "headers": headers
        }

        if body is not None:
            # If body is a dict, serialize it to JSON string as APIGW does
            if isinstance(body, (dict, list)):
                event["body"] = json.dumps(body)
            else:
                event["body"] = body

        return event

    return _builder


# Pytest configuration
def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )
