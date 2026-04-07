"""POST /recipe/{recipe_key}/image — assign a chosen Google image to a recipe."""

from __future__ import annotations

import ipaddress
import json
import os
import socket
import urllib.parse
from typing import Optional, Tuple

from botocore.exceptions import ClientError

from logger import get_logger
from services.etag_writer import write_with_etag


class _LFProxy:
    def __getattr__(self, name):
        import lambda_function  # noqa: PLC0415

        return getattr(lambda_function, name)


lf = _LFProxy()

log = get_logger("routes.recipe_image")


def _validate_image_url_for_api(image_url: str) -> Tuple[bool, Optional[str]]:
    """Validate the user-supplied URL: HTTPS scheme + public IP only."""
    try:
        parsed = urllib.parse.urlparse(image_url)
        if parsed.scheme != "https":
            return False, f"Invalid scheme: {parsed.scheme} (only HTTPS allowed)"

        hostname = parsed.hostname
        if not hostname:
            return False, "URL has no hostname"

        try:
            ip_str = socket.gethostbyname(hostname)
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
            ):
                return False, f"Refusing to fetch private/reserved IP: {hostname} -> {ip_str}"
            log.info("URL validation passed", hostname=hostname, ip=ip_str)
            return True, None
        except (socket.gaierror, socket.error) as e:
            return False, f"Failed to resolve hostname {hostname}: {str(e)}"
    except Exception as e:
        return False, f"Error validating URL: {str(e)}"


def _err(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"success": False, "error": message}),
    }


def handle_post_image_request(event, context, recipe_key=None):
    bucket_name = os.getenv("S3_BUCKET")
    if not bucket_name:
        return _err(500, "S3_BUCKET environment variable not set")
    if not recipe_key:
        return _err(400, "Missing recipe_key parameter")

    log.info("Post-image request received", recipe_key=recipe_key)

    # Parse body
    try:
        body_content = event.get("body")
        body = json.loads(body_content) if body_content else event
    except json.JSONDecodeError as e:
        log.error("JSON decode error", error=str(e))
        return _err(400, f"Invalid JSON in request body: {str(e)}")

    image_url = body.get("imageUrl", "")
    if not image_url:
        return _err(400, "imageUrl is required")

    is_valid, validation_error = _validate_image_url_for_api(image_url)
    if not is_valid:
        log.warning("URL validation failed", error=validation_error)
        return _err(400, f"Invalid image URL: {validation_error}")

    # Verify the URL is one of this recipe's search results.
    s3_client = lf.S3
    try:
        response = s3_client.get_object(Bucket=bucket_name, Key="jsondata/combined_data.json")
        json_data = json.loads(response["Body"].read())
        recipe = json_data.get(recipe_key)
        if not recipe or "image_search_results" not in recipe:
            log.warning("Recipe not found or has no search results", recipe_key=recipe_key)
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"success": False, "error": "Recipe not found"}),
            }
        if image_url not in recipe.get("image_search_results", []):
            log.warning("Image URL not in recipe's search results")
            return _err(400, "Image URL is not from this recipe's search results")
    except ClientError as e:
        log.error("Error validating image URL against search results", error=str(e))
        return _err(500, "Failed to validate image selection")

    log.info(
        "Fetching and uploading image",
        host=urllib.parse.urlparse(image_url).netloc,
        url_length=len(image_url),
    )

    s3_path = None
    try:
        image_bytes, content_type = lf.fetch_image_from_url(image_url)
        if image_bytes is None:
            log.error("Failed to fetch image from URL")
            return _err(500, "Failed to fetch image from the provided URL")

        log.info("Image fetched", size_bytes=len(image_bytes), content_type=content_type)

        s3_path, error_msg = lf.upload_image_to_s3(
            recipe_key, image_bytes, s3_client, bucket_name, content_type=content_type
        )
        if s3_path is None:
            log.error("Failed to upload image to S3", error=error_msg)
            return _err(500, f"Failed to upload image to S3: {error_msg}")

        log.info("Image uploaded successfully", s3_path=s3_path)

        captured_path = s3_path  # avoid late-binding closure capture

        def cleanup_orphaned_image():
            try:
                log.warning(
                    "Cleaning up orphaned image after JSON update failure",
                    image_key=captured_path,
                )
                s3_client.delete_object(Bucket=bucket_name, Key=captured_path)
            except Exception as cleanup_err:
                log.error(
                    "Failed to clean up orphaned image",
                    image_key=captured_path,
                    error=str(cleanup_err),
                )

        def mutate(json_data):
            if recipe_key not in json_data:
                raise KeyError(recipe_key)
            new_data = dict(json_data)
            updated_recipe = dict(json_data[recipe_key])
            updated_recipe["image_url"] = image_url
            new_data[recipe_key] = updated_recipe
            return new_data

        result = write_with_etag(
            s3_client,
            bucket_name,
            "jsondata/combined_data.json",
            mutate,
            cleanup_fn=cleanup_orphaned_image,
        )

        if result.success:
            updated_recipe = result.data[recipe_key]
            log.info(
                "Updated recipe with image_url",
                recipe_key=recipe_key,
                image_host=urllib.parse.urlparse(image_url).hostname,
            )
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps(
                    {
                        "success": True,
                        "message": "Image saved and recipe updated",
                        "recipe": updated_recipe,
                    }
                ),
            }

        if result.not_found:
            # KeyError or NoSuchKey path — orphan cleanup not invoked, do it here
            cleanup_orphaned_image()
            if result.error == "NoSuchKey":
                return _err(404, "Recipe data not found")
            return _err(404, f"Recipe {recipe_key} not found")

        if result.error == "PreconditionFailed":
            return _err(500, "Failed to update recipe after multiple retries")
        return _err(500, f"Failed to update recipe: {result.error}")

    except Exception as e:
        log.error("Unexpected error processing image", error=str(e))
        if s3_path:
            try:
                log.warning(
                    "Cleaning up orphaned image after unexpected error", image_key=s3_path
                )
                s3_client.delete_object(Bucket=bucket_name, Key=s3_path)
            except Exception as cleanup_err:
                log.error(
                    "Failed to clean up orphaned image",
                    image_key=s3_path,
                    error=str(cleanup_err),
                )
        return _err(500, f"Failed to process image: {str(e)}")
