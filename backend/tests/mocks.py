"""
Mock implementations for testing backend services.

Provides mock classes for S3 operations, embeddings, and other services.
"""

from typing import Dict, List, Optional, Set
import json


class MockS3Response:
    """Mock S3 response object."""

    def __init__(self, data: Optional[Dict] = None, status_code: int = 200):
        self.data = data or {}
        self.status_code = status_code
        self.etag = '"mock-etag-12345"'

    def read(self) -> bytes:
        """Return JSON encoded data."""
        return json.dumps(self.data).encode("utf-8")

    def __getitem__(self, key):
        """Support dict-like access."""
        if key == "Body":
            return self
        if key == "ETag":
            return self.etag
        if key == "ContentLength":
            return len(self.read())
        return None


class MockS3Client:
    """Mock S3 client for testing."""

    def __init__(self):
        self.buckets: Dict[str, Dict[str, bytes]] = {}

    def create_bucket(self, Bucket: str, **kwargs):
        """Create a mock bucket."""
        if Bucket not in self.buckets:
            self.buckets[Bucket] = {}

    def put_object(
        self, Bucket: str, Key: str, Body: Optional[bytes] = None, **kwargs
    ):
        """Put object into mock bucket."""
        if Bucket not in self.buckets:
            self.buckets[Bucket] = {}
        if isinstance(Body, str):
            Body = Body.encode("utf-8")
        self.buckets[Bucket][Key] = Body or b""
        return {"ETag": '"mock-etag-12345"'}

    def get_object(self, Bucket: str, Key: str, **kwargs):
        """Get object from mock bucket."""
        if Bucket not in self.buckets or Key not in self.buckets[Bucket]:
            raise Exception(f"NoSuchKey: {Key}")

        data_bytes = self.buckets[Bucket][Key]
        # Try to parse as JSON if possible
        try:
            data = json.loads(data_bytes.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            data = data_bytes

        return {
            "Body": MockS3ResponseBody(data_bytes),
            "ETag": '"mock-etag-12345"',
            "ContentLength": len(data_bytes),
        }

    def list_objects_v2(self, Bucket: str, Prefix: str = "", **kwargs):
        """List objects in mock bucket."""
        if Bucket not in self.buckets:
            return {"Contents": []}

        contents = []
        for key in self.buckets[Bucket].keys():
            if key.startswith(Prefix):
                contents.append({"Key": key})

        return {"Contents": contents}

    def exceptions(self):
        """Return exceptions namespace."""
        return type("Exceptions", (), {
            "NoSuchKey": type("NoSuchKey", (Exception,), {}),
        })()


class MockS3ResponseBody:
    """Mock S3 response body."""

    def __init__(self, data: bytes):
        self._data = data

    def read(self) -> bytes:
        """Read response body."""
        return self._data

    def decode(self, encoding: str = "utf-8") -> str:
        """Decode response body."""
        return self._data.decode(encoding)


def mock_google_search_results(count: int = 10) -> List[str]:
    """Return mock Google Search API results.

    Args:
        count: Number of results to return

    Returns:
        List of mock image URLs
    """
    return [f"https://google-cdn.example.com/image{i}.jpg" for i in range(1, count + 1)]


def mock_recipe_embedding(recipe_id: int = 1) -> List[float]:
    """Return mock recipe embedding.

    Args:
        recipe_id: Recipe ID for consistent embeddings

    Returns:
        1536-dimensional embedding vector
    """
    # Create a simple but consistent embedding based on recipe_id
    base_value = recipe_id * 0.1
    return [base_value + (i * 0.001) for i in range(1536)]
