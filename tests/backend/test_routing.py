"""Tests for backend/routes.py and lambda_handler dispatch."""

from unittest.mock import patch

import pytest

from routes import dispatch, method_allowed_for_path


class TestRouteResolution:
    def test_get_recipes(self):
        result = dispatch("GET", "/recipes")
        assert result is not None
        assert result[0] == "handle_get_request"
        assert result[1] == {}

    def test_get_recipes_trailing_slash(self):
        result = dispatch("GET", "/recipes/")
        assert result is not None
        assert result[0] == "handle_get_request"

    def test_get_status(self):
        result = dispatch("GET", "/upload/status/abc123")
        assert result is not None
        assert result[0] == "handle_status_request"
        assert result[1] == {"jobId": "abc123"}

    def test_delete_recipe(self):
        result = dispatch("DELETE", "/recipe/my-recipe-key")
        assert result is not None
        assert result[0] == "handle_delete_request"
        assert result[1] == {"recipe_key": "my-recipe-key"}

    def test_post_recipe_image(self):
        result = dispatch("POST", "/recipe/my-key/image")
        assert result is not None
        assert result[0] == "handle_post_image_request"
        assert result[1] == {"recipe_key": "my-key"}

    def test_post_upload(self):
        result = dispatch("POST", "/recipe/upload")
        assert result is not None
        assert result[0] == "handle_post_request"

    def test_substring_false_positive_blocked(self):
        # /foo/image must NOT match /recipe/{key}/image
        result = dispatch("POST", "/foo/image")
        assert result is None

    def test_unknown_path(self):
        assert dispatch("GET", "/totally/unknown") is None

    def test_unknown_method_for_known_path(self):
        # PATCH on /recipes is not registered
        assert dispatch("PATCH", "/recipes") is None
        # but the path is otherwise known
        assert method_allowed_for_path("/recipes") is True

    def test_method_allowed_for_unknown_path(self):
        assert method_allowed_for_path("/nope") is False


class TestLambdaHandlerDispatch:
    def _event(self, method, path, body=None, path_params=None):
        return {
            "requestContext": {"http": {"method": method, "path": path}},
            "pathParameters": path_params or {},
            "body": body,
        }

    def test_dispatch_unknown_route_returns_404(self):
        from lambda_function import lambda_handler

        resp = lambda_handler(self._event("GET", "/nonexistent"), None)
        assert resp["statusCode"] == 404

    def test_dispatch_method_not_allowed(self):
        from lambda_function import lambda_handler

        resp = lambda_handler(self._event("PATCH", "/recipes"), None)
        assert resp["statusCode"] == 405

    def test_dispatch_recipe_image_routes_correctly(self):
        from lambda_function import lambda_handler

        with patch("lambda_function.handle_post_image_request") as mock_handler:
            mock_handler.return_value = {"statusCode": 200, "body": "{}"}
            lambda_handler(self._event("POST", "/recipe/abc/image"), None)
            mock_handler.assert_called_once()
            args = mock_handler.call_args.args
            # (event, context, recipe_key)
            assert args[2] == "abc"

    def test_dispatch_status_routes_correctly(self):
        from lambda_function import lambda_handler

        with patch("lambda_function.handle_status_request") as mock_handler:
            mock_handler.return_value = {"statusCode": 200, "body": "{}"}
            lambda_handler(self._event("GET", "/upload/status/job-42"), None)
            mock_handler.assert_called_once()
            assert mock_handler.call_args.args[2] == "job-42"

    def test_async_processing_short_circuits_dispatch(self):
        from lambda_function import lambda_handler

        with patch("lambda_function.handle_async_processing") as mock_async:
            mock_async.return_value = {"ok": True}
            event = {"async_processing": True, "job_id": "x"}
            result = lambda_handler(event, None)
            mock_async.assert_called_once()
            assert result == {"ok": True}
