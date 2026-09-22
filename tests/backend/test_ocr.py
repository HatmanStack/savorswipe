"""Regression tests for backend/ocr.py model id selection."""

import json
from unittest.mock import MagicMock, patch

import config
import httpx2
import ocr
import pytest
from openai import BadRequestError


def _temperature_rejected_error():
    request = httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")
    response = httpx2.Response(400, request=request)
    return BadRequestError(
        "Unsupported value: 'temperature' does not support 0.0 with this model.",
        response=response,
        body={
            "message": "unsupported temperature",
            "param": "temperature",
            "code": "unsupported_value",
        },
    )


def _build_mock_response(
    content: str = '{"Title": "Test"}', finish_reason: str = "stop"
):
    response = MagicMock()
    choice = MagicMock()
    choice.message.content = content
    choice.finish_reason = finish_reason
    response.choices = [choice]
    return response


@pytest.fixture
def mock_openai_client():
    client = MagicMock()
    client.chat.completions.create.return_value = _build_mock_response()
    with patch.object(ocr, "get_client", return_value=client):
        yield client


def test_extract_recipe_data_uses_configured_model(mock_openai_client):
    ocr.extract_recipe_data("base64data")
    kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
    assert kwargs["model"] == config.OPENAI_VISION_MODEL
    assert kwargs["model"] != "gpt-5.2"


def test_parse_json_uses_configured_model(mock_openai_client):
    mock_openai_client.chat.completions.create.return_value = _build_mock_response(
        content=json.dumps(
            {"Title": "T", "Ingredients": {"a": "b"}, "Directions": {"1": "x"}}
        )
    )
    ocr.parseJSON([{"Title": "T"}])
    kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
    assert kwargs["model"] == config.OPENAI_VISION_MODEL


def test_complete_recipe_with_gpt_uses_configured_model(mock_openai_client):
    ocr.complete_recipe_with_gpt('{"Title":"x"}', "base64data")
    kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
    assert kwargs["model"] == config.OPENAI_VISION_MODEL


def test_default_model_is_gpt_4o():
    assert config.OPENAI_VISION_MODEL == "gpt-4o"


def test_create_completion_retries_without_temperature_on_rejection():
    """Some models (e.g. gpt-5.6-luna) only support the default temperature and
    reject any explicit value with a 400 unsupported_value error."""
    client = MagicMock()
    client.chat.completions.create.side_effect = [
        _temperature_rejected_error(),
        _build_mock_response(),
    ]
    with patch.object(ocr, "get_client", return_value=client):
        response = ocr.create_completion(
            model="gpt-5.6-luna", temperature=0.0, messages=[]
        )

    assert response.choices[0].message.content == '{"Title": "Test"}'
    assert client.chat.completions.create.call_count == 2
    first_kwargs = client.chat.completions.create.call_args_list[0].kwargs
    second_kwargs = client.chat.completions.create.call_args_list[1].kwargs
    assert first_kwargs["temperature"] == 0.0
    assert "temperature" not in second_kwargs
    assert second_kwargs["model"] == "gpt-5.6-luna"


def test_create_completion_reraises_other_bad_request_errors():
    """A 400 unrelated to temperature must not be swallowed by the retry."""
    request = httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")
    response = httpx2.Response(400, request=request)
    other_error = BadRequestError(
        "Invalid image URL",
        response=response,
        body={"message": "invalid image", "param": "messages", "code": "invalid_value"},
    )
    client = MagicMock()
    client.chat.completions.create.side_effect = other_error
    with patch.object(ocr, "get_client", return_value=client):
        with pytest.raises(BadRequestError):
            ocr.create_completion(model="gpt-4o", temperature=0.0, messages=[])

    assert client.chat.completions.create.call_count == 1
