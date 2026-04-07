"""
Module-scope AWS client singletons.

Boto3 client construction is expensive (200-400ms) and re-creating clients
on every Lambda invocation defeats container reuse. Constructing them at
module import time means they live as long as the warm Lambda container.

Tests should patch these singletons (e.g. via monkeypatch) after entering
moto's ``mock_aws()`` context so that subsequent calls hit the mock.
"""

import os

import boto3

# Lambda always provides AWS_REGION; default to us-east-1 for tests/local.
_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"

S3 = boto3.client("s3", region_name=_REGION)
LAMBDA = boto3.client("lambda", region_name=_REGION)
CLOUDWATCH = boto3.client("cloudwatch", region_name=_REGION)
