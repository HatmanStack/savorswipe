"""
Embedding Storage Module with Optimistic Locking

Manages recipe embeddings in S3 with race condition protection using S3 ETags
for optimistic locking.
"""

import boto3
import json
import time
import random
from botocore.exceptions import ClientError
from typing import Dict, List, Optional, Tuple


class EmbeddingStore:
    """Manages recipe embeddings in S3 with optimistic locking."""

    EMBEDDINGS_KEY: str = 'jsondata/recipe_embeddings.json'
    MAX_RETRIES: int = 3

    def __init__(self, bucket_name: str) -> None:
        """
        Initialize the embedding store.

        Args:
            bucket_name: Name of the S3 bucket
        """
        self.bucket_name = bucket_name
        self.s3_client = boto3.client('s3')

    def load_embeddings(self) -> Tuple[Dict[str, List[float]], Optional[str]]:
        """
        Load embeddings from S3 with ETag.

        Returns:
            Tuple of (embeddings dict, ETag string) or ({}, None) if file doesn't exist
        """
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=self.EMBEDDINGS_KEY
            )

            # Parse JSON body
            body = response['Body'].read()
            embeddings = json.loads(body)

            # Extract and clean ETag (remove quotes)
            etag = response['ETag'].strip('"')

            return embeddings, etag

        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                # File doesn't exist yet
                return {}, None
            raise

    def save_embeddings(
        self,
        embeddings: Dict[str, List[float]],
        etag: Optional[str] = None
    ) -> bool:
        """
        Save embeddings to S3 with optional conditional write.

        Args:
            embeddings: Dictionary mapping recipe keys to embedding vectors
            etag: Optional ETag for conditional write (optimistic locking)

        Returns:
            True if successful, False if precondition failed (conflict)

        Raises:
            ClientError for non-conflict errors
        """
        try:
            # Serialize embeddings to JSON
            body = json.dumps(embeddings)

            # Build parameters
            params = {
                'Bucket': self.bucket_name,
                'Key': self.EMBEDDINGS_KEY,
                'Body': body,
                'ContentType': 'application/json'
            }

            # Add conditional write if ETag provided
            if etag is not None:
                params['IfMatch'] = etag

            # Attempt write
            self.s3_client.put_object(**params)  # type: ignore
            return True

        except ClientError as e:
            if e.response['Error']['Code'] == 'PreconditionFailed':
                # Write conflict - another process modified the file
                return False
            # Re-raise other errors
            raise

    def add_embeddings(self, new_embeddings: Dict[str, List[float]]) -> bool:
        """
        Add new embeddings to existing embeddings with retry logic.

        Uses optimistic locking to handle concurrent writes safely.

        Args:
            new_embeddings: Dictionary of new recipe embeddings to add

        Returns:
            True if successful, False if max retries exceeded
        """
        for attempt in range(self.MAX_RETRIES):
            # Load existing embeddings with ETag
            existing_embeddings, etag = self.load_embeddings()

            # Merge new embeddings into existing
            merged_embeddings = {**existing_embeddings, **new_embeddings}

            # Attempt conditional write
            success = self.save_embeddings(merged_embeddings, etag)

            if success:
                return True

            # Conflict detected - retry with exponential backoff
            if attempt < self.MAX_RETRIES - 1:
                delay = random.uniform(0.1, 0.5) * (2 ** attempt)
                time.sleep(delay)

        # Max retries exceeded
        return False
