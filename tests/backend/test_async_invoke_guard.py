"""Guards for the async self-invoke handoff in routes.upload.handle_post_request.

Phase: 2026-04-07-audit-savorswipe/Phase-4
"""

import json
from unittest.mock import MagicMock

import pytest
from routes import upload as upload_route


@pytest.fixture
def stub_clients(monkeypatch):
    s3 = MagicMock()
    lam = MagicMock()
    monkeypatch.setattr(upload_route.lf, "S3", s3, raising=False)
    monkeypatch.setattr(upload_route.lf, "LAMBDA", lam, raising=False)
    monkeypatch.setenv("S3_BUCKET", "test-bucket")
    return s3, lam


def _event(body):
    return {"body": json.dumps(body)}


def test_missing_function_name_short_circuits_before_s3_write(
    stub_clients, monkeypatch
):
    s3, lam = stub_clients
    monkeypatch.delenv("FUNCTION_NAME", raising=False)

    resp = upload_route.handle_post_request(
        _event({"files": [{"data": "x", "type": "image/jpeg"}], "jobId": "j1"}), None
    )

    assert resp["statusCode"] == 500
    body = json.loads(resp["body"])
    assert body["success"] is False
    assert "FUNCTION_NAME" in body["error"]
    s3.put_object.assert_not_called()
    lam.invoke.assert_not_called()


def test_large_request_body_still_succeeds(stub_clients, monkeypatch):
    """A large request body (e.g. a real recipe photo) must not be rejected:
    the async invoke only ever carries {"async_processing", "job_id"}, never
    the file data, so nothing here scales with upload size."""
    s3, lam = stub_clients
    monkeypatch.setenv("FUNCTION_NAME", "test-fn")

    # ~270KB of base64-ish data, well past the old (wrong) 200_000-byte gate.
    big_body = {
        "files": [{"data": "A" * 270_000, "type": "image/jpeg"}],
        "jobId": "j2",
    }
    resp = upload_route.handle_post_request(_event(big_body), None)

    assert resp["statusCode"] == 202
    s3.put_object.assert_called()
    lam.invoke.assert_called_once()
    invoke_payload = json.loads(lam.invoke.call_args.kwargs["Payload"])
    assert invoke_payload == {"async_processing": True, "job_id": "j2"}


def test_happy_path_writes_pending_and_invokes(stub_clients, monkeypatch):
    s3, lam = stub_clients
    monkeypatch.setenv("FUNCTION_NAME", "test-fn")

    resp = upload_route.handle_post_request(
        _event({"files": [{"data": "x", "type": "image/jpeg"}], "jobId": "j3"}), None
    )

    assert resp["statusCode"] == 202
    # Two put_object calls: pending payload + initial status.
    assert s3.put_object.call_count == 2
    lam.invoke.assert_called_once()
    kwargs = lam.invoke.call_args.kwargs
    assert kwargs["FunctionName"] == "test-fn"
    assert kwargs["InvocationType"] == "Event"
