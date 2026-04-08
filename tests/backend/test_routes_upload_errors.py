"""
Error-accounting tests for routes.upload.process_upload_files.

Validates that ParseJSON failures, position->key mapping misses, and
per-recipe wall-clock timeouts surface into the ``file_errors`` list
returned in the response body, instead of being silently swallowed.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from routes import upload as upload_route


@pytest.fixture
def stub_s3():
    s3 = MagicMock()
    # No existing combined_data on first load.
    s3.exceptions.NoSuchKey = type("NoSuchKey", (Exception,), {})

    def get_object(Bucket, Key):  # noqa: N803
        raise s3.exceptions.NoSuchKey()

    s3.get_object.side_effect = get_object
    s3.put_object.return_value = {}
    return s3


def _body(file_count=1):
    return {"files": [{"data": "dGVzdA==", "type": "image/jpeg"}] * file_count}


def _setup_pipeline(stub_s3, monkeypatch):
    """Patch the heavy collaborators of process_upload_files."""
    monkeypatch.setattr(upload_route.lf, "S3", stub_s3, raising=False)
    monkeypatch.setattr(upload_route.lf, "CLOUDWATCH", MagicMock(), raising=False)

    embedding_store = MagicMock()
    embedding_store.load_embeddings.return_value = ({}, None)
    monkeypatch.setattr(upload_route.lf, "EmbeddingStore", lambda *_a, **_k: embedding_store)
    monkeypatch.setattr(upload_route.lf, "EmbeddingGenerator", MagicMock())
    return embedding_store


def test_parse_json_failure_surfaces_into_file_errors(stub_s3, monkeypatch):
    _setup_pipeline(stub_s3, monkeypatch)

    # _extract_recipes_from_files returns a recipe so we reach parseJSON.
    monkeypatch.setattr(
        upload_route,
        "_extract_recipes_from_files",
        lambda files, file_errors: [({"Title": "x"}, 0)],
    )
    with patch("ocr.parseJSON", side_effect=RuntimeError("boom")):
        result = upload_route.process_upload_files(_body(), "job-1", "test-bucket")

    body = json.loads(result["body"])
    assert any(e.get("stage") == "parse_json" for e in body["errors"])


def test_position_to_key_mapping_miss_surfaces(stub_s3, monkeypatch):
    _setup_pipeline(stub_s3, monkeypatch)

    monkeypatch.setattr(
        upload_route,
        "_extract_recipes_from_files",
        lambda files, file_errors: [({"Title": "x"}, 0)],
    )
    # Make process_single_recipe return a successful tuple so we hit batch upload.
    monkeypatch.setattr(
        upload_route,
        "process_single_recipe",
        lambda recipe, eg, dd: (recipe, [0.1] * 1536, ["https://example.com/a.jpg"], None),
    )
    # batch_to_s3_atomic returns an empty position_to_key map -> miss for position 0
    with patch("ocr.parseJSON", return_value=json.dumps([{"Title": "x"}])), patch(
        "upload.batch_to_s3_atomic",
        return_value=({"k": "v"}, ["k"], {}, []),
    ), patch("search_image.extract_used_image_urls", return_value=set()):
        result = upload_route.process_upload_files(_body(), "job-2", "test-bucket")

    body = json.loads(result["body"])
    assert any(e.get("stage") == "mapping" for e in body["errors"])


def test_per_recipe_wall_clock_budget_surfaces_timeout(stub_s3, monkeypatch):
    _setup_pipeline(stub_s3, monkeypatch)
    monkeypatch.setattr(upload_route, "RECIPE_BUDGET_SECONDS", 0.0)
    monkeypatch.setattr(
        upload_route,
        "_extract_recipes_from_files",
        lambda files, file_errors: [({"Title": "slow"}, 0)],
    )

    def slow(recipe, eg, dd):
        return recipe, [0.1] * 1536, ["https://example.com/a.jpg"], None

    monkeypatch.setattr(upload_route, "process_single_recipe", slow)

    # Force the elapsed-time check to trip by patching time.time used inside
    # the as_completed loop. Easier: budget=0 already trips since elapsed > 0.
    with patch("ocr.parseJSON", return_value=json.dumps([{"Title": "slow"}])), patch(
        "search_image.extract_used_image_urls", return_value=set()
    ):
        result = upload_route.process_upload_files(_body(), "job-3", "test-bucket")

    body = json.loads(result["body"])
    assert any(e.get("stage") == "timeout" for e in body["errors"])
