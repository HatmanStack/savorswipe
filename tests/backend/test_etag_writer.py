"""Tests for backend.services.etag_writer.write_with_etag."""

import io
import json
from unittest.mock import MagicMock

from botocore.exceptions import ClientError

from services.etag_writer import write_with_etag


def _get_response(payload, etag="abc"):
    return {
        "Body": io.BytesIO(json.dumps(payload).encode("utf-8")),
        "ETag": f'"{etag}"',
    }


def _client_error(code):
    return ClientError({"Error": {"Code": code, "Message": code}}, "PutObject")


def _get_client_error(code):
    return ClientError({"Error": {"Code": code, "Message": code}}, "GetObject")


def test_write_with_etag_success_first_try():
    s3 = MagicMock()
    s3.get_object.return_value = _get_response({"a": 1})
    s3.put_object.return_value = {}
    cleanup = MagicMock()

    result = write_with_etag(
        s3, "bucket", "key.json", lambda d: {**d, "b": 2}, cleanup_fn=cleanup
    )

    assert result.success is True
    assert result.data == {"a": 1, "b": 2}
    assert result.attempts == 1
    cleanup.assert_not_called()
    # Verify IfMatch was sent
    _, kwargs = s3.put_object.call_args
    assert kwargs["IfMatch"] == "abc"


def test_write_with_etag_success_after_one_conflict():
    s3 = MagicMock()
    s3.get_object.side_effect = [
        _get_response({"v": 1}, etag="e1"),
        _get_response({"v": 1}, etag="e2"),
    ]
    s3.put_object.side_effect = [_client_error("PreconditionFailed"), {}]
    cleanup = MagicMock()

    result = write_with_etag(
        s3,
        "bucket",
        "key.json",
        lambda d: {**d, "v": d["v"] + 1},
        cleanup_fn=cleanup,
        sleep_fn=lambda _s: None,
        rand_fn=lambda a, b: 0.0,
    )

    assert result.success is True
    assert result.attempts == 2
    cleanup.assert_not_called()


def test_write_with_etag_exhausts_retries_invokes_cleanup_once():
    s3 = MagicMock()
    s3.get_object.side_effect = [_get_response({"v": 1}) for _ in range(3)]
    s3.put_object.side_effect = _client_error("PreconditionFailed")
    cleanup = MagicMock()

    result = write_with_etag(
        s3,
        "bucket",
        "key.json",
        lambda d: d,
        cleanup_fn=cleanup,
        sleep_fn=lambda _s: None,
        rand_fn=lambda a, b: 0.0,
    )

    assert result.success is False
    assert result.attempts == 3
    cleanup.assert_called_once()


def test_write_with_etag_not_found_returns_without_cleanup():
    s3 = MagicMock()
    s3.get_object.side_effect = _get_client_error("NoSuchKey")
    cleanup = MagicMock()

    result = write_with_etag(
        s3, "bucket", "key.json", lambda d: d, cleanup_fn=cleanup
    )

    assert result.success is False
    assert result.not_found is True
    cleanup.assert_not_called()


def test_write_with_etag_mutate_fn_keyerror_signals_not_found():
    s3 = MagicMock()
    s3.get_object.return_value = _get_response({"recipes": {}})
    cleanup = MagicMock()

    def mutate(_data):
        raise KeyError("recipe_xyz")

    result = write_with_etag(
        s3, "bucket", "key.json", mutate, cleanup_fn=cleanup
    )

    assert result.success is False
    assert result.not_found is True
    cleanup.assert_not_called()


def test_write_with_etag_other_put_error_invokes_cleanup():
    s3 = MagicMock()
    s3.get_object.return_value = _get_response({"v": 1})
    s3.put_object.side_effect = _client_error("InternalError")
    cleanup = MagicMock()

    result = write_with_etag(
        s3, "bucket", "key.json", lambda d: d, cleanup_fn=cleanup
    )

    assert result.success is False
    assert result.not_found is False
    cleanup.assert_called_once()
