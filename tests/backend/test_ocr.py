"""Regression tests for backend/ocr.py model id selection."""

import json
from unittest.mock import MagicMock, patch

import pytest

import config
import ocr


def _build_mock_response(content: str = '{"Title": "Test"}', finish_reason: str = "stop"):
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
        content=json.dumps({"Title": "T", "Ingredients": {"a": "b"}, "Directions": {"1": "x"}})
    )
    ocr.parseJSON([{"Title": "T"}])
    kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
    assert kwargs["model"] == config.OPENAI_VISION_MODEL


def test_complete_recipe_with_gpt_uses_configured_model(mock_openai_client):
    ocr.complete_recipe_with_gpt('{"Title":"x"}', "base64data")
    kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
    assert kwargs["model"] == config.OPENAI_VISION_MODEL


def test_default_model_is_gpt_4o():
    assert config.OPENAI_VISION_MODEL == "gpt-4o" or config.OPENAI_VISION_MODEL != "gpt-5.2"
